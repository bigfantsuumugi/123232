import axios from 'axios'
import * as sdk from 'botpress/sdk'
import { FlowView } from 'common/typings'
import _ from 'lodash'

import { Config } from '../config'

import { ActionPredictions, ActionType, ActionTypes, dataset, Trainer } from './training/trainer'
import { Features, Model } from './typings'
import { getTriggerId, stringToVec, WfIdToTopic } from './utils'

const debug = DEBUG('ndu').sub('processing')

export const DEFAULT_MIN_CONFIDENCE = 0.1
const fakeConditions = ['on_active_workflow', 'on_active_topic']

export class UnderstandingEngine {
  private _allTopicIds: Set<string> = new Set()
  private _allNodeIds: Set<string> = new Set()
  private _allWfIds: Set<string> = new Set()

  private _allTriggers?: sdk.NDU.Trigger[]
  private _minConfidence: number

  private trainer: Trainer
  private predictor: sdk.MLToolkit.SVM.Predictor
  private loadedModelHash: string

  constructor(
    private bp: typeof sdk,
    private botId: string,
    private _dialogConditions: sdk.Condition[],
    config: Config
  ) {
    this.trainer = new Trainer(bp, botId)
    this._minConfidence = config.minimumConfidence ?? DEFAULT_MIN_CONFIDENCE
  }

  async loadModel(model: Model) {
    if (this.loadedModelHash !== undefined && this.loadedModelHash === model.hash) {
      return
    }

    this.predictor = new this.bp.MLToolkit.SVM.Predictor(model.data)
    this.loadedModelHash = model.hash
  }

  featToVec(features: Features): number[] {
    const triggerId = stringToVec(
      _.flatten(this._allTriggers.map(x => getTriggerId(x))),
      features.current_highest_ranking_trigger_id
    )

    const nodeId = stringToVec([...this._allNodeIds], features.current_node_id)
    const wfId = stringToVec([...this._allWfIds], features.current_workflow_id)
    const actionName = stringToVec([...ActionTypes], features.last_turn_action_name)

    const other = [
      features.last_turn_same_highest_ranking_trigger_id,
      features.last_turn_same_node,
      features.last_turn_since,
      features.conf_faq_trigger_inside_topic,
      features.conf_faq_trigger_outside_topic,
      features.conf_faq_trigger_parameter,
      features.conf_node_trigger_inside_wf,
      features.conf_wf_trigger_inside_topic,
      features.conf_wf_trigger_inside_wf,
      features.conf_wf_trigger_outside_topic,
      features.conf_contextual_trigger
    ].map(n => (n === false ? 0 : n === true ? 1 : n))

    return [...triggerId, ...nodeId, ...wfId, ...actionName, ...other]
  }

  queryQna = async (topicName: string, qnaId: string, event: sdk.IO.IncomingEvent): Promise<sdk.NDU.Actions[]> => {
    try {
      const axiosConfig = await this.bp.http.getAxiosConfigForBot(event.botId, { localUrl: true })
      const { data } = await axios.post(
        `/mod/qna/${topicName}/actions/${qnaId}`,
        { userLanguage: event?.state?.user?.language },
        axiosConfig
      )
      const actions: sdk.NDU.Actions[] = data.filter(a => a.action !== 'redirect')
      if (event.state.context?.activePrompt?.status === 'pending') {
        actions.push({ action: 'prompt.repeat' })
      }
      return actions
    } catch (err) {
      this.bp.logger.warn('Could not query qna', err)
      return []
    }
  }

  async trainIfNot() {
    if (!this.predictor) {
      const data = dataset.map(([feat, label]) => ({ label, coordinates: this.featToVec(feat) }))
      await this.trainer.trainOrLoad(data)
    }
  }

