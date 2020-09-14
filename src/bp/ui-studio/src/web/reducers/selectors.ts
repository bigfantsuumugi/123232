import { FlowNode, NLU } from 'botpress/sdk'
import { isSkillFlow, ParsedFlowDefinition, parseFlowName } from 'common/flow'
import { FlowView, Prompts, Variables } from 'common/typings'
import _ from 'lodash'
import { createSelector } from 'reselect'

import { RootReducer } from '.'

const _getFlowsByName = (state: RootReducer) => state.flows?.flowsByName
const _getCurrentFlow = (state: RootReducer) => state.flows?.currentFlow
const _getCurrentFlowNode = state => state.flows?.currentFlowNode
const _getCurrentHashes = state => state.flows.currentHashes
const _getInitialHashes = state => state.flows.initialHashes
const _getVariableTypes = (state: RootReducer) => state.nlu.entities
const _getPrimitiveVariables = (state: RootReducer) => state.ndu.primitiveVariables
const _getPrompts = (state: RootReducer) => state.ndu.prompts

const prepareUserVarTypes = (variableTypes: NLU.EntityDefinition[]) => {
  return variableTypes
    .filter(x => x.type !== 'system')
    .map(x => ({
      type: x.type.replace('list', 'enumeration'),
      variableType: x.type.replace('list', 'enumeration'),
      subType: x.id,
      label: x.name
    }))
}

const filterGenerics = items => {
  return items
    .filter(x => !['enumeration', 'pattern', 'complex'].includes(x.id))
    .map(x => ({ type: x.id, variableType: x.config?.valueType, label: x.config?.label }))
}

export const getAllFlows = createSelector([_getFlowsByName], (flowsByName): FlowView[] => {
  return _.values(flowsByName)
})

export const getFlowNames = createSelector([getAllFlows], flows => {
  const normalFlows = _.reject(flows, x => isSkillFlow(x.name))
  return normalFlows.map(x => x.name)
})

export const getFlowNamesList = createSelector([getAllFlows], flows => {
  const normalFlows = _.reject(flows, x => isSkillFlow(x.name))

  const references = normalFlows.reduce((acc, flow) => {
    acc[flow.name] = _.flatMap(flow.nodes, node => node.next.map(x => x.node)).filter(x => x.endsWith('.flow.json'))
    return acc
  }, {})

  return normalFlows.map(x => {
    const withTriggers = (x.nodes || []).filter(x => x.type === 'trigger')
    const referencedIn = Object.keys(references).filter(flowName => references[flowName].includes(x.name))

    return { name: x.name, label: x.label, triggerCount: withTriggers.length, referencedIn }
  })
})

export const getCurrentFlow = createSelector(
  [_getFlowsByName, _getCurrentFlow],
  (flowsByName, currFlow): FlowView => {
    return flowsByName[currFlow]
  }
)

export const getPrompts = createSelector(
  [_getVariableTypes, _getPrompts],
  (variableTypes = [], prompts = []): Prompts => {
    return {
      primitive: prompts,
      display: [...filterGenerics(prompts), ...prepareUserVarTypes(variableTypes)].map(x => ({
        ...x,
        icon: prompts.find(v => v.id === x.type)?.config?.icon
      }))
    }
  }
)

export const getVariables = createSelector(
  [_getVariableTypes, _getPrimitiveVariables, getCurrentFlow],
  (variableTypes = [], variables = [], currentFlow): Variables => {
    return {
      currentFlow: currentFlow?.variables,
      primitive: variables,
      display: [...filterGenerics(variables), ...prepareUserVarTypes(variableTypes)].map(x => ({
        ...x,
        icon: variables.find(v => v.id === x.type)?.config?.icon
      }))
    }
  }
)

export const getReusableWorkflows = createSelector([_getFlowsByName], (flowsByName): ParsedFlowDefinition[] => {
  return Object.keys(flowsByName)
    .filter(name => flowsByName[name].type === 'reusable' && !isSkillFlow(name))
    .map(name => parseFlowName(name, true))
})

export const getCallerFlows = createSelector(
  [_getFlowsByName, _getCurrentFlow],
  (flowsByName, currentFlow: string): FlowView[] => {
    return Object.values(flowsByName).filter(x => x.nodes.find(n => n.flow === currentFlow))
  }
)

export const getCallerFlowsOutcomeUsage = createSelector(
  [_getFlowsByName, _getCurrentFlow],
  (flowsByName, currentFlow: string): any => {
    let nodes = []
    Object.values(flowsByName).forEach(flow => {
      nodes = [...nodes, ...flow.nodes.filter(x => x.flow === currentFlow)]
    })

    return _.flatMap(nodes, x => x.next.filter(n => n.node != ''))
  }
)

export const getCurrentFlowNode = createSelector([getCurrentFlow, _getCurrentFlowNode], (currentFlow, currFlowNode):
  | FlowNode
  | undefined => {
  return _.find(currentFlow?.nodes, { id: currFlowNode })
})

export const getNewFlows = createSelector([_getCurrentHashes, _getInitialHashes], (currentHash, initialHash) => {
  return _.without(_.keys(currentHash), ..._.keys(initialHash))
})

export const getDeletedFlows = createSelector([_getCurrentHashes, _getInitialHashes], (currentHash, initialHash) => {
  return _.without(_.keys(initialHash), ..._.keys(currentHash))
})

export const getModifiedFlows = createSelector(
  [_getFlowsByName, _getCurrentHashes, _getInitialHashes],
  (flowsByName, currentHash, initialHash) => {
    const modifiedFlows = []
    _.keys(flowsByName).forEach(flow => {
      if (initialHash[flow] !== currentHash[flow]) {
        modifiedFlows.push(flow)
      }
    })

    return modifiedFlows
  }
)

export const getDirtyFlows = createSelector([getNewFlows, getModifiedFlows], (newFlows, modifiedFlows) => {
  return [...newFlows, ...modifiedFlows]
})

export const canFlowUndo = state => state.flows.undoStack.length > 0

export const canFlowRedo = state => state.flows.redoStack.length > 0
