import { createEventAdapter } from '@slack/events-api'
import SlackEventAdapter from '@slack/events-api/dist/adapter'
import { createMessageAdapter } from '@slack/interactive-messages'
import SlackMessageAdapter from '@slack/interactive-messages/dist/adapter'
import { RTMClient } from '@slack/rtm-api'
import { WebClient } from '@slack/web-api'
import axios from 'axios'
import * as sdk from 'botpress/sdk'
import _ from 'lodash'
import LRU from 'lru-cache'
import ms from 'ms'

import { Config } from '../config'

import { Clients, SlackContext } from './typings'

const debug = DEBUG('channel-slack')
const debugIncoming = debug.sub('incoming')
const debugOutgoing = debug.sub('outgoing')

const userCache = new LRU({ max: 1000, maxAge: ms('1h') })

export class SlackClient {
  private client: WebClient
  private rtm: RTMClient
  private events: SlackEventAdapter
  private interactive: SlackMessageAdapter
  private logger: sdk.Logger
  private renderers: sdk.ChannelRenderer<SlackContext>[]
  private senders: sdk.ChannelSender<SlackContext>[]

  constructor(private bp: typeof sdk, private botId: string, private config: Config, private router) {
    this.logger = bp.logger.forBot(botId)
  }

  async initialize() {
    if (!this.config.botToken || !this.config.signingSecret) {
      return this.logger.error(
        `[${this.botId}] The bot token and the signing secret must be configured to use this channel.`
      )
    }

    this.renderers = this.bp.experimental.render.getChannelRenderers('slack')
    this.senders = this.bp.experimental.render.getChannelSenders('slack')

    this.client = new WebClient(this.config.botToken)
    if (this.config.useRTM || this.config.useRTM === undefined) {
      this.logger.warn(`[${this.botId}] Slack configured to used legacy RTM`)
      this.rtm = new RTMClient(this.config.botToken)
    } else {
      this.events = createEventAdapter(this.config.signingSecret)
    }
    this.interactive = createMessageAdapter(this.config.signingSecret)

    await this._setupRealtime()
    await this._setupInteractiveListener()
  }

  async shutdown() {
    if (this.rtm) {
      await this.rtm.disconnect()
    }
  }

  private async _setupInteractiveListener() {
    this.interactive.action({ type: 'button' }, async payload => {
      debugIncoming('Received interactive message %o', payload)

      const actionId = _.get(payload, 'actions[0].action_id', '')
      const label = _.get(payload, 'actions[0].text.text', '')
      const value = _.get(payload, 'actions[0].value', '')

      // Some actions (ex: open url) should be discarded
      if (!actionId.startsWith('discard_action')) {
        // Either we leave buttons displayed, we replace with the selection, or we remove it
        if (actionId.startsWith('replace_buttons')) {
          await axios.post(payload.response_url, { text: `*${label}*` })
        } else if (actionId.startsWith('remove_buttons')) {
          await axios.post(payload.response_url, { delete_original: true })
        }

        await this.sendEvent(payload, { type: 'quick_reply', text: label, payload: value })
      }
    })

    this.interactive.action({ actionId: 'option_selected' }, async payload => {
      const label = _.get(payload, 'actions[0].selected_option.text.text', '')
      const value = _.get(payload, 'actions[0].selected_option.value', '')

      //  await axios.post(payload.response_url, { text: `*${label}*` })
      await this.sendEvent(payload, { type: 'quick_reply', text: label, payload: value })
    })

    this.interactive.action({ actionId: 'feedback-overflow' }, async payload => {
      debugIncoming('Received feedback %o', payload)

      const action = payload.actions[0]
      const blockId = action.block_id
      const selectedOption = action.selected_option.value

      const incomingEventId = blockId.replace('feedback-', '')
      const feedback = parseInt(selectedOption)

      const events = await this.bp.events.findEvents({ incomingEventId, direction: 'incoming' })
      const event = events[0]
      await this.bp.events.updateEvent(event.id, { feedback })
    })

    this.router.use(`/bots/${this.botId}/callback`, this.interactive.requestListener())

    await this.displayUrl('Interactive', 'callback')
  }

