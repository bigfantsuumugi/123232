import { ContextMenu, Menu, MenuDivider, MenuItem, Position, Toaster } from '@blueprintjs/core'
import _ from 'lodash'
import React, { Component, Fragment } from 'react'
import { Button, Label } from 'react-bootstrap'
import ReactDOM from 'react-dom'
import { connect } from 'react-redux'
import { DiagramEngine, DiagramWidget, NodeModel } from 'storm-react-diagrams'
import {
  buildNewSkill,
  closeFlowNodeProps,
  copyFlowNode,
  createFlow,
  createFlowNode,
  fetchFlows,
  insertNewSkillNode,
  openFlowNodeProps,
  pasteFlowNode,
  removeFlowNode,
  setDiagramAction,
  switchFlow,
  switchFlowNode,
  updateFlow,
  updateFlowNode,
  updateFlowProblems
} from '~/actions'
import { Timeout, toastInfo } from '~/components/Shared/Utils'
import { getCurrentFlow, getCurrentFlowNode } from '~/reducers'

import { SkillDefinition } from '../sidePanel/FlowTools'

import { defaultTransition, DIAGRAM_PADDING, DiagramManager, nodeTypes } from './manager'
import { DeletableLinkFactory } from './nodes/LinkWidget'
import { SkillCallNodeModel, SkillCallWidgetFactory } from './nodes/SkillCallNode'
import { StandardNodeModel, StandardWidgetFactory } from './nodes/StandardNode'
import { ExecuteWidgetFactory } from './nodes_v2/ExecuteNode'
import { ListenWidgetFactory } from './nodes_v2/ListenNode'
import { RouterNodeModel, RouterWidgetFactory } from './nodes_v2/RouterNode'
import { SaySomethingWidgetFactory } from './nodes_v2/SaySomethingNode'
import style from './style.scss'

class Diagram extends Component<Props> {
  private diagramEngine: ExtendedDiagramEngine
  private diagramWidget: DiagramWidget
  private diagramContainer: HTMLDivElement
  private manager: DiagramManager

  constructor(props) {
    super(props)

    this.diagramEngine = new DiagramEngine()
    this.diagramEngine.registerNodeFactory(new StandardWidgetFactory())
    this.diagramEngine.registerNodeFactory(new SkillCallWidgetFactory(this.props.skills))
    this.diagramEngine.registerNodeFactory(new SaySomethingWidgetFactory())
    this.diagramEngine.registerNodeFactory(new ExecuteWidgetFactory())
    this.diagramEngine.registerNodeFactory(new ListenWidgetFactory())
    this.diagramEngine.registerNodeFactory(new RouterWidgetFactory())
    this.diagramEngine.registerLinkFactory(new DeletableLinkFactory())

    // This reference allows us to update flow nodes from widgets
    this.diagramEngine.flowBuilder = this
    this.manager = new DiagramManager(this.diagramEngine, { switchFlowNode: this.props.switchFlowNode })

    // @ts-ignore
    window.highlightNode = (flowName: string, nodeName: string) => {
      this.manager.setHighlightedNodeName(nodeName)

      if (!flowName || !nodeName) {
        // Refreshing the model anyway, to remove the highlight if node is undefined
        this.manager.syncModel()
        return
      }

      try {
        if (this.props.currentFlow.name !== flowName) {
          this.props.switchFlow(flowName)
        } else {
          this.manager.syncModel()
        }
      } catch (err) {
        console.error('Error when switching flow or refreshing', err)
      }
    }
  }

  componentDidMount() {
    this.props.fetchFlows()
    ReactDOM.findDOMNode(this.diagramWidget).addEventListener('click', this.onDiagramClick)
    ReactDOM.findDOMNode(this.diagramWidget).addEventListener('dblclick', this.onDiagramDoubleClick)
    document.getElementById('diagramContainer').addEventListener('keydown', this.onKeyDown)
  }

