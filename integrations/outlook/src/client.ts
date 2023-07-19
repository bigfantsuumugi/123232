import { ClientSecretCredential } from '@azure/identity'
import type { IntegrationContext } from '@botpress/sdk'
import { Client, ResponseType } from '@microsoft/microsoft-graph-client'
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
import type { Subscription, Message as OutlookMessage, ChangeNotification } from '@microsoft/microsoft-graph-types'
import moment from 'moment'

import type { SendMessageProps } from './misc/custom-types'

export class GraphApi {
  private client: Client
  constructor(tenantId: string, clientId: string, clientSecret: string) {
    const credential = new ClientSecretCredential(tenantId, clientId, clientSecret)
    const authProvider = new TokenCredentialAuthenticationProvider(credential, {
      scopes: ['https://graph.microsoft.com/.default'],
    })

    this.client = Client.initWithMiddleware({
      //debugLogging: true,
      authProvider,
    })
  }

  public sendMail = async ({
    client: botpressClient,
    message,
    conversation,
    ctx,
    ack,
    body,
  }: SendMessageProps): Promise<void> => {
    const stateRes = await botpressClient.getState({
      id: conversation.id,
      name: 'lastMessageRef',
      type: 'conversation',
    })

    const { state } = stateRes
    const { lastMessageId } = state.payload

    if (!lastMessageId) {
      console.info('conv tag missing: outlook:lastMessageId')
      return
    }

    try {
      await this.client
        .api(`/users/${ctx.configuration.emailAddress}/messages/${lastMessageId}/replyAll`)
        .responseType(ResponseType.RAW)
        .post({
          message: {
            body,
          },
        })
      await ack({ tags: { 'outlook:id': `${message.id}` } })
    } catch (error) {
      console.info((error as Error).message)
    }

    return
  }

  public subscribeWebhook = async (webhookUrl: string, ctx: IntegrationContext): Promise<string> => {
    const expirationDateTime = this.generateExpirationDate()

    const res = await this.client.api('/subscriptions').post({
      changeType: 'created',
      notificationUrl: webhookUrl,
      lifecycleNotificationUrl: webhookUrl,
      expirationDateTime,
      resource: `/users/${ctx.configuration.emailAddress}/mailFolders('${ctx.configuration.mailFolder}')/messages`,
    })

    return res.id
  }

  public listSubscriptions = async (): Promise<Subscription[]> => {
    const res = await this.client.api('/subscriptions').get()
    return res.value
  }

  public handleLifecycleEvents = async (event: ChangeNotification) => {
    if (event.lifecycleEvent === 'reauthorizationRequired') {
      console.info('lifecycleEvent - reauthorizationRequired')

      const expirationDateTime = this.generateExpirationDate()
      await this.client.api(`/subscriptions/${event.subscriptionId}`).patch({
        expirationDateTime,
      })
      console.info('webhook reauthorization success')
    }

    return
  }

  public unsubscribeWebhook = async (subscriptionId: string): Promise<void> => {
    const res = await this.client.api(`/subscriptions/${subscriptionId}`).del()

    return res
  }

  public getNotificationContent = async (odataId: string): Promise<OutlookMessage> => {
    const res = await this.client.api(odataId).get()
    return res
  }

  private generateExpirationDate = () => {
    return moment.utc().add(20, 'minutes')
  }
}
