import { IScopedServicesFactory, ScopedServices } from '../bot-factory'
import { IBotService } from '../bot-service'
import { NLUApplication } from '../index'
import { IBot } from '../scoped/bot'
import { IDefinitionsService } from '../scoped/definitions-service'

import { mock, Mock } from './utils/mock-extra.u.test'
import './utils/sdk.u.test'
import { ITrainingQueue } from '../training-queue'
import { IStanEngine } from '../../stan'

const botId = 'myBot'
const makeModelId = (languageCode: string): string => `hehe.abab.69.${languageCode}`

const makeBot = (): Mock<IBot> =>
  mock<IBot>({
    mount: jest.fn(),
    setModel: jest.fn(),
    unmount: jest.fn()
  })

const makeScopedServices = (): Mock<ScopedServices> => ({
  bot: makeBot(),
  defService: mock<IDefinitionsService>({
    listenForDirtyModels: jest.fn(l => {}),
    getLatestModelId: jest.fn(async l => makeModelId(l))
  })
})

describe('NLU API unit tests', () => {
  let trainingQueue: Mock<ITrainingQueue>
  let engine: Mock<IStanEngine>
  let servicesFactory: Mock<IScopedServicesFactory>
  let botService: Mock<IBotService>

  beforeEach(() => {
    trainingQueue = mock<ITrainingQueue>({
      initialize: jest.fn(),
      teardown: jest.fn(),
      queueTraining: jest.fn(),
      cancelTrainings: jest.fn()
    })
    engine = mock<IStanEngine>({
      hasModel: jest.fn(async (app, m) => false)
    })
    servicesFactory = mock<IScopedServicesFactory>({})
    botService = mock<IBotService>({
      setBot: jest.fn(),
      removeBot: jest.fn()
    })
    trainingQueue.initialize()
  })

  test('mounting a bot when model is on fs mounts the bot and loads the model', async () => {
    // arrange
    const modelId = makeModelId('en')

    const scopedServices = makeScopedServices()
    scopedServices.defService.getLatestModelId = jest.fn(async l => (l === 'en' ? modelId : makeModelId(l)))
    engine.hasModel = jest.fn(async (app, m) => m === modelId)
    servicesFactory.makeBot = jest.fn(async bot => scopedServices)

    const app = new NLUApplication(trainingQueue, engine, servicesFactory, botService)

    // act
    await app.mountBot({
      id: botId,
      defaultLanguage: 'en',
      languages: ['en']
    })

    // assert
    expect(botService.setBot).toHaveBeenCalledWith(botId, scopedServices.bot)
    expect(scopedServices.bot.mount).toHaveBeenCalled()
    expect(scopedServices.defService.listenForDirtyModels).toHaveBeenCalled()

    expect(scopedServices.bot.setModel).toHaveBeenCalledWith('en', modelId)
    expect(trainingQueue.queueTraining).not.toHaveBeenCalled()
  })

  test('mounting a bot when no model is on fs mounts the bot queue training', async () => {
    // arrange
    const scopedServices = makeScopedServices()
    engine.hasModel = jest.fn(async (app, m) => false)
    servicesFactory.makeBot = jest.fn(async bot => scopedServices)

    const app = new NLUApplication(trainingQueue, engine, servicesFactory, botService)

    // act
    await app.mountBot({
      id: botId,
      defaultLanguage: 'en',
      languages: ['en']
    })

    // assert
    expect(botService.setBot).toHaveBeenCalledWith(botId, scopedServices.bot)
    expect(scopedServices.bot.mount).toHaveBeenCalled()
    expect(scopedServices.defService.listenForDirtyModels).toHaveBeenCalled()

    expect(scopedServices.bot.setModel).not.toHaveBeenCalled()
    expect(trainingQueue.queueTraining).toHaveBeenCalledWith(expect.objectContaining({ botId, language: 'en' }))
  })

  test('queuing a training, queues the training', async () => {
    // arrange
    const scopedServices = makeScopedServices()
    engine.hasModel = jest.fn(async (app, m) => true)

    servicesFactory.makeBot = jest.fn(async bot => scopedServices)
    botService.getBot = jest.fn(bot => scopedServices.bot)

    const app = new NLUApplication(trainingQueue, engine, servicesFactory, botService)

    // act
    await app.mountBot({
      id: botId,
      defaultLanguage: 'en',
      languages: ['en']
    })
    await app.queueTraining(botId, 'en')

    // assert
    expect(trainingQueue.queueTraining).toHaveBeenCalledWith(expect.objectContaining({ botId, language: 'en' }))
  })

  test('unmounting a bot, unmounts the bot and remove from botservice', async () => {
    // arrange
    const botId1 = 'botId1'
    const botId2 = 'botId2'
    const botIds = [botId1, botId2]
    botService.getIds = jest.fn(() => botIds)

    const bot1 = makeBot()
    const bot2 = makeBot()
    botService.getBot = jest.fn(botId => {
      if (botId === botId1) {
        return bot1
      }
      if (botId === botId2) {
        return bot2
      }
    })

    const app = new NLUApplication(trainingQueue, engine, servicesFactory, botService)

    // act
    await app.unmountBot(botId1)

    // assert
    expect(bot1.unmount).toHaveBeenCalled()
    expect(botService.removeBot).toHaveBeenCalledWith(botId1)

    expect(bot2.unmount).not.toHaveBeenCalled()
    expect(botService.removeBot).not.toHaveBeenCalledWith(botId2)
  })

  test('teardown app, teardowns training queue and unmount all bots', async () => {
    // arrange
    const botId1 = 'botId1'
    const botId2 = 'botId2'
    const botIds = [botId1, botId2]
    botService.getIds = jest.fn(() => botIds)

    const bot1 = makeBot()
    const bot2 = makeBot()
    botService.getBot = jest.fn(botId => {
      if (botId === botId1) {
        return bot1
      }
      if (botId === botId2) {
        return bot2
      }
    })

    const app = new NLUApplication(trainingQueue, engine, servicesFactory, botService)

    // act
    await app.teardown()

    // assert
    expect(trainingQueue.teardown).toHaveBeenCalled()
    expect(bot1.unmount).toHaveBeenCalled()
    expect(bot2.unmount).toHaveBeenCalled()
  })
})
