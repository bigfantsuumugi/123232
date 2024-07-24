import { llm } from '@botpress/common'
import { interfaces } from '@botpress/sdk'
import OpenAI from 'openai'
import { LanguageModelId, ImageModelId } from './schemas'
import * as bp from '.botpress'
import { InvalidPayloadError } from '@botpress/client'
import { ImageGenerateParams, Images } from 'openai/resources'

const openAIClient = new OpenAI({
  apiKey: bp.secrets.OPENAI_API_KEY,
})

const DEFAULT_LANGUAGE_MODEL_ID: LanguageModelId = 'gpt-4o-mini-2024-07-18'
const DEFAULT_IMAGE_MODEL_ID: ImageModelId = 'dall-e-3-standard-1024'

// References:
//  https://platform.openai.com/docs/models
//  https://openai.com/api/pricing/
const languageModels: Record<LanguageModelId, interfaces.llm.ModelDetails> = {
  // IMPORTANT: Only full model names should be supported here, as the short model names can be pointed by OpenAI at any time to a newer model with different pricing.
  'gpt-4o-mini-2024-07-18': {
    name: 'GPT-4o Mini',
    input: {
      costPer1MTokens: 0.15,
      maxTokens: 128_000,
    },
    output: {
      costPer1MTokens: 0.6,
      maxTokens: 16_000,
    },
  },
  'gpt-4o-2024-05-13': {
    name: 'GPT-4o',
    input: {
      costPer1MTokens: 5,
      maxTokens: 128_000,
    },
    output: {
      costPer1MTokens: 15,
      maxTokens: 4096,
    },
  },
  'gpt-4-turbo-2024-04-09': {
    name: 'GPT-4 Turbo',
    input: {
      costPer1MTokens: 10,
      maxTokens: 128_000,
    },
    output: {
      costPer1MTokens: 30,
      maxTokens: 4096,
    },
  },
  'gpt-3.5-turbo-0125': {
    name: 'GPT-3.5',
    input: {
      costPer1MTokens: 0.5,
      maxTokens: 128_000,
    },
    output: {
      costPer1MTokens: 1.5,
      maxTokens: 4096,
    },
  },
}

const imageModels: Record<ImageModelId, interfaces.textToImage.ImageModelDetails> = {
  'dall-e-3-standard-1024': {
    name: 'DALL-E 3 Standard 1024',
    costPerImage: 0.04,
    sizes: ['1024x1024'],
    defaultSize: '1024x1024',
  },
  'dall-e-3-standard-1792': {
    name: 'DALL-E 3 Standard 1792',
    costPerImage: 0.08,
    sizes: ['1024x1792', '1792x1024'],
    defaultSize: '1024x1792',
  },
  'dall-e-3-hd-1024': {
    name: 'DALL-E 3 HD 1024',
    costPerImage: 0.08,
    sizes: ['1024x1024'],
    defaultSize: '1024x1024',
  },
  'dall-e-3-hd-1792': {
    name: 'DALL-E 3 HD 1792',
    costPerImage: 0.12,
    sizes: ['1024x1792', '1792x1024'],
    defaultSize: '1024x1792',
  },
  'dall-e-2-256': {
    name: 'DALL-E 2 256',
    costPerImage: 0.016,
    sizes: ['256x256'],
    defaultSize: '256x256',
  },
  'dall-e-2-512': {
    name: 'DALL-E 2 512',
    costPerImage: 0.018,
    sizes: ['512x512'],
    defaultSize: '512x512',
  },
  'dall-e-2-1024': {
    name: 'DALL-E 2 1024',
    costPerImage: 0.02,
    sizes: ['1024x1024'],
    defaultSize: '1024x1024',
  },
}

export default new bp.Integration({
  register: async () => {},
  unregister: async () => {},
  actions: {
    generateContent: async ({ input, logger }) => {
      return await llm.openai.generateContent<LanguageModelId>(<llm.GenerateContentInput>input, openAIClient, logger, {
        provider: 'openai',
        models: languageModels,
        defaultModel: DEFAULT_LANGUAGE_MODEL_ID,
      })
    },
    generateImage: async ({ input, client }) => {
      const imageModelId = (input.model?.id ?? DEFAULT_IMAGE_MODEL_ID) as ImageModelId
      const imageModel = imageModels[imageModelId]
      if (!imageModel) {
        throw new InvalidPayloadError(
          `Model ID "${imageModelId}" is not allowed by this integration, supported model IDs are: ${Object.keys(
            imageModels
          ).join(', ')}`
        )
      }

      const size = (input.size || imageModel.defaultSize) as NonNullable<ImageGenerateParams['size']>

      if (!imageModel.sizes.includes(size)) {
        throw new InvalidPayloadError(
          `Size "${
            input.size
          }" is not allowed by the "${imageModelId}" model, supported sizes are: ${imageModel.sizes.join(', ')}`
        )
      }

      const { model, quality } = getOpenAIImageGenerationParams(imageModelId)

      const result = await openAIClient.images.generate({
        model,
        size,
        quality,
        prompt: input.prompt,
        style: input.params?.style,
        user: input.params?.user,
        response_format: 'url',
      })

      const temporaryImageUrl = result.data[0]?.url
      if (!temporaryImageUrl) {
        throw new Error('No image was returned by OpenAI')
      }

      // File storage is billed to the workspace of the bot that called this action.
      const { file } = await client.uploadFile({
        key: temporaryImageUrl,
        url: temporaryImageUrl,
        contentType: 'image/png',
        accessPolicies: ['public_content'],
        tags: {
          source: 'integration:openai',
        },
        // TODO: set a user-defined file expiry once it's supported so storage costs are minimized, if desired expiry is short enough we can also just directly pass the temporary URL provided by OpenAI
      })

      return {
        model: imageModelId,
        imageUrl: file.url,
        cost: imageModel.costPerImage,
      }
    },
    listLanguageModels: async ({}) => {
      return {
        models: Object.entries(languageModels).map(([id, model]) => ({ id: <LanguageModelId>id, ...model })),
      }
    },
    listImageModels: async ({}) => {
      return {
        models: Object.entries(imageModels).map(([id, model]) => ({ id: <ImageModelId>id, ...model })),
      }
    },
  },
  channels: {},
  handler: async () => {},
})

function getOpenAIImageGenerationParams(modelId: ImageModelId): {
  model: Images.ImageGenerateParams['model']
  quality?: Images.ImageGenerateParams['quality']
} {
  switch (modelId) {
    case 'dall-e-3-standard-1024':
      return { model: 'dall-e-3', quality: 'standard' }
    case 'dall-e-3-standard-1792':
      return { model: 'dall-e-3', quality: 'standard' }
    case 'dall-e-3-hd-1024':
      return { model: 'dall-e-3', quality: 'hd' }
    case 'dall-e-3-hd-1792':
      return { model: 'dall-e-3', quality: 'hd' }
    case 'dall-e-2-256':
      return { model: 'dall-e-2' }
    case 'dall-e-2-512':
      return { model: 'dall-e-2' }
    case 'dall-e-2-1024':
      return { model: 'dall-e-2' }
    default:
      throw new Error(`Invalid model ID: ${modelId}`)
  }
}
