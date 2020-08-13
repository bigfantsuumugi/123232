import * as sdk from 'botpress/sdk'
import _ from 'lodash'
import ms from 'ms'
import yn from 'yn'

import { createApi } from '../../api'
import * as ModelService from '../model-service'
import { makeTrainingSession, makeTrainSessionKey, setTrainingSession } from '../train-session-service'
import { NLUState } from '../typings'

const missingLangMsg = botId =>
  `Bot ${botId} has configured languages that are not supported by language sources. Configure a before incoming hook to call an external NLU provider for those languages.`

const KVS_TRAINING_STATUS_KEY = 'nlu:trainingStatus'

export function getOnBotMount(state: NLUState) {
  return async (bp: typeof sdk, botId: string) => {
    const bot = await bp.bots.getBotById(botId)
    const ghost = bp.ghost.forBot(botId)

    const languages = _.intersection(bot.languages, bp.NLU.Engine.getLanguages())
    if (bot.languages.length !== languages.length) {
      bp.logger.warn(missingLangMsg(botId), { notSupported: _.difference(bot.languages, languages) })
    }

    const engine = new bp.NLU.Engine(bot.defaultLanguage, bot.id, state.logger)
    const trainOrLoad = _.debounce(
      async (forceTrain: boolean = false) => {
        // bot got deleted
        if (!state.nluByBot[botId]) {
          return
        }

        const api = await createApi(bp, botId)
        const intentDefs = await api.fetchIntentsWithQNAs()
        const entityDefs = await api.fetchEntities()

        const kvs = bp.kvs.forBot(botId)
        await kvs.set(KVS_TRAINING_STATUS_KEY, 'training')

        try {
          await Promise.mapSeries(languages, async languageCode => {
            // shorter lock and extend in training steps
            const lock = await bp.distributed.acquireLock(makeTrainSessionKey(botId, languageCode), ms('5m'))
            if (!lock) {
              return
            }

            const hash = engine.computeModelHash(intentDefs, entityDefs, languageCode)
            await ModelService.pruneModels(ghost, languageCode)
            let model = await ModelService.getModel(ghost, hash, languageCode)

            if ((forceTrain || !model) && !yn(process.env.BP_NLU_DISABLE_TRAINING)) {
              const trainSession = makeTrainingSession(languageCode, lock)
              await setTrainingSession(bp, botId, trainSession)
              state.nluByBot[botId].trainSessions[languageCode] = trainSession

              const canceledCallback = async () => {
                trainSession.status = 'needs-training'
                await setTrainingSession(bp, botId, trainSession)
                const ev = {
                  type: 'nlu',
                  botId,
                  trainSession: _.omit(trainSession, 'lock')
                }
                bp.realtime.sendPayload(bp.RealTimePayload.forAdmins('statusbar.event', ev))
              }

              model = await engine.train(
                intentDefs,
                entityDefs,
                languageCode,
                state.reportTrainingProgress,
                trainSession,
                { forceTrain },
                // @ts-ignore
                canceledCallback
              )
              if (model) {
                await engine.loadModel(model)
                await ModelService.saveModel(ghost, model, hash)
              }
            } else {
              state.reportTrainingProgress(botId, 'Training not needed', {
                language: languageCode,
                progress: 1,
                status: 'done'
              })
            }
            try {
              if (model) {
                await state.broadcastLoadModel(botId, hash, languageCode)
              }
            } finally {
              await lock.unlock()
            }
          })
        } finally {
          await kvs.delete(KVS_TRAINING_STATUS_KEY)
        }
      },
      10000,
      { leading: true }
    )

    const cancelTraining = async () => {
      await Promise.map(languages, async lang => {
        const key = makeTrainSessionKey(botId, lang)
        await bp.distributed.clearLock(key)
        return state.broadcastCancelTraining(botId, lang)
      })
    }

    // TODO remove this
    const isTraining = async (): Promise<boolean> => {
      return bp.kvs.forBot(botId).exists(KVS_TRAINING_STATUS_KEY)
    }

    // @ts-ignore
    state.nluByBot[botId] = {
      botId,
      engine,
      trainOrLoad,
      trainSessions: {},
      cancelTraining,
      isTraining
    }

    if (yn(process.env.FORCE_TRAIN_ON_MOUNT)) {
      trainOrLoad(true) // floating on purpose
    }
  }
}
