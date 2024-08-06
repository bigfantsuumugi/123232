import { IntegrationDefinition, interfaces, z } from '@botpress/sdk'
import { languageModelId } from 'src/schemas'

export default new IntegrationDefinition({
  name: 'fireworks-ai',
  version: '0.1.0',
  readme: 'hub.md',
  icon: 'icon.svg',
  entities: {
    modelRef: {
      schema: z.object({
        id: languageModelId,
      }),
    },
    speechToTextModelRef: {
      schema: z.object({
        id: z.string(),
      }),
    },
  },
  secrets: {
    FIREWORKS_AI_API_KEY: {
      description: 'Fireworks AI API key',
    },
  },
})
  .extend(interfaces.llm, ({ modelRef }) => ({ modelRef }))
  .extend(interfaces.speechToText, ({ speechToTextModelRef }) => ({ speechToTextModelRef }))
