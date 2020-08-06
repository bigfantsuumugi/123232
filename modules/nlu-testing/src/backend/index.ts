import * as sdk from 'botpress/sdk'
import _ from 'lodash'

import en from '../translations/en.json'
import fr from '../translations/fr.json'

import api from './api'

export type SDK = typeof sdk

const onServerStarted = async (bp: SDK) => {
  bp.logger.warn(
    'You are using Botpress NLU Regression Testing module which is meant to be used only by the Botpress team.'
  )
}

const onServerReady = async (bp: SDK) => {
  await api(bp)
}

const onModuleUnmount = async (bp: typeof sdk) => {
  bp.http.deleteRouterForBot('nlu-testing')
}

const botTemplates: sdk.BotTemplate[] = [
  {
    id: 'bp-nlu-entities-encoding',
    name: 'BPDS - NLU entities encoding ',
    desc: 'BP Dataset with really closed intents that differs almost only from their slots.'
  },
  {
    id: 'bp-nlu-regression-testing',
    name: 'BPDS - NLU regression testing ',
    desc:
      'BPDS are handcrafted datasets. Intents in each contexts are built with a specific distribution in mind, making intent classification hard to achieve.'
  },
  {
    id: 'bp-nlu-synonyms-intent-testing',
    name: 'BPDS - NLU synonyms intents ',
    desc:
      'BP Dataset filled with synonyms in utterances that language models are unaware of to test and improve generalisation. Tests on intents'
  },
  {
    id: 'bp-nlu-synonyms-context-testing',
    name: 'BPDS - NLU synonyms context ',
    desc:
      'BP Dataset filled with synonyms in utterances that language models are unaware of to test and improve generalisation. Tests on contexts'
  },
  {
    id: 'bp-nlu-synonyms-baseline-context',
    name: 'BPDS - NLU synonyms baseline context ',
    desc:
      'BP Dataset filled with synonyms in utterances that language models are unaware of to test and improve generalisation. Baseline without synonyms for contexts'
  },
  {
    id: 'bp-nlu-synonyms-baseline-intent',
    name: 'BPDS - NLU synonyms baseline intent',
    desc:
      'BP Dataset filled with synonyms in utterances that language models are unaware of to test and improve generalisation. Baseline without synonyms for intents'
  },
  {
    id: 'bp-nlu-synonyms-testing',
    name: 'BPDS - NLU synonyms full',
    desc:
      'BP Dataset filled with synonyms in utterances that language models are unaware of to test and improve generalisation.'
  },
  {
    id: 'bp-nlu-synonyms-baseline-testing',
    name: 'BPDS - NLU synonyms baseline full',
    desc:
      'BP Dataset filled with synonyms in utterances that language models are unaware of to test and improve generalisation. Baseline without synonyms'
  }
]

const entryPoint: sdk.ModuleEntryPoint = {
  botTemplates,
  onServerStarted,
  onServerReady,
  onModuleUnmount,
  translations: { en, fr },
  definition: {
    name: 'nlu-testing',
    menuIcon: 'lab-test',
    menuText: 'NLU Testing',
    fullName: 'NLU Regression Testing',
    homepage: 'https://botpress.com',
    experimental: true
  }
}

export default entryPoint