  async processEvent(event: sdk.IO.IncomingEvent) {
    Object.assign(event, {
      ndu: {
        triggers: [],
        actions: []
      }
    })

    if (event.type !== 'text' && event.type !== 'quick_reply' && event.type !== 'workflow_ended') {
      return
    }

    const nduContext = event.state.session.nduContext
    const currentFlow = event.state.context?.currentFlow ?? 'n/a'
    // TODO : sync this with transitionTo and jumpTo
    const currentTopic = nduContext?.last_topic ?? 'n/a'
    const currentNode = event.state.context?.currentNode ?? 'n/a'
    const isInMiddleOfFlow = currentFlow !== 'n/a'

    debug('Processing %o', { currentFlow, currentNode, isInMiddleOfFlow })

    // Then process triggers on what the NDU decided
    await this._processTriggers(event)

    //////////////////////////
    // Possible outcomes
    //////////////////////////

    // [Outside of workflow]
    // - Answer with FAQ
    // - Start a workflow
    // - Misunderstood
    // [In middle of flow]
    // - Continue processing flow (node trigger)
    // - Conitnue processing flow (internal workflow trigger) [later]
    // - Answer with FAQ inside current topic
    // - Answer with FAQ outside current topic
    // - Start an other workflow inside the same topic
    // - Start an other workflow in other topic

    // Features
    // - time since last input
    // - number of turns in workflow
    // - number of turns on same node
    // - confidence of faq outside topic
    // - confidence of faq inside topic
    // - confidence of wf trigger inside topic
    // - confidence of wf trigger outside topic
    // - confidence of wf trigger inside workflow
    // - last action name
    // X highest ranking trigger
    // X last turn higest ranking trigger same

    // TODO: NDU Maybe introduce trigger boosts in some circumstances, eg. exact match on workflow node or button click

    /** This metadata is persisted to be able to compute the "over-time" features the next turn */
    const metadata: sdk.IO.NduContext = Object.assign(
      {
        last_turn_action_name: 'n/a',
        last_turn_highest_ranking_trigger_id: 'n/a',
        last_turn_node_id: 'n/a',
        last_turn_ts: Date.now(),
        last_topic: ''
      },
      event.state.session.nduContext ?? {}
    )

    // TODO: NDU compute & rank triggers

    const triggers = _.toPairs(event.ndu.triggers).map(([id, result]) => {
      const confidence = Object.values(result.result).reduce((prev, next) => prev * next, 1)
      return {
        id,
        confidence,
        trigger: result.trigger,
        topic: id.split('/')[1],
        wf: (result.trigger as sdk.NDU.NodeTrigger | sdk.NDU.WorkflowTrigger).workflowId,
        nodeId: (result.trigger as sdk.NDU.NodeTrigger).nodeId
      }
    })

    const fType = (...types: sdk.NDU.Trigger['type'][]) => (t: typeof triggers) =>
      t.filter(x => types.includes(x.trigger.type))
    const fInTopic = (t: typeof triggers) =>
      t.filter(x => (x.topic === currentTopic && currentTopic !== 'n/a') || x.topic === 'skills')
    const fOutTopic = (t: typeof triggers) => t.filter(x => x.topic !== currentTopic || currentTopic === 'n/a')
    const fInWf = (t: typeof triggers) => t.filter(x => `${x.wf}.flow.json` === currentFlow)
    const fOnNode = (t: typeof triggers) => t.filter(x => x.nodeId === currentNode)
    const fMax = (t: typeof triggers) => _.maxBy(t, 'confidence') || { confidence: 0, id: 'n/a' }
    const fMinConf = (t: typeof triggers) => t.filter(x => x.confidence >= this._minConfidence)

    const actionFeatures = {
      conf_all: fMax(triggers),
      conf_faq_trigger_outside_topic: fMax(fOutTopic(fType('faq')(fMinConf(triggers)))),
      conf_faq_trigger_inside_topic: fMax(fInTopic(fType('faq')(fMinConf(triggers)))),
      conf_faq_trigger_parameter: 0, // TODO: doesn't exist yet
      conf_wf_trigger_inside_topic: fMax(fInTopic(fType('workflow')(fMinConf(triggers)))),
      conf_wf_trigger_outside_topic: fMax(fOutTopic(fType('workflow')(fMinConf(triggers)))),
      conf_wf_trigger_inside_wf: 0, // TODO: doesn't exist yet
      conf_node_trigger_inside_wf: fMax(fInTopic(fType('node', 'contextual')(fInWf(fOnNode(fMinConf(triggers)))))),
      conf_contextual_trigger: fMax(fType('contextual')(fMinConf(triggers)))
    }

    const features: Features = {
      ///////////
      // These features allow fitting of exceptional behaviors in specific circumstances
      current_workflow_id: currentFlow,
      current_node_id: currentNode,
      current_highest_ranking_trigger_id: actionFeatures.conf_all.id,
      ///////////
      // Understanding features
      conf_faq_trigger_outside_topic: actionFeatures.conf_faq_trigger_outside_topic.confidence,
      conf_faq_trigger_inside_topic: actionFeatures.conf_faq_trigger_inside_topic.confidence,
      conf_faq_trigger_parameter: 0, // TODO: doesn't exist yet
      conf_wf_trigger_inside_topic: actionFeatures.conf_wf_trigger_inside_topic.confidence,
      conf_wf_trigger_outside_topic: actionFeatures.conf_wf_trigger_outside_topic.confidence,
      conf_wf_trigger_inside_wf: 0, // TODO: doesn't exist yet
      conf_node_trigger_inside_wf: actionFeatures.conf_node_trigger_inside_wf.confidence,
      conf_contextual_trigger: actionFeatures.conf_contextual_trigger.confidence,
      ///////////
      // Over-time features
      last_turn_since: Date.now() - metadata.last_turn_ts,
      last_turn_same_node: isInMiddleOfFlow && metadata.last_turn_node_id === `${currentFlow}/${currentNode}`,
      last_turn_action_name: metadata.last_turn_action_name,
      last_turn_same_highest_ranking_trigger_id:
        metadata.last_turn_highest_ranking_trigger_id === actionFeatures.conf_all.id
    }

    await this.trainIfNot()

    // This can happen if one request acquired the lock and is waiting a training or loading the model
    if (!this.predictor) {
      return
    }

    const predict = async (input: Features): Promise<ActionPredictions> => {
      const vec = this.featToVec(input)
      const preds = await this.predictor.predict(vec)
      // TODO: NDU Put ML here
      // TODO: NDU Import a fine-tuned model for this bot for prediction
      return ActionTypes.reduce<ActionPredictions>((obj, curr) => {
        const pred = preds.find(x => x.label === curr)
        obj[curr] = pred?.confidence ?? 0
        return obj
      }, <any>{})
    }

    const prediction = await predict(features)
    const topAction = _.maxBy(_.toPairs(prediction), '1')[0]

    const actionToTrigger: { [key in ActionType]: string } = {
      faq_trigger_inside_topic: actionFeatures.conf_faq_trigger_inside_topic.id,
      faq_trigger_inside_wf: '',
      faq_trigger_outside_topic: actionFeatures.conf_faq_trigger_outside_topic.id,
      node_trigger_inside_wf: actionFeatures.conf_node_trigger_inside_wf.id,
      wf_trigger_inside_topic: actionFeatures.conf_wf_trigger_inside_topic.id,
      wf_trigger_inside_wf: '',
      wf_trigger_outside_topic: actionFeatures.conf_wf_trigger_outside_topic.id,
      contextual_trigger: actionFeatures.conf_contextual_trigger.id
    }

    event.ndu.predictions = ActionTypes.reduce((obj, action) => {
      obj[action] = {
        confidence: prediction[action],
        triggerId: actionToTrigger[action]
      }
      return obj
    }, {} as any)

    const electedTrigger = event.ndu.triggers[actionToTrigger[topAction]]

    if (electedTrigger) {
      const { trigger } = electedTrigger

      switch (trigger.effect) {
        case 'jump.node':
          const gotoNodeId = (trigger as sdk.NDU.ContextualTrigger).gotoNodeId ?? trigger.nodeId
          const sameWorkflow = trigger.workflowId === currentFlow?.replace('.flow.json', '')
          const sameNode = gotoNodeId === currentNode

          if (!gotoNodeId) {
            break
          }

          event.ndu.actions = [{ action: 'continue' }]

          if (sameWorkflow && !sameNode) {
            event.ndu.actions.unshift({
              action: 'goToNode',
              data: { flow: trigger.workflowId, node: gotoNodeId }
            })
          } else if (!sameWorkflow && !sameNode) {
            event.ndu.actions.unshift({
              action: 'startWorkflow',
              data: { flow: trigger.workflowId, node: gotoNodeId }
            })
          }

          break
        case 'say':
          const t = trigger as sdk.NDU.FaqTrigger
          const qnaActions = await this.queryQna(t.topicName, t.faqId, event)
          event.ndu.actions = [...qnaActions]
          break
        case 'prompt.cancel':
        case 'prompt.inform':
          event.ndu.actions = [{ action: trigger.effect }]
          break
      }
    } else {
      event.ndu.actions = []
    }

    event.state.session.nduContext = {
      ...(event.state.session.nduContext || {}),
      last_turn_action_name: topAction,
      last_turn_highest_ranking_trigger_id: actionFeatures.conf_all.id,
      last_turn_node_id: isInMiddleOfFlow && `${currentFlow}/${currentNode}`,
      last_turn_ts: Date.now(),
      last_topic:
        electedTrigger?.trigger.type === 'workflow'
          ? WfIdToTopic(electedTrigger.trigger.workflowId) || currentTopic
          : currentTopic
    }

    const contextualTriggers = nduContext?.triggers
    if (contextualTriggers) {
      event.state.session.nduContext.triggers = contextualTriggers
        .map(trigger => ({
          ...trigger,
          turn: trigger.turn - 1
        }))
        .filter(
          x =>
            (x.expiryPolicy.strategy === 'turn' && x.turn >= 0) ||
            (x.expiryPolicy.strategy === 'workflow' && !_.isEmpty(event.state.context))
        )
    }

    // TODO: NDU what to do if no action elected
    // TODO: NDU what to do if confused action
  }

