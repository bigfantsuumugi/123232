import * as sdk from 'botpress/sdk'
import bytes from 'bytes'
import _ from 'lodash'

import { Config } from '../config'

import { getWebsocket } from './api'
import { NLUApplication } from './application'
import { BotFactory } from './application/bot-factory'
import { BotService } from './application/bot-service'
import { DistributedTrainingQueue } from './application/distributed-training-queue'
import { ScopedDefinitionsRepository } from './application/scoped/infrastructure/definitions-repository'
import { ScopedModelRepository } from './application/scoped/infrastructure/model-repository'
import { TrainingRepository } from './application/training-repo'
import { BotDefinition } from './application/typings'

export async function bootStrap(bp: typeof sdk): Promise<NLUApplication> {
  const globalConfig: Config = await bp.config.getModuleConfig('nlu')

  const {
    ducklingEnabled,
    ducklingURL,
    languageSources,
    modelCacheSize,
    maxTrainingPerInstance,
    queueTrainingOnBotMount
  } = globalConfig

  const parsedConfig: sdk.NLU.Config = {
    languageSources,
    ducklingEnabled,
    ducklingURL,
    modelCacheSize: bytes(modelCacheSize)
  }

  const logger = <sdk.NLU.Logger>{
    info: (msg: string) => bp.logger.info(msg),
    warning: (msg: string, err?: Error) => (err ? bp.logger.attachError(err).warn(msg) : bp.logger.warn(msg)),
    error: (msg: string, err?: Error) => (err ? bp.logger.attachError(err).error(msg) : bp.logger.error(msg))
  }

  const engine = await bp.NLU.makeEngine(parsedConfig, logger)

  const socket = getWebsocket(bp)

  const botService = new BotService()

  const makeModelRepo = (bot: BotDefinition) =>
    new ScopedModelRepository(bot, bp.NLU.modelIdService, bp.ghost.forBot(bot.botId))

  const makeDefRepo = (bot: BotDefinition) => new ScopedDefinitionsRepository(bot, bp)

  const botFactory = new BotFactory(engine, bp.logger, bp.NLU.modelIdService, makeDefRepo, makeModelRepo)

  const trainRepo = new TrainingRepository(bp.database)
  const memoryTrainingQueue = new DistributedTrainingQueue(
    trainRepo,
    bp.NLU.errors,
    bp.logger,
    botService,
    bp.distributed,
    socket,
    { maxTraining: maxTrainingPerInstance }
  )

  const application = new NLUApplication(memoryTrainingQueue, engine, botFactory, botService, queueTrainingOnBotMount)

  await application.initialize()
  return application
}
