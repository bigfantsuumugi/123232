import { Button, Icon, Intent, Menu, MenuItem, Tooltip } from '@blueprintjs/core'
import { FormData } from 'botpress/sdk'
import { Contents, contextMenu, lang, ShortcutLabel } from 'botpress/shared'
import cx from 'classnames'
import _ from 'lodash'
import React, { FC, Fragment, useRef, useState } from 'react'
import { AbstractNodeFactory, DiagramEngine } from 'storm-react-diagrams'
import { BaseNodeModel } from '~/views/FlowBuilder/diagram/nodes/BaseNodeModel'
import { StandardPortWidget } from '~/views/FlowBuilder/diagram/nodes/Ports'

import style from './style.scss'

interface Props {
  node: SaySomethingNodeModel
  getCurrentFlow: any
  updateFlowNode: any
  onDeleteSelectedElements: () => void
  editContent: (node: SaySomethingNodeModel, index: number) => void
  selectedNodeContent: () => { node: SaySomethingNodeModel; index: number }
  getCurrentLang: () => string
  switchFlowNode: (id: string) => void
}

const SaySomethingWidget: FC<Props> = ({
  node,
  getCurrentFlow,
  editContent,
  onDeleteSelectedElements,
  selectedNodeContent,
  updateFlowNode,
  getCurrentLang,
  switchFlowNode
}) => {
  const [expanded, setExpanded] = useState(node.isNew)
  const [error, setError] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const isDefaultName = node.name.startsWith('node-')

  const getInitialInputValue = () => {
    return isDefaultName ? '' : node.name
  }

  const [inputValue, setInputValue] = useState(getInitialInputValue())

  const handleContextMenu = e => {
    e.stopPropagation()
    e.preventDefault()
    switchFlowNode(node.id)
    contextMenu(
      e,
      <Menu>
        <MenuItem
          text={lang.tr('studio.flow.node.renameBlock')}
          onClick={() => {
            setIsEditing(true)
          }}
        />
        <MenuItem
          text={
            <div className={style.contextMenuLabel}>
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

  const onKeyDown = event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
      event.target.select()
    }

    if (event.key === 'Escape' || event.key === 'Enter') {
      event.target.blur()
    }
  }

  const saveName = (): void => {
    setError(null)

    if (inputValue) {
      const alreadyExists = getCurrentFlow().nodes.find(x => x.name === inputValue && x.id !== node.id)

      if (alreadyExists) {
        setError(lang.tr('studio.flow.node.nameAlreadyExists'))
        return
      }

      updateFlowNode({ name: inputValue })
    } else {
      setInputValue(getInitialInputValue())
    }

    setIsEditing(false)
  }
  const currentLang = getCurrentLang()

  const selectedContent = selectedNodeContent()

  const getTranslatedContent = content => {
    const langArr = Object.keys(content)
    if (!langArr.length) {
      return {}
    }

    if (!langArr.includes(currentLang)) {
      return { contentType: content[langArr[0]].contentType }
    }

    return content[currentLang]
  }

  // Prevents moving the node while editing the name so text can be selected
  node.locked = isEditing

  return (
    <div
      className={style.nodeWrapper}
      onContextMenu={e => {
        e.stopPropagation()
        e.preventDefault()
      }}
    >
      <div className={style.headerWrapper}>
        {!isEditing ? (
          <Button
            icon={expanded ? 'chevron-down' : 'chevron-right'}
            onClick={() => setExpanded(!expanded)}
            className={style.button}
            onContextMenu={handleContextMenu}
          >
            {isDefaultName ? lang.tr('studio.flow.node.chatbotSays') : node.name}
          </Button>
        ) : (
          <div className={style.button}>
            <Icon icon={expanded ? 'chevron-down' : 'chevron-right'} />
            <input
              type="text"
              placeholder={lang.tr('studio.flow.node.renameBlock')}
              autoFocus
              onFocus={e => e.currentTarget.select()}
              onKeyDown={onKeyDown}
              onChange={e => setInputValue(e.currentTarget.value)}
              onBlur={saveName}
              value={inputValue}
              className={cx({ [style.error]: error })}
            />
            {error && (
              <span className={style.errorIcon}>
                <Tooltip content={error}>
                  <Icon icon="warning-sign" iconSize={10} intent={Intent.DANGER} />
                </Tooltip>
              </span>
            )}
          </div>
        )}
        <StandardPortWidget name="in" node={node} className={style.in} />
        <StandardPortWidget name="out0" node={node} className={style.out} />
      </div>
      {expanded && (
        <div className={style.contentsWrapper}>
          {node.contents?.map((content, index) => (
            <Contents.Item
              active={selectedContent?.node?.id === node.id && index === selectedContent?.index}
              key={`${index}${currentLang}`}
              onEdit={() => editContent?.(node, index)}
              content={getTranslatedContent(content)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export class SaySomethingNodeModel extends BaseNodeModel {
  public contents: { [lang: string]: FormData }[] = []
  public isNew: boolean

  constructor({
    id,
    x,
    y,
    name,
    onEnter = [],
    next = [],
    contents,
    isNew,
    isStartNode = false,
    isHighlighted = false
  }) {
    super('say_something', id)
    this.setData({ name, onEnter, next, isNew, contents, isStartNode, isHighlighted })

    this.x = this.oldX = x
    this.y = this.oldY = y
  }

  setData({ contents, isNew, ...data }: any) {
    this.contents = contents
    this.isNew = isNew

    super.setData(data as any)
  }
}

export class SaySomethingWidgetFactory extends AbstractNodeFactory {
  private editContent: (node: SaySomethingNodeModel, index: number) => void
  private selectedNodeContent: () => { node: SaySomethingNodeModel; index: number }
  private deleteSelectedElements: () => void
  private getCurrentLang: () => string
  private getCurrentFlow: any
  private updateFlowNode: any
  private switchFlowNode: (id: string) => void

  constructor(methods) {
    super('say_something')

    this.editContent = methods.editContent
    this.selectedNodeContent = methods.selectedNodeContent
    this.deleteSelectedElements = methods.deleteSelectedElements
    this.getCurrentFlow = methods.getCurrentFlow
    this.updateFlowNode = methods.updateFlowNode
    this.getCurrentLang = methods.getCurrentLang
    this.switchFlowNode = methods.switchFlowNode
  }

  generateReactWidget(diagramEngine: DiagramEngine, node: SaySomethingNodeModel) {
    return (
      <SaySomethingWidget
        node={node}
        getCurrentFlow={this.getCurrentFlow}
        editContent={this.editContent}
        onDeleteSelectedElements={this.deleteSelectedElements}
        updateFlowNode={this.updateFlowNode}
        selectedNodeContent={this.selectedNodeContent}
        getCurrentLang={this.getCurrentLang}
        switchFlowNode={this.switchFlowNode}
      />
    )
  }

  getNewInstance() {
    // @ts-ignore
    return new SaySomethingNodeModel()
  }
}
