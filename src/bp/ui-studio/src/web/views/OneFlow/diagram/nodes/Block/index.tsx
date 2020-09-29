import { Intent, Menu, MenuItem } from '@blueprintjs/core'
import { DecisionTriggerCondition, ExecuteNode, Flow, FormData, SubWorkflowNode } from 'botpress/sdk'
import { contextMenu, lang, sharedStyle, ShortcutLabel, toast } from 'botpress/shared'
import { parseFlowName } from 'common/flow'
import { FlowView } from 'common/typings'
import React, { FC } from 'react'
import { AbstractNodeFactory, DiagramEngine } from 'storm-react-diagrams'
import { BaseNodeModel } from '~/views/FlowBuilder/diagram/nodes/BaseNodeModel'
import { StandardPortWidget } from '~/views/FlowBuilder/diagram/nodes/Ports'

import { NodeDebugInfo } from '../../debugger'
import ActionContents from '../ActionContents'
import style from '../Components/style.scss'
import NodeHeader from '../Components/NodeHeader'
import NodeWrapper from '../Components/NodeWrapper'
import ExecuteContents from '../ExecuteContents'
import PromptContents from '../PromptContents'
import RouterContents from '../RouterContents'
import SaySomethingContents from '../SaySomethingContents'
import SubworkflowContents from '../SubworkflowContents'
import TriggerContents from '../TriggerContents'

interface Props {
  node: BlockModel
  getCurrentFlow: () => FlowView
  onDeleteSelectedElements: () => void
  editNodeItem: (node: BlockModel, index: number) => void
  selectedNodeItem: () => { node: BlockModel; index: number }
  getConditions: () => DecisionTriggerCondition[]
  switchFlowNode: (id: string) => void
  addCondition: (nodeType: string) => void
  addMessage: () => void
  getLanguage?: () => { currentLang: string; defaultLang: string }
  getExpandedNodes: () => string[]
  setExpanded: (id: string, expanded: boolean) => void
  getDebugInfo: (nodeName: string) => NodeDebugInfo
  getFlows: () => Flow[]
}

const defaultLabels = {
  action: 'studio.flow.node.chatbotExecutes',
  execute: 'studio.flow.node.chatbotExecutes',
  failure: 'studio.flow.node.workflowFails',
  prompt: 'studio.flow.node.chatbotPromptsUser',
  router: 'if',
  say_something: 'studio.flow.node.chatbotSays',
  success: 'studio.flow.node.workflowSucceeds',
  trigger: 'studio.flow.node.triggeredBy',
  'sub-workflow': 'studio.flow.node.subworkflow'
}

const BlockWidget: FC<Props> = ({
  node,
  getCurrentFlow,
  editNodeItem,
  onDeleteSelectedElements,
  selectedNodeItem,
  getConditions,
  switchFlowNode,
  addCondition,
  addMessage,
  getLanguage,
  getExpandedNodes,
  setExpanded,
  getDebugInfo,
  getFlows
}) => {
  const { nodeType } = node
  const { currentLang, defaultLang } = getLanguage()

  const handleContextMenu = e => {
    e.stopPropagation()
    e.preventDefault()

    if (defaultLang && defaultLang !== currentLang) {
      toast.info('studio.flow.cannotAddContent')
      return
    }

    switchFlowNode(node.id)
    contextMenu(
      e,
      <Menu>
        {(nodeType === 'trigger' || nodeType === 'router') && (
          <MenuItem
            text={lang.tr('studio.flow.node.addCondition')}
            onClick={() => {
              addCondition(nodeType)
            }}
          />
        )}
        {nodeType === 'say_something' && (
          <MenuItem
            text={lang.tr('studio.flow.node.addMessage')}
            onClick={() => {
              addMessage()
            }}
          />
        )}
        <MenuItem
          text={
            <div className={sharedStyle.contextMenuLabel}>
              {lang.tr('delete')}
              <ShortcutLabel light keys={['backspace']} />
            </div>
          }
          intent={Intent.DANGER}
          onClick={onDeleteSelectedElements}
        />
      </Menu>
    )
  }

  const inputPortInHeader = !['trigger'].includes(nodeType)
  const outPortInHeader = !['failure', 'prompt', 'router', 'success', 'sub-workflow'].includes(nodeType)
  const canCollapse = !['failure', 'prompt', 'router', 'success', 'sub-workflow'].includes(nodeType)
  const hasContextMenu = !['failure', 'success'].includes(nodeType)

  const debugInfo = getDebugInfo(node.name)

  const renderContents = () => {
    switch (nodeType) {
      case 'action':
        return <ActionContents node={node} editNodeItem={editNodeItem} />
      case 'execute':
        return <ExecuteContents node={node} editNodeItem={editNodeItem} />
      case 'prompt':
        return (
          <PromptContents
            node={node}
            selectedNodeItem={selectedNodeItem}
            defaultLang={defaultLang}
            currentLang={currentLang}
          />
        )
      case 'router':
        return <RouterContents node={node} editNodeItem={editNodeItem} selectedNodeItem={selectedNodeItem} />
      case 'say_something':
        return (
          <SaySomethingContents
            node={node}
            defaultLang={defaultLang}
            editNodeItem={editNodeItem}
            selectedNodeItem={selectedNodeItem}
            currentLang={currentLang}
          />
        )
      case 'trigger':
        return (
          <TriggerContents
            node={node}
            defaultLang={defaultLang}
            editNodeItem={editNodeItem}
            selectedNodeItem={selectedNodeItem}
            getConditions={getConditions}
            currentLang={currentLang}
          />
        )
      case 'sub-workflow':
        const subFlowName = getCurrentFlow()?.nodes.find(x => x.name === node.name)?.flow
        const subFlow = getFlows().find(x => x.name === subFlowName)

        return (
          <SubworkflowContents
            node={node}
            variables={subFlow?.variables || []}
            selectedNodeItem={selectedNodeItem}
            editNodeItem={editNodeItem}
          />
        )
      default:
        return null
    }
  }

  const handleExpanded = expanded => {
    setExpanded(node.id, expanded)
  }

  const expanded = getExpandedNodes().includes(node.id)

  return (
    <NodeWrapper isHighlighed={node.isHighlighted || node.isSelected()}>
      <NodeHeader
        className={style[nodeType]}
        setExpanded={canCollapse && handleExpanded}
        expanded={canCollapse && expanded}
        handleContextMenu={!node.isReadOnly && hasContextMenu && handleContextMenu}
        defaultLabel={
          nodeType === 'sub-workflow' ? parseFlowName(node.flow).workflow : lang.tr(defaultLabels[nodeType])
        }
        debugInfo={debugInfo}
        nodeType={nodeType}
      >
        <StandardPortWidget hidden={!inputPortInHeader} name="in" node={node} className={style.in} />
        {outPortInHeader && <StandardPortWidget name="out0" node={node} className={style.out} />}
      </NodeHeader>
      {(!canCollapse || expanded) && renderContents()}
    </NodeWrapper>
  )
}

