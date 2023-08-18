import type { IntegrationDefinitionProps } from '@botpress/sdk'
import { z } from 'zod'

export { actions } from './actions'
export { events } from './events'
export { channels } from './channels'

export const configuration = {
  schema: z.object({
    baseURL: z.string({
      description: 'Your zendesk organization subdomain. e.g. https://{subdomain}.zendesk.com',
    }),
    username: z.string({
      description: 'Your zendesk account email, add "/token" to the end. e.g. jdoe@example.com/token',
    }),
    apiToken: z.string({
      description: 'Zendesk API Token',
    }),
  }),
} satisfies IntegrationDefinitionProps['configuration']

export const states = {
  subscriptionInfo: {
    type: 'integration',
    schema: z.object({
      subscriptionId: z.string(),
      triggerIds: z.array(z.string()),
    }),
  },
} satisfies IntegrationDefinitionProps['states']

export const user = {
  tags: {
    id: {},
    origin: {
      title: 'zendesk or botpress',
      description: 'The origin of the user',
    },
    name: {},
    email: {},
    role: {},
  },
  creation: { enabled: true, requiredTags: [] },
} satisfies IntegrationDefinitionProps['user']