  componentWillUnmount() {
    ReactDOM.findDOMNode(this.diagramWidget).removeEventListener('click', this.onDiagramClick)
    ReactDOM.findDOMNode(this.diagramWidget).removeEventListener('dblclick', this.onDiagramDoubleClick)
    document.getElementById('diagramContainer').removeEventListener('keydown', this.onKeyDown)
  }

  componentDidUpdate(prevProps) {
    this.manager.setCurrentFlow(this.props.currentFlow)
    this.manager.setReadOnly(this.props.readOnly)

    if (this.diagramContainer) {
      this.manager.setDiagramContainer(this.diagramWidget, {
        width: this.diagramContainer.offsetWidth,
        height: this.diagramContainer.offsetHeight
      })
    }

    const isDifferentFlow = _.get(prevProps, 'currentFlow.name') !== _.get(this, 'props.currentFlow.name')

    if (!this.props.currentFlow) {
      this.manager.clearModel()
    } else if (!prevProps.currentFlow || isDifferentFlow) {
      // Update the diagram model only if we changed the current flow
      this.manager.initializeModel()
      this.checkForProblems()
    } else {
      // Update the current model with the new properties
      this.manager.syncModel()
    }
  }

  handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault()

    const element = this.diagramWidget.getMouseElement(event)
    const target = element && element.model
    const targetName = _.get(element, 'model.name')
    const flowPosition = this.manager.getRealPosition(event)

    const canMakeStartNode = () => {
      const current = this.props.currentFlow && this.props.currentFlow.startNode
      return current && targetName && current !== targetName
    }

    const setAsCurrentNode = () => this.props.updateFlow({ startNode: targetName })
    const isStartNode = targetName === this.props.currentFlow.startNode
    const isNodeTargeted = target instanceof NodeModel

    // Prevents diisplaying an empty menu
    if ((!isNodeTargeted && !this.props.canPasteNode) || this.props.readOnly) {
      return
    }

