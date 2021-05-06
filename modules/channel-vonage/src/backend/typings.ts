import Vonage, {
  ChannelContent,
  ChannelMessage,
  ChannelToFrom,
  MessageSendResponse,
  MessageSendError
} from '@vonage/server-sdk'
import * as sdk from 'botpress/sdk'
import { ChannelContext } from 'common/channel'
import { VonageClient } from './client'

export interface Clients {
  [botId: string]: VonageClient
}

export interface VonageRequestBody extends MessageSendResponse {
  to: ChannelToFrom
  from: ChannelToFrom
  message: ChannelMessage
  timestamp: string
}

export type VonageChannelContent = ChannelContent

interface InvalidParameter {
  name: string
  reason: string
}

export interface MessageApiError extends MessageSendError {
  invalid_parameters?: InvalidParameter[]
}

// https://developer.nexmo.com/messages/concepts/signed-webhooks#signed-jwt-payload
export interface SignedJWTPayload {
  iat: number
  jti: string
  iss: 'Vonage'
  payload_hash: string
  api_key: string
}

export type VonageContext = ChannelContext<Vonage> & {
  messages: VonageChannelContent[]
  botPhoneNumber: string
  prepareIndexResponse(event: sdk.IO.OutgoingEvent, options: sdk.ChoiceOption[]): Promise<void>
  isSandbox: boolean
  debug: IDebugInstance
  logger: sdk.Logger
}
