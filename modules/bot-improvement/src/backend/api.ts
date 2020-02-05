import axios from 'axios'
import { Topic } from 'botpress/sdk'
import { Response } from 'express'
import _ from 'lodash'

import { Database } from './db'
import { topicsToGoals } from './helpers'
import { FeedbackItem, MessageGroup } from './typings'
import { FeedbackItemSchema } from './validation'

interface FeedbackItemsResponse extends Response {
  send: (body: FeedbackItem[]) => FeedbackItemsResponse
}

interface SessionResponse extends Response {
  send: (body: MessageGroup[]) => SessionResponse
}

export default async (bp: typeof sdk, db: Database) => {
  const router = bp.http.createRouterForBot('bot-improvement')

  router.get('/feedback-items', async (req, res: FeedbackItemsResponse) => {
    const botId = req.params.botId

    const feedbackItems = await db.getFeedbackItems(botId)

    res.send(feedbackItems)
  })

  router.get('/goals', async (req, res) => {
    const axiosConfig = await bp.http.getAxiosConfigForBot(req.params.botId, { localUrl: true })
    const topics: Topic[] = (await axios.get('/mod/ndu/topics', axiosConfig)).data
    const goals = topicsToGoals(topics)
    res.send(goals)
  })

  router.post('/feedback-items/:eventId', async (req, res) => {
    const { error, value } = FeedbackItemSchema.validate(req.body)
    if (error) {
      return res.status(400).send('Body is invalid')
    }

    const { eventId } = req.params
    const { status, correctedActionType, correctedObjectId } = value

    await db.updateFeedbackItem({ eventId, status, correctedActionType, correctedObjectId })

    res.sendStatus(200)
  })

  router.get('/sessions/:sessionId', async (req, res: SessionResponse) => {
    const { sessionId } = req.params

    const messageGroups = await db.getMessageGroups(sessionId)

    res.send(messageGroups)
  })
}
