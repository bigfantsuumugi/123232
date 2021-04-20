import * as sdk from 'botpress/sdk'
import * as NLUEngine from 'common/nlu/engine'
import _ from 'lodash'
import { mapTrainSet } from '../../stan/api-mapper'
import { BotDoesntSpeakLanguageError } from '../errors'
import { Predictor, ProgressCallback, Trainable, I } from '../typings'

import { IDefinitionsService } from './definitions-service'
import { IModelRepository } from './infrastructure/model-repository'
import { ScopedPredictionHandler } from './prediction-handler'

interface BotDefinition {
  botId: string
  defaultLanguage: string
  languages: string[]
}

export type IBot = I<Bot>

export class Bot implements Trainable, Predictor {
  private _botId: string
  private _defaultLanguage: string
  private _languages: string[]
  private _modelsByLang: _.Dictionary<NLUEngine.ModelId> = {}

  private _predictor: ScopedPredictionHandler

  constructor(
    bot: BotDefinition,
    private _engine: NLUEngine.Engine,
    private _modelRepo: IModelRepository,
    private _defService: IDefinitionsService,
    private _modelIdService: typeof NLUEngine.modelIdService,
    private _logger: sdk.Logger
  ) {
    this._botId = bot.botId
    this._defaultLanguage = bot.defaultLanguage
    this._languages = bot.languages

    this._predictor = new ScopedPredictionHandler(
      {
        defaultLanguage: this._defaultLanguage
      },
      _engine,
      _modelRepo,
      this._modelIdService,
      this._modelsByLang,
      this._logger
    )
  }

  public async mount() {
    await this._modelRepo.initialize()
    await this._defService.initialize()
  }

  public async unmount() {
    await this._defService.teardown()
    for (const [_botId, modelId] of Object.entries(this._modelsByLang)) {
      this._engine.unloadModel(modelId)
      delete this._modelsByLang[modelId.languageCode]
    }
  }

  public load = async (modelId: NLUEngine.ModelId) => {
    const model = await this._modelRepo.getModel(modelId)
    if (!model) {
      const stringId = this._modelIdService.toString(modelId)
      throw new Error(`Model ${stringId} not found on file system.`)
    }

    const previousId = this._modelsByLang[modelId.languageCode]
    if (previousId) {
      this._engine.unloadModel(previousId)
    }

    this._modelsByLang[modelId.languageCode] = model.id
    await this._engine.loadModel(model)
  }

  public train = async (language: string, progressCallback: ProgressCallback): Promise<NLUEngine.ModelId> => {
    const { _engine, _languages, _modelRepo, _defService, _botId } = this

    if (!_languages.includes(language)) {
      throw new BotDoesntSpeakLanguageError(_botId, language)
    }

    const bpTrainSet = await _defService.getTrainSet(language)
    const stanTrainSet = mapTrainSet(bpTrainSet)

    const previousModel = this._modelsByLang[language]
    const options: NLUEngine.TrainingOptions = { previousModel, progressCallback }

    const model = await _engine.train(this._makeTrainingId(language), stanTrainSet, options)
    await _modelRepo.saveModel(model)

    const modelsOfLang = await _modelRepo.listModels({ languageCode: language })
    await _modelRepo.pruneModels(modelsOfLang, { toKeep: 2 })

    return model.id
  }

  public cancelTraining = async (language: string) => {
    if (!this._languages.includes(language)) {
      throw new BotDoesntSpeakLanguageError(this._botId, language)
    }
    return this._engine.cancelTraining(this._makeTrainingId(language))
  }

  public predict = async (textInput: string, anticipatedLanguage?: string) => {
    const { _predictor, _defaultLanguage } = this
    return _predictor.predict(textInput, anticipatedLanguage ?? _defaultLanguage)
  }

  private _makeTrainingId = (language: string) => {
    return `${this._botId}:${language}`
  }
}
