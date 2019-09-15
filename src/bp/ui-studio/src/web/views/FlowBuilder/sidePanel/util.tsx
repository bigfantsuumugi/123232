import { Position, Tooltip } from '@blueprintjs/core'
import _ from 'lodash'
import find from 'lodash/find'
import React from 'react'

import { ERROR_FLOW_ICON, FLOW_ICON, FOLDER_ICON, MAIN_FLOW_ICON } from './FlowsList'

/**
 *  Returns a different display for special flows.
 * @param flowId The full path of the flow (including folders)
 * @param flowName The display name of the flow (only filename)
 */
const getFlowInfo = (flowId: string, flowName: string) => {
  if (flowId === 'main') {
    return {
      icon: MAIN_FLOW_ICON,
      label: (
        <Tooltip content={<span>Every user session starts here</span>} hoverOpenDelay={500} position={Position.BOTTOM}>
          <strong>Main</strong>
        </Tooltip>
      )
    }
  } else if (flowId === 'error') {
    return {
      icon: ERROR_FLOW_ICON,
      label: (
        <Tooltip
          content={
            <span>
              When an error is encountered in the flow,
              <br /> the user is redirected here
            </span>
          }
          hoverOpenDelay={500}
          position={Position.BOTTOM}
        >
          <strong>Error handling</strong>
        </Tooltip>
      )
    }
  }
  return {
    icon: FLOW_ICON,
    label: flowName
  }
}

const reorderFlows = flows => {
  return [
    flows.find(x => x.id === 'main'),
    flows.find(x => x.id === 'error'),
    ...flows.filter(x => x.id !== 'main' && x.id !== 'error')
  ].filter(x => Boolean(x))
}

const addNode = (tree, folders, flowDesc, data) => {
  for (const folderDesc of folders) {
    let folder = find(tree.childNodes, folderDesc)
    if (!folder) {
      folder = { ...folderDesc, parent: tree, childNodes: [] }
      tree.childNodes.push(folder)
    }
    tree = folder
  }
  tree.childNodes.push({ ...flowDesc, parent: tree, ...data })
}

const compareNodes = (a, b) => {
  if (a.type === b.type) {
    return a.name < b.name ? -1 : 1
  }
  if (a.type === 'folder') {
    return -1
  } else {
    return 1
  }
}

const sortChildren = tree => {
  if (!tree.childNodes) {
    return
  }
  tree.childNodes.sort(compareNodes)
  tree.childNodes.forEach(sortChildren)
}

export const getUniqueId = node => `${node.type}:${node.fullPath}`

export const splitFlowPath = flow => {
  const flowPath = flow.replace(/\.flow\.json$/, '').split('/')
  const flowName = flowPath[flowPath.length - 1]
  const flowFolders = flowPath.slice(0, flowPath.length - 1)
  const folders = []
  const currentPath = []

  for (const folder of flowFolders) {
    currentPath.push(folder)
    folders.push({ id: folder, type: 'folder', icon: FOLDER_ICON, label: folder, fullPath: currentPath.join('/') })
  }

  currentPath.push(flowName)
  const id = currentPath.join('/')
  const { icon, label } = getFlowInfo(id, flowName)
  return {
    folders,
    flow: {
      id,
      icon,
      label,
      fullPath: id,
      type: 'flow'
    }
  }
}

export const buildFlowsTree = flows => {
  const tree = { icon: 'root', fullPath: '', label: '<root>', childNodes: [] }
  flows.forEach(flowData => {
    const { folders, flow } = splitFlowPath(flowData.name)
    addNode(tree, folders, flow, { nodeData: flowData })
  })

  sortChildren(tree)

  return reorderFlows(tree.childNodes)
}