  async _processTriggers(event: sdk.IO.IncomingEvent) {
    if (!this._allTriggers) {
      await this._loadBotWorkflows()
    }

    const contextualTriggers = event.state.session.nduContext?.triggers ?? []

    event.ndu.triggers = {}

    const { currentFlow, currentNode } = event.state.context

    for (const trigger of this._allTriggers) {
      if (
        trigger.type === 'node' &&
        (currentFlow !== `${trigger.workflowId}.flow.json` || currentNode !== trigger.nodeId)
      ) {
        continue
      }

      if (
        trigger.type === 'workflow' &&
        ((trigger.activeWorkflow && event.state.context?.currentFlow !== `${trigger.workflowId}.flow.json`) ||
          (trigger.activeTopic && event.state.session.nduContext?.last_topic !== trigger.topicName))
      ) {
        continue
      }

      if (trigger.type === 'contextual') {
        const t = contextualTriggers.find(x => x.workflowId === trigger.workflowId && x.nodeId === trigger.nodeId)

        if (!t) {
          continue
        }
      }

      if (!trigger.conditions.length) {
        continue
      }

      const id = getTriggerId(trigger)
      const result = this._testConditions(event, trigger.conditions)
      event.ndu.triggers[id] = { result, trigger }
    }
  }

  private _testConditions(event: sdk.IO.IncomingEvent, conditions: sdk.DecisionTriggerCondition[]) {
    return conditions.reduce((result, condition) => {
      const executer = this._dialogConditions.find(x => x.id === condition.id)
      if (executer) {
        try {
          result[condition.id] = executer.evaluate(event, condition.params)
        } catch (err) {
          this.bp.logger
            .forBot(event.botId)
            .attachError(err)
            .warn(`Error evaluating NDU condition ${condition.id}`)
          result[condition.id] = -1 // TODO: NDU where do we want to show evaluation errors ?
        }
      } else {
        console.error(`Unknown condition "${condition.id}"`)
      }
      return result
    }, {})
  }

