import { Button, Intent, MenuItem } from '@blueprintjs/core'
import axios from 'axios'
import { confirmDialog, EmptyState, Icons, lang, sharedStyle } from 'botpress/shared'
import cx from 'classnames'
import { nextFlowName, nextTopicName, parseFlowName } from 'common/flow'
import _ from 'lodash'
import React, { FC, Fragment, useEffect, useState } from 'react'
import { connect } from 'react-redux'
import {
  deleteFlow,
  deleteTopic,
  duplicateFlow,
  fetchFlows,
  fetchTopics,
  getQnaCountByTopic,
  renameFlow,
  updateFlow
} from '~/actions'
import { SearchBar } from '~/components/Shared/Interface'
import { AccessControl } from '~/components/Shared/Utils'
import { getCurrentFlow, getFlowNamesList, RootReducer } from '~/reducers'
import { sanitizeName } from '~/util'

import { buildFlowName } from '../../../../util/workflows'

import style from './style.scss'
import EmptyStateIcon from './EmptyStateIcon'
import TreeItem from './TreeItem'

const lockedFlows = ['misunderstood.flow.json', 'error.flow.json', 'workflow_ended.flow.json']

export const TYPE_TOPIC = 'topic'
export const TYPES = {
  Topic: 'topic',
  Workflow: 'workflow',
  Folder: 'folder'
}

export interface CountByTopic {
  [topicName: string]: number
}

interface OwnProps {
  readOnly: boolean
  goToFlow: (flow: any) => void
  createWorkflow: (topicId: string) => void
  canAdd: boolean
  canDelete: boolean
  editing: string
  setEditing: (name: string) => void
  isEditingNew: boolean
  setIsEditingNew: (val: boolean) => void
  selectedTopic: string
  selectedWorkflow: string
}

type StateProps = ReturnType<typeof mapStateToProps>
type DispatchProps = typeof mapDispatchToProps

type Props = StateProps & DispatchProps & OwnProps

interface NodeData {
  name: string
  type?: NodeType
  label?: string
  id?: any
  icon?: string
  triggerCount?: number
  topic?: string
  /** List of workflows which have a reference to it */
  referencedIn?: string[]
}

type NodeType = 'workflow' | 'folder' | 'topic' | 'qna' | 'addWorkflow'

