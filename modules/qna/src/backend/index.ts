import * as sdk from 'botpress/sdk'
import _ from 'lodash'

import en from '../translations/en.json'
import fr from '../translations/fr.json'

import api from './api'
import { ScopedBots } from './qna'
import { initBot } from './setup'
import { initModule } from './setup_legacy'

const bots: ScopedBots = {}

const onServerStarted = async (bp: typeof sdk) => {}

const onServerReady = async (bp: typeof sdk) => {
  await api(bp, bots)
  await initModule(bp, bots)
}

const onBotMount = async (bp: typeof sdk, botId: string) => {
  await initBot(bp, botId, bots)
}

const onBotUnmount = async (bp: typeof sdk, botId: string) => {
  delete bots[botId]
}

const onModuleUnmount = async (bp: typeof sdk) => {
  bp.http.deleteRouterForBot('qna')
}

const onTopicChanged = async (bp: typeof sdk, botId: string, oldName?: string, newName?: string) => {
  const isRenaming = !!(oldName && newName)
  if (!isRenaming) {
    return
  }

  const { storage } = bots[botId]
  await storage.moveToAnotherTopic(oldName, newName)
}

const entryPoint: sdk.ModuleEntryPoint = {
  onServerStarted,
  onServerReady,
  onBotMount,
  onBotUnmount,
  onTopicChanged,
  onModuleUnmount,
  translations: { en, fr },
  definition: {
    name: 'qna',
    menuIcon: 'chat',
    menuText: 'Q&A',
    fullName: 'QNA',
    homepage: 'https://botpress.com',
    noInterface: false
  }
}

export default entryPoint
