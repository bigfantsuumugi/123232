import { IntegrationDefinitionProps } from '@botpress/sdk'
import { webhookStateSchema } from '../src/schemas/states'

export const States = {
  webhookState: 'webhookState',
} as const

export const states = {
  [States.webhookState]: {
    type: 'integration',
    schema: webhookStateSchema,
  },
} as const satisfies NonNullable<IntegrationDefinitionProps['states']>