export class BlockModel extends BaseNodeModel {
  public conditions: DecisionTriggerCondition[] = []
  public activeWorkflow: boolean
  public isNew: boolean
  public isReadOnly: boolean
  public nodeType: string
  public prompt?
  public contents?: FormData[] = []
  public subflow: SubWorkflowNode
  public flow: string
  public execute: ExecuteNode

  constructor({
    id,
    x,
    y,
    name,
    type,
    flow,
    prompt,
    contents,
    onEnter = [],
    next = [],
    conditions = [],
    subflow = {},
    execute = {},
    activeWorkflow = false,
    isNew = false,
    isStartNode = false,
    isHighlighted = false,
    isReadOnly = false
  }) {
    super('block', id)

    this.setData({
      name,
      prompt,
      contents,
      type,
      onEnter,
      next,
      flow,
      isStartNode,
      isHighlighted,
      conditions,
      subflow,
      execute,
      activeWorkflow,
      isNew,
      isReadOnly
    })

    this.x = this.oldX = x
    this.y = this.oldY = y
  }

  setData({ conditions = [], activeWorkflow = false, isNew = false, ...data }) {
    super.setData(data as any)

    this.conditions = conditions
    this.activeWorkflow = activeWorkflow
    this.isNew = isNew
    this.nodeType = data.type
    this.prompt = data.prompt
    this.contents = data.contents
    this.flow = data.flow
    this.subflow = data.subflow
    this.execute = data.execute
    this.isReadOnly = data.isReadOnly
  }
}

export class BlockWidgetFactory extends AbstractNodeFactory {
  private editNodeItem: (node: BlockModel, index: number) => void
  private selectedNodeItem: () => { node: BlockModel; index: number }
  private deleteSelectedElements: () => void
  private getConditions: () => DecisionTriggerCondition[]
  private getCurrentFlow: () => FlowView
  private switchFlowNode: (id: string) => void
  private addCondition: (nodeType: string) => void
  private addMessage: () => void
  private getLanguage: () => { currentLang: string; defaultLang: string }
  private getExpandedNodes: () => string[]
  private setExpandedNodes: (id: string, expanded: boolean) => void
  private getDebugInfo: (nodeName: string) => NodeDebugInfo
  private getFlows: () => Flow[]

  constructor(methods) {
    super('block')

    this.editNodeItem = methods.editNodeItem
    this.selectedNodeItem = methods.selectedNodeItem
    this.deleteSelectedElements = methods.deleteSelectedElements
    this.getCurrentFlow = methods.getCurrentFlow
    this.getConditions = methods.getConditions
    this.switchFlowNode = methods.switchFlowNode
    this.addCondition = methods.addCondition
    this.addMessage = methods.addMessage
    this.getLanguage = methods.getLanguage
    this.getExpandedNodes = methods.getExpandedNodes
    this.setExpandedNodes = methods.setExpandedNodes
    this.getDebugInfo = methods.getDebugInfo
    this.getFlows = methods.getFlows
  }

  generateReactWidget(diagramEngine: DiagramEngine, node: BlockModel) {
    return (
      <BlockWidget
        node={node}
        getCurrentFlow={this.getCurrentFlow}
        getLanguage={this.getLanguage}
        editNodeItem={this.editNodeItem}
        onDeleteSelectedElements={this.deleteSelectedElements}
        selectedNodeItem={this.selectedNodeItem}
        getConditions={this.getConditions}
        switchFlowNode={this.switchFlowNode}
        addCondition={this.addCondition}
        addMessage={this.addMessage}
        getExpandedNodes={this.getExpandedNodes}
        setExpanded={this.setExpandedNodes}
        getDebugInfo={this.getDebugInfo}
        getFlows={this.getFlows}
      />
    )
  }

  getNewInstance() {
    // @ts-ignore
    return new BlockModel()
  }
}