    ContextMenu.show(
      <Menu>
        {!isNodeTargeted && this.props.canPasteNode && (
          <MenuItem icon="clipboard" text="Paste" onClick={() => this.pasteElementFromBuffer(flowPosition)} />
        )}
        {isNodeTargeted && (
          <Fragment>
            <MenuItem icon="trash" text="Delete" disabled={isStartNode} onClick={() => this.deleteSelectedElements()} />
            <MenuItem
              icon="duplicate"
              text="Copy"
              onClick={() => {
                this.props.switchFlowNode(target.id)
                this.copySelectedElementToBuffer()
              }}
            />
            <MenuDivider />
            <MenuItem
              icon="star"
              text="Set as Start Node"
              disabled={!canMakeStartNode()}
              onClick={() => setAsCurrentNode()}
            />
            <MenuItem
              icon="minimize"
              text="Disconnect Node"
              onClick={() => {
                this.manager.disconnectPorts(target)
                this.checkForLinksUpdate()
              }}
            />
          </Fragment>
        )}
      </Menu>,
      { left: event.clientX, top: event.clientY }
    )
  }

  checkForProblems() {
    this.props.updateFlowProblems(this.manager.getNodeProblems())
  }

  createFlow(name: string) {
    this.props.createFlow(name + '.flow.json')
  }

  onDiagramDoubleClick = (event?: MouseEvent) => {
    if (event) {
      // We only keep 3 events for dbl click: full flow, standard nodes and skills. Adding temporarily router so it's editable
      const target = this.diagramWidget.getMouseElement(event)
      if (
        target &&
        !(
          target.model instanceof StandardNodeModel ||
          target.model instanceof SkillCallNodeModel ||
          target.model instanceof RouterNodeModel
        )
      ) {
        return
      }
    }

    // TODO: delete this once 12.2.1 is out
    toastInfo('Pssst! Just click once a node to inspect it, no need to double-click anymore.', Timeout.LONG)
  }

  canTargetOpenInspector = target => {
    if (!target) {
      return false
    }

    const targetModel = target.model
    return (
      targetModel instanceof StandardNodeModel ||
      targetModel instanceof SkillCallNodeModel ||
      target.model instanceof RouterNodeModel
    )
  }

  onDiagramClick = (event: MouseEvent) => {
    const selectedNode = this.manager.getSelectedNode() as BpNodeModel
    const currentNode = this.props.currentFlowNode
    const target = this.diagramWidget.getMouseElement(event)

    this.manager.sanitizeLinks()
    this.manager.cleanPortLinks()

    this.canTargetOpenInspector(target) ? this.props.openFlowNodeProps() : this.props.closeFlowNodeProps()

    if (!selectedNode) {
      this.props.closeFlowNodeProps()
      this.props.switchFlowNode(null)
    } else if (selectedNode && (!currentNode || selectedNode.id !== currentNode.id)) {
      // Different node selected
      this.props.switchFlowNode(selectedNode.id)
    }

    if (selectedNode && (selectedNode.oldX !== selectedNode.x || selectedNode.oldY !== selectedNode.y)) {
      this.props.updateFlowNode({ x: selectedNode.x, y: selectedNode.y })
      Object.assign(selectedNode, { oldX: selectedNode.x, oldY: selectedNode.y })
    }

    this.checkForLinksUpdate()
  }

  checkForLinksUpdate() {
    const links = this.manager.getLinksRequiringUpdate()
    if (links) {
      this.props.updateFlow({ links })
    }

    this.checkForProblems()
  }

  deleteSelectedElements() {
    const elements = _.sortBy(this.diagramEngine.getDiagramModel().getSelectedItems(), 'nodeType')

    // Use sorting to make the nodes first in the array, deleting the node before the links
    for (const element of elements) {
      if (!this.diagramEngine.isModelLocked(element)) {
        if (element['isStartNode']) {
          return alert("You can't delete the start node.")
        } else if (
          // @ts-ignore
          _.includes(nodeTypes, element.nodeType) ||
          _.includes(nodeTypes, element.type)
        ) {
          this.props.removeFlowNode(element.id)
        } else if (element.type === 'default') {
          element.remove()
          this.checkForLinksUpdate()
        } else {
          element.remove() // it's a point or something else
        }
      }
    }

    this.diagramWidget.forceUpdate()
    this.checkForProblems()
  }

  copySelectedElementToBuffer() {
    this.props.copyFlowNode()
    Toaster.create({
      className: 'recipe-toaster',
      position: Position.TOP_RIGHT
    }).show({ message: 'Copied to buffer' })
  }

  pasteElementFromBuffer(position?) {
    if (position) {
      this.props.pasteFlowNode(position)
    } else {
      const { offsetX, offsetY } = this.manager.getActiveModelOffset()
      this.props.pasteFlowNode({ x: -offsetX + DIAGRAM_PADDING, y: -offsetY + DIAGRAM_PADDING })
    }

    this.manager.unselectAllElements()
  }

  onKeyDown = event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'c') {
      this.copySelectedElementToBuffer()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      this.pasteElementFromBuffer()
    } else if (event.code === 'Backspace' || event.code === 'Delete') {
      this.deleteSelectedElements()
    }
  }

  handleFlowWideClicked = () => {
    this.props.switchFlowNode(null)
    this.props.openFlowNodeProps()
  }

  renderCatchAllInfo() {
    const nbNext = _.get(this.props.currentFlow, 'catchAll.next.length', 0)

    return (
      <div>
        <Button bsStyle="link" onClick={this.handleFlowWideClicked}>
          <Label bsStyle={nbNext > 0 ? 'primary' : 'default'}>{nbNext}</Label> flow-wide
          {nbNext === 1 ? ' transition' : ' transitions'}
        </Button>
      </div>
    )
  }

  handleToolDropped = async (event: React.DragEvent) => {
    if (this.props.readOnly) {
      return
    }

    this.manager.unselectAllElements()
    const data = JSON.parse(event.dataTransfer.getData('diagram-node'))

    const { x, y } = this.manager.getRealPosition(event)

    if (data.type === 'chip') {
      await this._addTransitionChipToRouter(event)
    } else if (data.type === 'skill') {
      this.props.buildSkill({ location: { x, y }, id: data.id })
    } else if (data.type === 'node') {
      // The following nodes needs default transitions
      if (data.id === 'say_something' || data.id === 'execute') {
        this.props.createFlowNode({ x, y, type: data.id, next: [defaultTransition] })
      } else if (data.id === 'listen') {
        this.props.createFlowNode({ x, y, type: data.id, onReceive: [], next: [defaultTransition] })
      } else {
        this.props.createFlowNode({ x, y, type: data.id })
      }
    }
  }

  private async _addTransitionChipToRouter(event) {
    if (this.props.readOnly) {
      return
    }

    const target = this.diagramWidget.getMouseElement(event)
    if (target && target.model instanceof RouterNodeModel) {
      await this.props.switchFlowNode(target.model.id)
      this.props.updateFlowNode({ next: [...this.props.currentFlowNode.next, defaultTransition] })
    }
  }

  render() {
    return (
      <div
        id="diagramContainer"
        ref={ref => (this.diagramContainer = ref)}
        tabIndex={1}
        style={{ outline: 'none', width: '100%', height: '100%' }}
        onContextMenu={this.handleContextMenu}
        onDrop={this.handleToolDropped}
        onDragOver={event => event.preventDefault()}
      >
        <div className={style.floatingInfo}>{this.renderCatchAllInfo()}</div>

        <DiagramWidget
          ref={w => (this.diagramWidget = w)}
          deleteKeys={[]}
          diagramEngine={this.diagramEngine}
          inverseZoom={true}
        />
      </div>
    )
  }
}

