import { MLToolkit, NLU } from 'botpress/sdk'
import crypto from 'crypto'
import _ from 'lodash'

import { initializeTools } from './initialize-tools'
import { deserializeModel, PredictableModel, serializeModel } from './model-manager'
import { Predict, PredictInput, Predictors, PredictOutput } from './predict-pipeline'
import SlotTagger from './slots/slot-tagger'
import { isPatternValid } from './tools/patterns-utils'
import { computeKmeans, ProcessIntents, TrainInput, TrainOutput } from './training-pipeline'
import { TrainingCanceledError, TrainingWorkerQueue } from './training-worker-queue'
import { ComplexEntity, Intent, ListEntity, PatternEntity, Tools } from './typings'

const trainDebug = DEBUG('nlu').sub('training')

export default class Engine implements NLU.Engine {
  private static _tools: Tools
  private static _trainingWorkerQueue: TrainingWorkerQueue

  private predictorsByLang: _.Dictionary<Predictors> = {}
  private modelsByLang: _.Dictionary<PredictableModel> = {}

  constructor(private defaultLanguage: string, private botId: string, private logger: NLU.Logger) {}

  // NOTE: removed private in order to prevent important refactor (which will be done later)
  public static get tools() {
    return this._tools
  }

  public static getHealth() {
    return this._tools.getHealth()
  }

  public static getLanguages() {
    return this._tools.getLanguages()
  }

  public static getVersionInfo() {
    return this._tools.getVersionInfo()
  }

  public static async initialize(config: NLU.Config, logger: NLU.Logger): Promise<void> {
    this._tools = await initializeTools(config, logger)
    const version = this._tools.getVersionInfo()
    if (!version.nluVersion.length || !version.langServerInfo.version.length) {
      logger.warning('Either the nlu version or the lang server version is not set correctly.')
    }

    this._trainingWorkerQueue = new TrainingWorkerQueue(config, logger)
  }

  public hasModel(language: string, hash: string) {
    return this.modelsByLang[language]?.hash === hash
  }

  // we might want to make this language specific
  public computeModelHash(intents: NLU.IntentDefinition[], entities: NLU.EntityDefinition[], lang: string): string {
    const { nluVersion, langServerInfo } = Engine._tools.getVersionInfo()

    const singleLangIntents = intents.map(i => ({ ...i, utterances: i.utterances[lang] }))

    return crypto
      .createHash('md5')
      .update(JSON.stringify({ singleLangIntents, entities, nluVersion, langServerInfo }))
      .digest('hex')
  }

  async train(
    trainSessionId: string,
    intentDefs: NLU.IntentDefinition[],
    entityDefs: NLU.EntityDefinition[],
    languageCode: string,
    options: NLU.TrainingOptions
  ): Promise<NLU.Model | undefined> {
    trainDebug.forBot(this.botId, `Started ${languageCode} training`)

    const list_entities = entityDefs
      .filter(ent => ent.type === 'list')
      .map(e => {
        return {
          name: e.name,
          fuzzyTolerance: e.fuzzy,
          sensitive: e.sensitive,
          synonyms: _.chain(e.occurrences)
            .keyBy('name')
            .mapValues('synonyms')
            .value()
        } as ListEntity
      })

    const pattern_entities: PatternEntity[] = entityDefs
      .filter(ent => ent.type === 'pattern' && isPatternValid(ent.pattern))
      .map(ent => ({
        name: ent.name,
        pattern: ent.pattern!,
        examples: ent.examples ?? [],
        matchCase: !!ent.matchCase,
        sensitive: !!ent.sensitive
      }))

    const complex_entities = entityDefs
      .filter(ent => ent.type === 'complex')
      .map(e => {
        return {
          name: e.name,
          examples: e.examples || [],
          list_entities: e.list_entities ?? [],
          pattern_entities: e.pattern_entities ?? []
        } as ComplexEntity
      })

    const contexts = _.chain(intentDefs)
      .flatMap(i => i.contexts)
      .uniq()
      .value()

    const intents: Intent<string>[] = intentDefs
      .filter(x => !!x.utterances[languageCode])
      .map(x => ({
        name: x.name,
        contexts: x.contexts,
        utterances: x.utterances[languageCode],
        slot_definitions: x.slots
      }))

    const previousModel = this.modelsByLang[languageCode]
    let trainAllCtx = options?.forceTrain || !previousModel
    let ctxToTrain = contexts

    if (!trainAllCtx) {
      const previousIntents = previousModel.data.input.intents
      const ctxHasChanged = this._ctxHasChanged(previousIntents, intents)
      const modifiedCtx = contexts.filter(ctxHasChanged)

      trainAllCtx = modifiedCtx.length === contexts.length
      ctxToTrain = trainAllCtx ? contexts : modifiedCtx
    }

    const debugMsg = trainAllCtx
      ? `Training all contexts for language: ${languageCode}`
      : `Retraining only contexts: [${ctxToTrain}] for language: ${languageCode}`
    trainDebug.forBot(this.botId, debugMsg)

    const input: TrainInput = {
      botId: this.botId,
      languageCode,
      list_entities,
      pattern_entities,
      complex_entities,
      contexts,
      intents,
      ctxToTrain
    }

    const hash = this.computeModelHash(intentDefs, entityDefs, languageCode)
    const model = await this._trainAndMakeModel(trainSessionId, input, hash, options.progressCallback)

    if (!model) {
      return
    }

    if (!trainAllCtx) {
      model.data.output = _.merge({}, previousModel.data.output, model.data.output)
      model.data.output.slots_model = new Buffer(model.data.output.slots_model) // lodash merge messes up buffers
    }

    trainDebug.forBot(this.botId, `Successfully finished ${languageCode} training`)

    return serializeModel(model)
  }

