import * as sdk from 'botpress/sdk'

import en from '../translations/en.json'
import fr from '../translations/fr.json'

import BoxedBoolean from './variables/boolean'
import BoxedDate from './variables/date'
import BoxedNumber from './variables/number'
import BoxedString from './variables/string'

const botTemplates: sdk.BotTemplate[] = [
  { id: 'welcome-bot', name: 'Welcome Bot', desc: `Basic bot that showcases some of the bot's functionality` },
  { id: 'small-talk', name: 'Small Talk', desc: `Includes basic smalltalk examples` },
  { id: 'empty-bot', name: 'Empty Bot', desc: `Start fresh with a clean flow` }
]

const entryPoint: sdk.ModuleEntryPoint = {
  variables: [BoxedDate, BoxedBoolean, BoxedNumber, BoxedString],
  botTemplates,
  translations: { en, fr },
  definition: {
    name: 'builtin',
    menuIcon: 'fiber_smart_record',
    fullName: 'Botpress Builtins',
    homepage: 'https://botpress.com',
    noInterface: true
  }
}

export default entryPoint
