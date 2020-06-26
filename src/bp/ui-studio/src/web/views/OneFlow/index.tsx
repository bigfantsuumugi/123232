import { lang, MainContainer, utils } from 'botpress/shared'
import { FlowView } from 'common/typings'
import _ from 'lodash'
import React, { useEffect, useRef, useState } from 'react'
import { connect } from 'react-redux'
import { RouteComponentProps, withRouter } from 'react-router-dom'
import {
  clearErrorSaveFlows,
  closeFlowNodeProps,
  flowEditorRedo,
  flowEditorUndo,
  refreshActions,
  refreshIntents,
  refreshLibrary,
  setDiagramAction,
  switchFlow
} from '~/actions'
import { Container } from '~/components/Shared/Interface'
import { Timeout, toastFailure, toastInfo } from '~/components/Shared/Utils'
import { isOperationAllowed } from '~/components/Shared/Utils/AccessControl'
import DocumentationProvider from '~/components/Util/DocumentationProvider'
import { RootReducer } from '~/reducers'

import { PanelPermissions } from '../FlowBuilder/sidePanel'
import SkillsBuilder from '../FlowBuilder/skills'
import style from '../FlowBuilder/style.scss'

import Diagram from './diagram'
import SidePanel from './sidePanel'

interface OwnProps {
  currentMutex: any
}

type StateProps = ReturnType<typeof mapStateToProps>
type DispatchProps = typeof mapDispatchToProps
type Props = DispatchProps & StateProps & OwnProps & RouteComponentProps

const allActions: PanelPermissions[] = ['create', 'rename', 'delete']
const searchTag = '#search:'

const FlowBuilder = (props: Props) => {
  const { flow } = props.match.params as any

  const diagram: any = useRef(null)
  const [showSearch, setShowSearch] = useState(false)
  const [readOnly, setReadOnly] = useState(false)
  const [flowPreview, setFlowPreview] = useState(true)
  const [mutex, setMutex] = useState()
  const [actions, setActions] = useState(allActions)
  const [highlightFilter, setHighlightFilter] = useState()
  const [topicQnA, setTopicQnA] = useState(null)

  useEffect(() => {
    props.refreshActions()
    props.refreshIntents()
    props.refreshLibrary()

    if (!isOperationAllowed({ operation: 'write', resource: 'bot.flows' })) {
      setReadOnly(true)
      setActions([])
    }

    const { hash } = props.location
    setHighlightFilter(hash.startsWith(searchTag) ? hash.replace(searchTag, '') : '')
  }, [])

  useEffect(() => {
    props.currentFlow && pushFlowState(props.currentFlow)
  }, [props.currentFlow])

  useEffect(() => {
    const nextRouteFlow = `${flow}.flow.json`
    if (flow && props.currentFlow !== nextRouteFlow) {
      props.switchFlow(nextRouteFlow)
    }
  }, [flow])

  useEffect(() => {
    if (props.errorSavingFlows) {
      const { status } = props.errorSavingFlows
      const message = status === 403 ? lang.tr('studio.unauthUpdate') : lang.tr('studio.errorWhileSaving')
      toastFailure(message, Timeout.LONG, props.clearErrorSaveFlows, { delayed: true })
    }
  }, [props.errorSavingFlows])

  useEffect(() => {
    const me = props.user.email

    const currentFlow = props.flowsByName[props.currentFlow]
    const { currentMutex } = (currentFlow || {}) as FlowView

    if (currentMutex?.remainingSeconds && currentMutex.lastModifiedBy !== me) {
      setReadOnly(true)
      setActions(['create'])
      setMutex({ currentMutex })
      return
    }

    const someoneElseIsEditingOtherFlow = _.values(props.flowsByName).some(
      f => f.currentMutex?.remainingSeconds && f.currentMutex.lastModifiedBy !== me
    )

    setReadOnly(false)
    setMutex(undefined)

    if (someoneElseIsEditingOtherFlow) {
      setActions(['create'])
      setMutex({ someoneElseIsEditingOtherFlow: true })
    } else {
      setActions(allActions)
    }
  }, [props.flowsByName, props.currentFlow])

  const pushFlowState = flow => props.history.push(`/oneflow/${flow.replace(/\.flow\.json/i, '')}`)

  const keyHandlers = {
    add: e => {
      e.preventDefault()
      props.setDiagramAction('insert_node')
    },
    undo: e => {
      e.preventDefault()
      props.flowEditorUndo()
    },
    redo: e => {
      e.preventDefault()
      props.flowEditorRedo()
    },
    find: e => {
      e.preventDefault()
      setShowSearch(!showSearch)
    },
    'preview-flow': e => {
      e.preventDefault()
      setFlowPreview(true)
    },
    save: e => {
      e.preventDefault()
      toastInfo(lang.tr('studio.nowSaveAuto'), Timeout.LONG)
    },
    delete: e => {
      if (!utils.isInputFocused()) {
        e.preventDefault()
        diagram.current?.deleteSelectedElements()
      }
    },
    cancel: e => {
      e.preventDefault()
      props.closeFlowNodeProps()
      setShowSearch(false)
    }
  }

  const handleFilterChanged = ({ target: { value: highlightFilter } }) => {
    const newUrl = props.location.pathname + searchTag + highlightFilter
    setHighlightFilter(highlightFilter)
    props.history.replace(newUrl)
  }

  const createFlow = name => {
    diagram.current.createFlow(name)
    props.switchFlow(`${name}.flow.json`)
  }

  const pathName = window.location.pathname.split('/')
  const currentWorkflow = pathName.pop()
  let currentTopic = pathName.pop()

  currentTopic = currentTopic === 'oneflow' ? '' : currentTopic

  return (
    <MainContainer keyHandlers={keyHandlers}>
      <SidePanel
        onDeleteSelectedElements={() => diagram.current?.deleteSelectedElements()}
        readOnly={readOnly}
        mutexInfo={mutex}
        permissions={actions}
        flowPreview={flowPreview}
        onCreateFlow={createFlow}
        selectedTopic={currentTopic}
        selectedWorkflow={currentWorkflow}
      />
      <div className={style.diagram}>
        <Diagram
          readOnly={readOnly}
          flowPreview={flowPreview}
          showSearch={showSearch}
          topicQnA={topicQnA}
          hideSearch={() => setShowSearch(false)}
          handleFilterChanged={handleFilterChanged}
          highlightFilter={highlightFilter}
          selectedTopic={currentTopic}
          selectedWorkflow={currentWorkflow}
          childRef={el => {
            if (!!el) {
              diagram.current = el
            }
          }}
        />
      </div>

      <DocumentationProvider file="flows" />
      <SkillsBuilder />
    </MainContainer>
  )
}

const mapStateToProps = (state: RootReducer) => ({
  currentFlow: state.flows.currentFlow,
  flowsByName: state.flows.flowsByName,
  user: state.user,
  errorSavingFlows: state.flows.errorSavingFlows
})

const mapDispatchToProps = {
  switchFlow,
  setDiagramAction,
  flowEditorUndo,
  flowEditorRedo,
  clearErrorSaveFlows,
  closeFlowNodeProps,
  refreshActions,
  refreshIntents,
  refreshLibrary
}

export default connect<StateProps, DispatchProps, OwnProps>(
  mapStateToProps,
  mapDispatchToProps
)(withRouter(FlowBuilder))