  cancelTraining(trainSessionId: string): Promise<void> {
    return Engine._trainingWorkerQueue.cancelTraining(trainSessionId)
  }

  private async _trainAndMakeModel(
    trainSessionId: string,
    input: TrainInput,
    hash: string,
    progressCallback: (progress: number) => void
  ): Promise<PredictableModel | undefined> {
    const startedAt = new Date()
    let output: TrainOutput | undefined

    try {
      output = await Engine._trainingWorkerQueue.startTraining(trainSessionId, input, progressCallback)
    } catch (err) {
      if (err instanceof TrainingCanceledError) {
        this.logger.info('Training cancelled')
        return
      }
      this.logger.error('Could not finish training NLU model', err)
      return
    }

    if (!output) {
      return
    }

    return {
      startedAt,
      finishedAt: new Date(),
      languageCode: input.languageCode,
      hash,
      data: {
        input,
        output
      }
    }
  }

  private modelAlreadyLoaded(model: NLU.Model) {
    if (!model?.languageCode) {
      return false
    }
    const lang = model.languageCode

    return (
      !!this.predictorsByLang[lang] &&
      !!this.modelsByLang[lang] &&
      !!this.modelsByLang[lang].hash &&
      !!model.hash &&
      this.modelsByLang[lang].hash === model.hash
    )
  }

  async loadModel(serialized: NLU.Model | undefined) {
    if (!serialized || this.modelAlreadyLoaded(serialized)) {
      return
    }

    const model = deserializeModel(serialized)

    const { input, output } = model.data

    const trainOutput = output as TrainOutput

    this.predictorsByLang[model.languageCode] = await this._makePredictors(input, trainOutput)
    this.modelsByLang[model.languageCode] = model
  }

  private async _makePredictors(input: TrainInput, output: TrainOutput): Promise<Predictors> {
    const tools = Engine._tools

    const intents = await ProcessIntents(
      input.intents,
      input.languageCode,
      output.list_entities,
      input.list_entities,
      input.pattern_entities,
      input.complex_entities,
      Engine._tools
    )

    if (_.flatMap(input.intents, i => i.utterances).length <= 0) {
      // we don't want to return undefined as extraction won't be triggered
      // we want to make it possible to extract entities without having any intents
      return {
        ...output,
        intents,
        pattern_entities: input.pattern_entities
      }
    }

    const { ctx_model, intent_model_by_ctx, oos_model } = output
    const ctx_classifier = ctx_model ? new tools.mlToolkit.SVM.Predictor(ctx_model) : undefined
    const intent_classifier_per_ctx = _.toPairs(intent_model_by_ctx).reduce(
      (c, [ctx, intentModel]) => ({ ...c, [ctx]: new tools.mlToolkit.SVM.Predictor(intentModel as string) }),
      {} as _.Dictionary<MLToolkit.SVM.Predictor>
    )
    const oos_classifier = _.toPairs(oos_model).reduce(
      (c, [ctx, mod]) => ({ ...c, [ctx]: new tools.mlToolkit.SVM.Predictor(mod) }),
      {} as _.Dictionary<MLToolkit.SVM.Predictor>
    )
    const slot_tagger = new SlotTagger(tools.mlToolkit)
    slot_tagger.load(output.slots_model)

    const kmeans = computeKmeans(intents!, tools) // TODO load from artefacts when persisted

    return {
      ...output,
      intents,
      ctx_classifier,
      oos_classifier_per_ctx: oos_classifier,
      intent_classifier_per_ctx,
      slot_tagger,
      kmeans,
      pattern_entities: input.pattern_entities
    }
  }

  async predict(sentence: string, includedContexts: string[]): Promise<PredictOutput> {
    const input: PredictInput = {
      defaultLanguage: this.defaultLanguage,
      sentence,
      includedContexts
    }

    // error handled a level higher
    return Predict(input, Engine._tools, this.predictorsByLang)
  }

  private _ctxHasChanged = (previousIntents: Intent<string>[], currentIntents: Intent<string>[]) => (ctx: string) => {
    const prevHash = this._computeCtxHash(previousIntents, ctx)
    const currHash = this._computeCtxHash(currentIntents, ctx)
    return prevHash !== currHash
  }

  private _computeCtxHash = (intents: Intent<string>[], ctx: string) => {
    const intentsOfCtx = intents.filter(i => i.contexts.includes(ctx))
    return crypto
      .createHash('md5')
      .update(JSON.stringify(intentsOfCtx))
      .digest('hex')
  }
}
