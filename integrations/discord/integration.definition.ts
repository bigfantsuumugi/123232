import { z, IntegrationDefinition, messages } from '@botpress/sdk'
import { sentry as sentryHelpers } from '@botpress/sdk-addons'
import { INTEGRATION_NAME } from './src/const'

export default new IntegrationDefinition({
  name: INTEGRATION_NAME,
  version: '0.3.2',
  readme: 'hub.md',
  configuration: {
    schema: z.object({
      apikey: z.string().min(1),
      apiSecret: z.string().min(1),
    }),
  },
  channels: {
    channel: {
      messages: messages.defaults,
      message: {
        tags: {
          id: {},
        },
      },
      conversation: {
        tags: {
          id: {},
        },
      },
    },
  },
  user: {
    tags: {
      id: {},
    },
  },
  actions: {},
  events: {},
  secrets: sentryHelpers.COMMON_SECRET_NAMES,
})