interface Props {
  currentFlow: any
  switchFlow: (flowName: string) => void
  switchFlowNode: (nodeId: string) => any
  updateFlowProblems: (problems: NodeProblem[]) => void
  openFlowNodeProps: () => void
  closeFlowNodeProps: () => void
  updateFlow: any
  createFlowNode: (props: any) => void
  createFlow: (name: string) => void
  insertNewSkillNode: any
  updateFlowNode: any
  fetchFlows: any
  setDiagramAction: any
  pasteFlowNode: ({ x, y }) => void
  currentDiagramAction: any
  copyFlowNode: () => void
  currentFlowNode: any
  removeFlowNode: any
  buildSkill: any
  readOnly: boolean
  canPasteNode: boolean
  flowPreview: boolean
  skills: SkillDefinition[]
}

interface NodeProblem {
  nodeName: string
  missingPorts: any
}

type BpNodeModel = StandardNodeModel | SkillCallNodeModel

type ExtendedDiagramEngine = {
  enableLinkPoints?: boolean
  flowBuilder?: any
} & DiagramEngine

const mapStateToProps = state => ({
  flows: state.flows,
  currentFlow: getCurrentFlow(state),
  currentFlowNode: getCurrentFlowNode(state),
  currentDiagramAction: state.flows.currentDiagramAction,
  canPasteNode: Boolean(state.flows.nodeInBuffer),
  skills: state.skills.installed
})

const mapDispatchToProps = {
  fetchFlows,
  switchFlowNode,
  openFlowNodeProps,
  closeFlowNodeProps,
  setDiagramAction,
  createFlowNode,
  removeFlowNode,
  createFlow,
  updateFlowNode,
  switchFlow,
  updateFlow,
  copyFlowNode,
  pasteFlowNode,
  insertNewSkillNode,
  updateFlowProblems,
  buildSkill: buildNewSkill
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
  null,
  { withRef: true }
)(Diagram)