const TopicList: FC<Props> = props => {
  const { editing, setEditing, isEditingNew, setIsEditingNew } = props
  const [filter, setFilter] = useState('')
  const [flows, setFlows] = useState<NodeData[]>([])
  const [forcedSelect, setForcedSelect] = useState(false)
  const [expanded, setExpanded] = useState<any>({})

  const filterByText = item =>
    item.name?.toLowerCase()?.includes(filter.toLowerCase()) && !item.name.startsWith('__reusable')

  useEffect(() => {
    props.getQnaCountByTopic()
  }, [])

  useEffect(() => {
    const qna = props.topics.filter(filterByText).map(topic => ({
      name: `${topic.name}/qna`,
      label: lang.tr('module.qna.fullName'),
      type: 'qna' as NodeType,
      icon: 'chat'
    }))

    const filteredFlows = props.flowsName
      .filter(flow => props.topics.some(topic => flow.name.includes(topic.name))) // Hack to prevent race condition sometimes after topic deleted flows are done fetching
      .filter(filterByText)

    setFlows([...qna, ...filteredFlows])
  }, [props.flowsName, filter, props.topics, props.qnaCountByTopic])

  useEffect(() => {
    if (!forcedSelect && props.selectedWorkflow) {
      setExpanded({ [props.selectedTopic || 'default']: true })
      setForcedSelect(true)
    }
  }, [props.selectedTopic, props.selectedWorkflow])

  const deleteFlow = async (name: string, skipDialog = false) => {
    if (
      skipDialog ||
      (await confirmDialog(lang.tr('studio.flow.topicList.confirmDeleteFlow'), { acceptLabel: lang.tr('delete') }))
    ) {
      props.deleteFlow(name)
    }
  }

  const duplicateFlow = (workflowPath: string) => {
    const parsedName = parseFlowName(workflowPath)
    const copyName = nextFlowName(props.flowsName, parsedName.topic, parsedName.workflow)
    props.duplicateFlow({
      flowNameToDuplicate: workflowPath,
      name: copyName
    })
  }

  const moveFlow = (workflowPath: string, newTopicName: string) => {
    const parsed = parseFlowName(workflowPath, true)
    const fullName = buildFlowName({ topic: newTopicName, workflow: parsed.workflow }, true)

    if (!props.flowsName.find(x => x.name === fullName)) {
      props.renameFlow({ targetFlow: workflowPath, name: fullName })
      props.updateFlow({ name: fullName })
    }

    setExpanded({ ...expanded, [newTopicName]: true })
  }

  const moveQna = async (prevTopic: string, newTopic: string) => {
    if (await confirmDialog(lang.tr('studio.flow.topicList.confirmMoveQna'), { acceptLabel: lang.tr('move') })) {
      await axios.post(`${window.BOT_API_PATH}/mod/qna/:${prevTopic}/questions/move`, { newTopic })
      props.getQnaCountByTopic()
      props.goToFlow(`${newTopic}/qna`)
    }
  }

  const deleteTopic = async (name: string, skipDialog = false) => {
    if (
      skipDialog ||
      (await confirmDialog(lang.tr('studio.flow.topicList.confirmDeleteTopic'), { acceptLabel: lang.tr('delete') }))
    ) {
      props.deleteTopic(name)
      props.fetchFlows()

      if (name === props.selectedTopic) {
        props.goToFlow(undefined)
      }
    }
  }

  const duplicateTopic = async (name: string) => {
    const flowsToCopy = props.flowsName.filter(x => parseFlowName(x.name).topic === name)
    const newName = nextTopicName(props.topics, name)

    await axios.post(`${window.BOT_API_PATH}/topic`, { name: newName })
    props.fetchTopics()

    for (const flow of flowsToCopy) {
      const parsedName = parseFlowName(flow.name, true)
      const newWorkflowName = buildFlowName({ topic: newName, workflow: parsedName.workflow }, true)
      props.duplicateFlow({
        flowNameToDuplicate: flow.name,
        name: newWorkflowName
      })
    }
  }

  const sanitize = (name: string) => {
    return sanitizeName(name).replace(/\//g, '-')
  }

  const handleContextMenu = (element: NodeData, isTopic: boolean, path: string) => {
    if (isTopic) {
      const folder = element.id
      if (folder === 'default' || element.type === 'qna') {
        return null
      }

      return (
        <Fragment>
          {/* TODO permission check here */}
          <MenuItem
            id="btn-edit"
            label={lang.tr('studio.flow.sidePanel.renameTopic')}
            onClick={() => {
              setEditing(path)
              setIsEditingNew(false)
            }}
          />
          <MenuItem
            id="btn-duplicate"
            label={lang.tr('studio.flow.sidePanel.duplicateTopic')}
            onClick={async () => {
              await duplicateTopic(folder)
            }}
          />
          <MenuItem
            id="btn-delete"
            label={lang.tr('studio.flow.topicList.deleteTopic')}
            intent={Intent.DANGER}
            onClick={() => deleteTopic(folder)}
          />
        </Fragment>
      )
    } else {
      const { name, type } = element as NodeData

      if (type === 'qna') {
        return (
          <Fragment>
            <MenuItem id="btn-moveQna" label={lang.tr('studio.flow.topicList.moveQna')}>
              {props.topics
                ?.filter(t => t.name !== element.topic!)
                .map(topic => (
                  <MenuItem label={topic.name} key={topic.name} onClick={() => moveQna(element.topic!, topic.name)} />
                ))}
            </MenuItem>
          </Fragment>
        )
      } else {
        return (
          <Fragment>
            <MenuItem
              id="btn-edit"
              disabled={props.readOnly}
              label={lang.tr('studio.flow.sidePanel.renameWorkflow')}
              onClick={() => {
                setEditing(path)
                setIsEditingNew(false)
              }}
            />
            <MenuItem id="btn-moveTo" disabled={props.readOnly} label={lang.tr('studio.flow.sidePanel.moveWorkflow')}>
              {props.topics
                ?.filter(t => t.name !== element.topic!)
                .map(topic => (
                  <MenuItem
                    label={topic.name}
                    key={topic.name}
                    onClick={() => {
                      moveFlow(name, topic.name)
                    }}
                  />
                ))}
            </MenuItem>
            <MenuItem
              id="btn-duplicate"
              label={lang.tr('studio.flow.sidePanel.duplicateWorkflow')}
              onClick={() => {
                duplicateFlow(name)
              }}
            />
            <MenuItem
              id="btn-delete"
              disabled={lockedFlows.includes(name) || !props.canDelete || props.readOnly}
              label={lang.tr('delete')}
              intent={Intent.DANGER}
              onClick={() => deleteFlow(name)}
            />
          </Fragment>
        )
      }
    }
  }

  const newFlows = {}

  for (const workflow of flows) {
    const splitPath = workflow.name.split('/')
    const nodeLabel = splitPath.pop().replace('.flow.json', '')
    // TODO refactor and use existing utils for that https://github.com/botpress/botpress/pull/3272/files#diff-13a273103517c41a0c7dfec1c06f75b3

    if (!splitPath.length) {
      if (!newFlows['default']) {
        newFlows['default'] = {
          type: 'default',
          id: 'default',
          label: lang.tr('studio.flow.topicList.defaultWorkflows'),
          children: {
            [nodeLabel]: { ...workflow, id: workflow.name.replace('.flow.json', '') }
          }
        }
      } else {
        newFlows['default'].children[nodeLabel] = { ...workflow, id: workflow.name.replace('.flow.json', '') }
      }
    }

    splitPath.reduce((acc, parent, index) => {
      if (!acc[parent]) {
        acc[parent] = { id: parent, children: {} }
      }

      if (index === splitPath.length - 1) {
        if (acc[parent].children[nodeLabel]) {
          acc[parent].children[nodeLabel] = {
            ...acc[parent].children[nodeLabel],
            ...workflow,
            topic: splitPath.join('/'),
            id: nodeLabel
          }
        } else {
          acc[parent].children[nodeLabel] = { ...workflow, id: nodeLabel, topic: splitPath.join('/'), children: {} }
        }
      }

      return acc[parent].children
    }, newFlows)
  }

  const sortItems = flows => {
    return flows.sort((a, b) => {
      if (a.id === editing && isEditingNew) {
        return -1
      }
      const aItem = a.id.toUpperCase()
      const bItem = b.id.toUpperCase()
      if (a.type === 'default' || b.type === 'qna') {
        return 1
      }
      if (a.type === 'qna' || b.type === 'default') {
        return -1
      }
      if (aItem < bItem) {
        return -1
      }
      if (aItem > bItem) {
        return 1
      }
      return 0
    })
  }

  const getFlattenFlows = (flows): any => {
    return sortItems(Object.values(flows)).reduce((acc: any, flow: any): any => {
      acc.push({ ...flow, children: flow.children ? getFlattenFlows(flow.children) : [] })

      return acc
    }, [])
  }

  const handleClick = ({ path, isTopic, ...item }): void => {
    if (item.children.length) {
      setExpanded({ ...expanded, [path]: !expanded[path] })
    }

    if (!isTopic) {
      props.goToFlow(item.name)
    }
  }

  const handleSave = async (item, isTopic: boolean, value: string) => {
    setEditing(undefined)
    setIsEditingNew(false)

    if (isTopic) {
      if (value !== item.id && !props.topics.find(x => x.name == value)) {
        await axios.post(`${window.BOT_API_PATH}/topic/${item.id}`, { name: value, description: undefined })

        if (expanded[item.id] || isEditingNew) {
          setExpanded({ ...expanded, [item.id]: false, [value]: true })
        }

        await props.fetchFlows()
        await props.fetchTopics()
        props.goToFlow(isEditingNew ? `${value}/qna` : props.currentFlow?.location.replace(item.id, value))
      } else if (isEditingNew) {
        setExpanded({ ...expanded, [value]: true })
        props.goToFlow(`${value}/qna`)
      }
    } else if (value !== (item.name || item.id)) {
      const fullName = buildFlowName({ topic: item.topic, workflow: sanitize(value) }, true)

      if (!props.flowsName.find(x => x.name === fullName)) {
        props.renameFlow({ targetFlow: item.name, name: fullName })
        props.updateFlow({ name: fullName })
      }
    }
  }

  const printTree = (item, level, parentId = '') => {
    const hasChildren = !!item.children.length
    const path = `${parentId}${parentId && '/'}${item.id}`
    const isTopic = level === 0
    const treeItem = (
      <div className={cx(item.type, { empty: isEmpty })} key={path}>
        <TreeItem
          className={cx(style.treeItem, {
            [style.isTopic]: isTopic,
            [style.active]: item.id === props.selectedWorkflow && (props.selectedTopic || 'default') === parentId
          })}
          isExpanded={expanded[path]}
          item={item}
          level={level}
          isEditing={editing === path}
          isEditingNew={isEditingNew}
          onSave={value => handleSave(item, isTopic, value)}
          contextMenuContent={handleContextMenu(item, isTopic, path)}
          onClick={() => handleClick({ ...item, isTopic, path })}
          qnaCount={props.qnaCountByTopic?.[item.id] || 0}
        />
        {expanded[path] && (
          <Fragment>
            {hasChildren && item.children.map(child => printTree(child, level + 1, path))}
            {props.canAdd && isTopic && item.id !== 'default' && (
              <Button
                minimal
                onClick={() => props.createWorkflow(item.id)}
                icon="plus"
                className={style.addBtn}
                text={lang.tr('studio.flow.sidePanel.addWorkflow')}
              />
            )}
          </Fragment>
        )}
      </div>
    )

    if (item.type === 'qna') {
      return (
        <AccessControl key={path} resource="module.qna" operation="write">
          {treeItem}
        </AccessControl>
      )
    } else {
      return treeItem
    }
  }

  const newFlowsAsArray = getFlattenFlows(newFlows)
  const isEmpty = !newFlowsAsArray.filter(item => item.type !== 'default').length
  return (
    <div className={cx(style.tree)}>
      {!!(!isEmpty || filter.length) && (
        <SearchBar placeholder={lang.tr('studio.flow.sidePanel.filterTopicsAndWorkflows')} onChange={setFilter} />
      )}
      {isEmpty &&
        (!!filter.length ? (
          <EmptyState
            className={style.emptyState}
            icon={<Icons.Search />}
            text={lang.tr('studio.flow.sidePanel.noSearchMatch')}
          />
        ) : (
          <EmptyState
            className={style.emptyState}
            icon={<EmptyStateIcon />}
            text={lang.tr('studio.flow.sidePanel.tapIconsToAdd')}
          />
        ))}
      {getFlattenFlows(newFlows).map(item => printTree(item, 0))}
    </div>
  )
}

const mapStateToProps = (state: RootReducer) => ({
  flowsName: getFlowNamesList(state),
  topics: state.ndu.topics,
  currentFlow: getCurrentFlow(state),
  qnaCountByTopic: state.ndu.qnaCountByTopic
})

const mapDispatchToProps = {
  deleteTopic,
  fetchTopics,
  fetchFlows,
  renameFlow,
  updateFlow,
  deleteFlow,
  duplicateFlow,
  getQnaCountByTopic
}

export default connect<StateProps, DispatchProps, OwnProps>(mapStateToProps, mapDispatchToProps)(TopicList)
