import * as sdk from 'botpress/sdk'
import { Request, Response } from 'express'
import _ from 'lodash'

import { ScopedBots } from './qna'
import { getQnaEntryPayloads } from './utils'

export default async (bp: typeof sdk, bots: ScopedBots) => {
  const router = bp.http.createRouterForBot('qna')

  router.get('/:topicName/questions', async (req: Request, res: Response) => {
    try {
      const { storage } = bots[req.params.botId]
      const items = await storage.fetchItems(req.params.topicName)
      // TODO implement filtering
      const filteredItems = items.filter(qna =>
        // Flat allow to get the search in all the languages
        // @ts-ignore
        [...Object.values(qna.questions).flat(), ...Object.values(qna.answers).flat()].filter(q => q.includes(req.query.question)).length > 0
      )

      const data = { count: items.length, items: filteredItems }
      res.send(data)
    } catch (e) {
      console.log(e)
      bp.logger.attachError(e).error('Error listing questions')
      res.status(500).send(e.message || 'Error')
    }
  })

  router.post('/:topicName/questions', async (req: Request, res: Response, next: Function) => {
    try {
      const { storage } = bots[req.params.botId]
      const id = await storage.updateSingleItem(req.params.topicName, req.body)
      res.send(id)
    } catch (e) {
      next(new Error(e.message))
    }
  })

  router.get('/:topicName/questions/:id', async (req: Request, res: Response) => {
    try {
      const { storage } = bots[req.params.botId]
      const items = await storage.fetchItems(req.params.topicName)
      const item = items.find(x => x.id === req.params.id)
      if (!item) {
        throw new Error(`QnA "${req.params.id}" Not found`)
      }
      res.send(item)
    } catch (e) {
      sendToastError('Fetch', e.message)
    }
  })

  router.post('/:topicName/questions/:id', async (req: Request, res: Response, next: Function) => {
    try {
      const { storage } = bots[req.params.botId]
      await storage.updateSingleItem(req.params.topicName, { ...req.body, id: req.params.id })
      const items = await storage.fetchItems(req.params.topicName)
      // TODO: implement filtering
      const item = items.find(x => x.id === req.params.id)
      if (!item) {
        throw new Error(`QnA "${req.params.id}" Not found`)
      }
      res.send({ items: item })
    } catch (e) {
      next(new Error(e.message))
    }
  })

  router.post('/:topicName/questions/:id/delete', async (req: Request, res: Response) => {
    try {
      const { storage } = bots[req.params.botId]
      await storage.deleteSingleItem(req.params.topicName, req.params.id)
      const items = await storage.fetchItems(req.params.topicName)
      res.send(items)
    } catch (e) {
      bp.logger.attachError(e).error(`Could not delete QnA #${req.params.id}`)
      res.status(500).send(e.message || 'Error')
      sendToastError('Delete', e.message)
    }
  })

  router.post('/:topicName/actions/:id', async (req: Request, res: Response) => {
    try {
      const { storage } = bots[req.params.botId]
      const items = await storage.fetchItems(req.params.topicName, req.params.id)
      const item = items.find(x => x.id === req.params.id)
      const payloads = await getQnaEntryPayloads(item, req.body.userLanguage, bots[req.params.botId].defaultLang)
      res.send([
        {
          action: 'send',
          data: { payloads, source: 'qna', sourceDetails: `${req.params.topicName}/${req.params.id}` }
        }
      ])
    } catch (err) {
      bp.logger.attachError(err).error(err.message)
      res.status(200).send([])
    }
  })

  const sendToastError = (action: string, error: string) => {
    bp.realtime.sendPayload(
      bp.RealTimePayload.forAdmins('toast.qna-save', { text: `QnA ${action} Error: ${error}`, type: 'error' })
    )
  }
}