  async invalidateWorkflows() {
    this._allTriggers = undefined
    this.predictor = undefined
    this.loadedModelHash = undefined
  }

  private async _loadBotWorkflows() {
    const flowsPaths = await this.bp.ghost.forBot(this.botId).directoryListing('flows', '*.flow.json')
    // We clone deep because we mutate trigger nodes and it gets saved in ghost cache
    // TODO: ensure ghost returns readonly objects
    const flows: sdk.Flow[] = _.cloneDeep(
      await Promise.map(flowsPaths, async (flowPath: string) => ({
        name: flowPath,
        ...(await this.bp.ghost.forBot(this.botId).readFileAsObject<FlowView>('flows', flowPath))
      }))
    )

    const qnaPaths = await this.bp.ghost.forBot(this.botId).directoryListing('flows', '*/qna.intents.json')
    const faqs: sdk.NLU.IntentDefinition[] = _.flatten(
      await Promise.map(qnaPaths, (qnaPath: string) =>
        this.bp.ghost.forBot(this.botId).readFileAsObject<sdk.NLU.IntentDefinition>('flows', qnaPath)
      )
    ).filter(f => f.metadata?.enabled)

    const triggers: sdk.NDU.Trigger[] = []

    for (const flow of flows) {
      const topicName = flow.name.split('/')[0]
      const flowName = flow.name.replace(/\.flow\.json$/i, '')
      this._allTopicIds.add(topicName)
      this._allWfIds.add(flowName)

      for (const node of flow.nodes) {
        if (node.type === ('listener' as sdk.FlowNodeType)) {
          // TODO: remove this (deprecated)
          this._allNodeIds.add(node.id)
        }

        if (node.type === 'trigger') {
          const tn = node as sdk.TriggerNode
          triggers.push(<sdk.NDU.WorkflowTrigger>{
            conditions: tn.conditions
              .filter(x => x.id !== undefined && !fakeConditions.includes(x.id))
              .map((x, idx) => ({
                ...x,
                params: { ...x.params, topicName, wfName: flowName, nodeName: tn.name, conditionIndex: idx }
              })),
            type: 'workflow',
            effect: 'jump.node',
            workflowId: flowName,
            topicName,
            activeWorkflow: tn.activeWorkflow,
            activeTopic: tn.activeTopic,
            nodeId: tn.name
          })
        } else if ((<sdk.ListenNode>node)?.triggers?.length || node.type === 'prompt') {
          const ln = node as sdk.ListenNode

          if (node.type === 'prompt') {
            // TODO: Add triggers on the node itself instead of hardcoded here
            ln.triggers = [
              {
                type: 'node',
                name: 'prompt_yes',
                effect: 'prompt.inform',
                conditions: [{ id: 'prompt_listening' }, { id: 'user_intent_yes' }]
              },
              {
                type: 'node',
                name: 'prompt_no',
                effect: 'prompt.inform',
                conditions: [{ id: 'prompt_listening' }, { id: 'user_intent_no' }]
              },
              {
                type: 'node',
                name: 'prompt_inform',
                effect: 'prompt.inform',
                conditions: [
                  { id: 'prompt_listening' },
                  { id: 'custom_confidence', params: { confidence: 0.7 } } // TODO: inform by type of prompt
                  // { id: 'user_intent_is', params: { intentName: 'inform' } } // TODO: potentially custom intent
                ]
              },
              {
                type: 'node',
                name: 'prompt_cancel',
                effect: 'prompt.cancel',
                conditions: [
                  { id: 'prompt_listening' },
                  { id: 'prompt_cancellable' },
                  { id: 'user_intent_is', params: { intentName: 'cancel', topicName: 'global' } } // TODO: potentially custom intent
                ]
              }
            ]

            // TODO: Add temporal listeners that check if the user changes his mind (next version)
          }

          for (const [idx, trigger] of ln.triggers.entries()) {
            if (trigger.type === 'node' || trigger.type === 'contextual') {
              const contextualArgs =
                trigger.type === 'contextual' ? { contextName: `explicit:${flowName}/${ln.name}` } : {}
              const nodeTrigger: sdk.NDU.NodeTrigger | sdk.NDU.ContextualTrigger = {
                nodeId: ln.name,
                name: trigger.name,
                effect: trigger.effect,
                conditions: trigger.conditions.map(x => ({
                  ...x,
                  params: {
                    topicName,
                    wfName: flowName,
                    nodeName: ln.name,
                    conditionIndex: idx,
                    ...contextualArgs,
                    ...x.params
                  }
                })),
                type: trigger.type,
                gotoNodeId: (trigger as any).gotoNodeId,
                workflowId: flowName
              }
              triggers.push(nodeTrigger)
            }
          }
        }
      }
    }

    for (const faq of faqs) {
      for (const topicName of faq.contexts) {
        triggers.push(<sdk.NDU.FaqTrigger>{
          topicName,
          conditions: [
            {
              id: 'user_intent_is', // TODO: this should be moved somewhere else
              params: {
                intentName: faq.name,
                topicName
              }
            }
          ],
          faqId: faq.name,
          type: 'faq',
          effect: 'say'
        })
      }
    }

    this._allTriggers = triggers
  }
}