  private async _setupRealtime() {
    if (this.rtm) {
      this.listenMessages(this.rtm)
      await this.rtm.start()
    } else {
      this.listenMessages(this.events)
      this.router.post(`/bots/${this.botId}/events-callback`, this.events.requestListener())
      await this.displayUrl('Events', 'events-callback')
    }
  }

  private listenMessages(com: SlackEventAdapter | RTMClient) {
    const discardedSubtypes = ['bot_message', 'message_deleted', 'message_changed']

    com.on('message', async payload => {
      debugIncoming('Received real time payload %o', payload)

      if (!discardedSubtypes.includes(payload.subtype) && !payload.bot_id) {
        await this.sendEvent(payload, {
          type: 'text',
          text: _.find(_.at(payload, ['text', 'files.0.name', 'files.0.title']), x => x && x.length) || 'N/A'
        })
      }
    })

    com.on('error', err => this.bp.logger.attachError(err).error('An error occurred'))
  }

  private async _getUserInfo(userId: string) {
    if (!userCache.has(userId)) {
      const data = await new Promise((resolve, reject) => {
        this.client.users
          .info({ user: userId })
          .then(data => resolve(data && data.user))
          .catch(err => {
            debug('error fetching user info:', err)
            resolve({})
          })
      })
      userCache.set(userId, data)
    }

    return userCache.get(userId) || {}
  }

  private async displayUrl(title: string, end: string) {
    const publicPath = await this.router.getPublicPath()
    this.logger.info(
      `[${this.botId}] ${title} Endpoint URL: ${publicPath.replace('BOT_ID', this.botId)}/bots/${this.botId}/${end}`
    )
  }

  async handleOutgoingEvent(event: sdk.IO.OutgoingEvent, next: sdk.IO.MiddlewareNextCallback) {
    const foreignId = await this.bp.experimental.conversations.forBot(this.botId).getForeignId('slack', event.threadId)
    const [channelId, userId] = foreignId.split('-')

    const context: SlackContext = {
      bp: this.bp,
      event,
      client: { web: this.client, events: this.events, interactive: this.interactive },
      args: { channelId },
      message: { channel: channelId, text: undefined, blocks: [] },
      handlers: []
    }

    for (const renderer of this.renderers) {
      if (await renderer.handles(context)) {
        await renderer.render(context)
        context.handlers.push(renderer.getId())
      }
    }

    for (const sender of this.senders) {
      if (await sender.handles(context)) {
        await sender.send(context)
      }
    }

    await this.bp.experimental.messages
      .forBot(this.botId)
      .create(event.threadId, event.payload, undefined, event.id, event.incomingEventId)

    next(undefined, false)
  }

  private async sendEvent(ctx: any, payload: any) {
    const channelId = _.get(ctx, 'channel.id') || _.get(ctx, 'channel')
    const userId = _.get(ctx, 'user.id') || _.get(ctx, 'user')
    let user = {}

    if (userId && this.config.fetchUserInfo) {
      try {
        user = await this._getUserInfo(userId.toString())
      } catch (err) {}
    }

    let convoId = await this.bp.experimental.conversations
      .forBot(this.botId)
      .getLocalId('slack', `${channelId}-${userId}`)

    if (!convoId) {
      const conversation = await this.bp.experimental.conversations.forBot(this.botId).create(userId)
      convoId = conversation.id

      await this.bp.experimental.conversations
        .forBot(this.botId)
        .createMapping('slack', conversation.id, `${channelId}-${userId}`)
    }

    await this.bp.experimental.messages.forBot(this.botId).receive(convoId, payload, { channel: 'slack' })
  }
}

export async function setupMiddleware(bp: typeof sdk, clients: Clients) {
  bp.events.registerMiddleware({
    description:
      'Sends out messages that targets platform = slack.' +
      ' This middleware should be placed at the end as it swallows events once sent.',
    direction: 'outgoing',
    handler: outgoingHandler,
    name: 'slack.sendMessages',
    order: 100
  })

  async function outgoingHandler(event: sdk.IO.Event, next: sdk.IO.MiddlewareNextCallback) {
    if (event.channel !== 'slack') {
      return next()
    }

    const client: SlackClient = clients[event.botId]
    if (!client) {
      return next()
    }

    return client.handleOutgoingEvent(event, next)
  }
}
