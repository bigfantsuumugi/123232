import { Logger, MLToolkit, NLU } from 'botpress/sdk'
import _ from 'lodash'

import { isPatternValid } from '../tools/patterns-utils'
import { Engine2, EntityExtractor, ListEntity, TrainingSession } from '../typings'

import CRFExtractor2 from './crf-extractor2'
import { Model } from './model-service'
import { Predict, PredictInput, Predictors, PredictOutput } from './predict-pipeline'
import { computeKmeans, ProcessIntents, Trainer, TrainInput, TrainOutput } from './training-pipeline'

export interface Tools {
  tokenize_utterances(utterances: string[], languageCode: string): Promise<string[][]>
  vectorize_tokens(tokens: string[], languageCode: string): Promise<number[][]>
  generateSimilarJunkWords(vocabulary: string[], languageCode: string): Promise<string[]>
  reportTrainingProgress(botId: string, message: string, trainSession: TrainingSession): void
  ducklingExtractor: EntityExtractor
  mlToolkit: typeof MLToolkit
}

export default class E2 implements Engine2 {
  private static tools: Tools
  private predictorsByLang: _.Dictionary<Predictors> = {}
  private modelsByLang: _.Dictionary<Model> = {}

  constructor(private defaultLanguage: string, private botId: string, private logger: Logger) {}

  static provideTools(tools: Tools) {
    E2.tools = tools
  }

  async train(
    intentDefs: NLU.IntentDefinition[],
    entityDefs: NLU.EntityDefinition[],
    languageCode: string,
    trainingSession: TrainingSession
  ): Promise<Model> {
    this.logger.info(`Started ${languageCode} training for bot ${this.botId}`)

    const list_entities = entityDefs
      .filter(ent => ent.type === 'list')
      .map(e => {
        return {
          name: e.name,
          fuzzyTolerance: e.fuzzy,
          sensitive: e.sensitive,
          synonyms: _.chain(e.occurences)
            .keyBy('name')
            .mapValues('synonyms')
            .value()
        } as ListEntity
      })

    const pattern_entities = entityDefs
      .filter(ent => ent.type === 'pattern' && isPatternValid(ent.pattern))
      .map(ent => ({
        name: ent.name,
        pattern: ent.pattern,
        examples: [], // TODO add this to entityDef
        matchCase: ent.matchCase,
        sensitive: ent.sensitive
      }))

    const contexts = _.chain(intentDefs)
      .flatMap(i => i.contexts)
      .uniq()
      .value()

    const input: TrainInput = {
      botId: this.botId,
      trainingSession,
      languageCode,
      list_entities,
      pattern_entities,
      contexts,
      intents: intentDefs
        .filter(x => !!x.utterances[languageCode])
        .map(x => ({
          name: x.name,
          contexts: x.contexts,
          utterances: x.utterances[languageCode],
          slot_definitions: x.slots
        }))
    }

    // Model should be build here, Trainer should not have any idea of how this is stored
    // Error handling should be done here
    const model = await Trainer(input, E2.tools)
    if (model.success) {
      E2.tools.reportTrainingProgress(this.botId, 'Training complete', {
        ...trainingSession,
        progress: 1,
        status: 'done'
      })
      this.logger.info(`Successfully finished ${languageCode} training for bot: ${this.botId}`)
      await this.loadModel(model)
    }

    return model
  }

  private modelAlreadyLoaded(model: Model) {
    return (
      this.predictorsByLang[model.languageCode] !== undefined &&
      this.modelsByLang[model.languageCode] !== undefined &&
      _.isEqual(this.modelsByLang[model.languageCode].data.input, model.data.input)
    ) // compare hash instead
  }

  async loadModels(models: Model[]) {
    return Promise.map(models, model => this.loadModel(model))
  }

  async loadModel(model: Model) {
    if (this.modelAlreadyLoaded(model)) {
      return
    }

    if (!model.data.output) {
      const intents = await ProcessIntents(
        model.data.input.intents,
        model.languageCode,
        model.data.artefacts.list_entities,
        E2.tools
      )
      model.data.output = { intents } as TrainOutput // needed for prediction
    }

    this.predictorsByLang[model.languageCode] = await this._makePredictors(model)
    this.modelsByLang[model.languageCode] = model
  }

  private async _makePredictors(model: Model): Promise<Predictors> {
    const { input, output, artefacts } = model.data
    const tools = E2.tools

    if (input.intents.length > 0) {
      const ctx_classifer = new tools.mlToolkit.SVM.Predictor(artefacts.ctx_model)
      const intent_classifier_per_ctx = _.toPairs(artefacts.intent_model_by_ctx).reduce(
        (c, [ctx, intentModel]) => ({ ...c, [ctx]: new tools.mlToolkit.SVM.Predictor(intentModel as string) }),
        {} as _.Dictionary<MLToolkit.SVM.Predictor>
      )
      const slot_tagger = new CRFExtractor2(tools.mlToolkit) // TODO change this for MLToolkit.CRF.Tagger
      slot_tagger.load(artefacts.slots_model)

      const kmeans = computeKmeans(output.intents, tools) // TODO load from artefacts when persistd

      return {
        ...artefacts,
        ctx_classifer,
        intent_classifier_per_ctx,
        slot_tagger,
        kmeans,
        pattern_entities: input.pattern_entities,
        intents: output.intents
      }
    } else {
      // we don't want to return undefined as extraction won't be triggered
      // we want to make it possible to extract entities without having any intents
      return { ...artefacts } as Predictors
    }
  }

  async predict(sentence: string, includedContexts: string[]): Promise<PredictOutput> {
    const input: PredictInput = {
      defaultLanguage: this.defaultLanguage,
      sentence,
      includedContexts
    }

    // TODO throw error if no model was loaded

    return Predict(input, E2.tools, this.predictorsByLang)
  }
}
