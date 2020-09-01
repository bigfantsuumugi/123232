import { Button, Tab, Tabs, Tooltip } from '@blueprintjs/core'
import { BotEvent, ExecuteNode, FlowNode, FlowVariable } from 'botpress/sdk'
import { Icons, lang, MoreOptions, MoreOptionsItems, MultiLevelDropdown, RightSidebar } from 'botpress/shared'
import cx from 'classnames'
import { LocalActionDefinition, Variables } from 'common/typings'
import React, { FC, Fragment, useCallback, useEffect, useRef, useState } from 'react'

import contentStyle from '../ContentForm/style.scss'

import style from './style.scss'
import CodeEditor from './CodeEditor'
import ConfigAction from './ConfigAction'

interface Props {
  node: FlowNode
  customKey: string
  contentLang: string
  variables: Variables
  actions: LocalActionDefinition[]
  portalNode: any
  events: BotEvent[]
  formData: ExecuteNode
  onUpdate: (data: Partial<ExecuteNode>) => void
  onUpdateVariables: (variable: FlowVariable) => void
  deleteNode: () => void
  close: () => void
}

const newAction = { label: 'Code New Action', value: '__newAction' }

const ExecuteForm: FC<Props> = ({
  node,
  customKey,
  actions,
  variables,
  events,
  formData,
  contentLang,
  portalNode,
  close,
  deleteNode,
  onUpdate,
  onUpdateVariables
}) => {
  const [canOutsideClickClose, setCanOutsideClickClose] = useState(true)
  const [showOptions, setShowOptions] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const selectedAction = useRef(formData?.actionName)

  const moreOptionsItems: MoreOptionsItems[] = [
    {
      label: lang.tr('deleteNode'),
      action: deleteNode,
      type: 'delete'
    }
  ]

  useEffect(() => {
    document.documentElement.style.setProperty('--right-sidebar-width', maximized ? '580px' : '240px')
  }, [maximized])

  const toggleSize = () => {
    setMaximized(!maximized)
  }

  const onActionChanged = (actionName: string) => {
    selectedAction.current = actionName
    onUpdate({ actionName })
  }

  const allActions = [newAction, ...actions.map(x => ({ label: `${x.category} - ${x.title}`, value: x.name }))]
  const selectedOption = allActions.find(a => a.value === selectedAction.current)
  const multiLevelActions = actions.reduce((acc, action) => {
    const category = acc.find(c => c.name === action.category) || { name: action.category, items: [] }

    category.items.push({ label: action.title, value: action.name })

    return [...acc.filter(a => a.name !== action.category), category]
  }, [])

  const commonProps = {
    customKey,
    contentLang,
    formData,
    events,
    variables,
    onUpdate,
    onUpdateVariables
  }

  return (
    <RightSidebar className={style.wrapper} canOutsideClickClose={canOutsideClickClose} close={close}>
      <Fragment key={`${node?.id}`}>
        <div className={style.formHeader}>
          <Tabs id="contentFormTabs">
            <Tab id="content" title={lang.tr('studio.flow.nodeType.execute')} />
          </Tabs>
          <div>
            <MoreOptions show={showOptions} onToggle={setShowOptions} items={moreOptionsItems} />
            <Tooltip content={lang.tr(maximized ? 'minimizeInspector' : 'maximizeInspector')}>
              <Button
                className={style.expandBtn}
                small
                minimal
                icon={maximized ? <Icons.Minimize /> : 'fullscreen'}
                onClick={toggleSize}
              />
            </Tooltip>
          </div>
        </div>
        <div className={cx(contentStyle.fieldWrapper, contentStyle.contentTypeField)}>
          <span className={contentStyle.formLabel}>{lang.tr('Action')}</span>

          <MultiLevelDropdown
            filterable
            className={contentStyle.formSelect}
            items={multiLevelActions}
            rightIcon="chevron-down"
            defaultItem={selectedOption}
            confirmChange={
              selectedOption && {
                message: lang.tr('studio.content.confirmChangeContentType'),
                acceptLabel: lang.tr('change'),
                callback: setCanOutsideClickClose
              }
            }
            onChange={option => onActionChanged(option.value)}
          />
        </div>

        {selectedOption !== undefined && (
          <Fragment>
            {selectedAction.current === newAction.value ? (
              <CodeEditor {...commonProps} maximized={maximized} setMaximized={setMaximized} portalNode={portalNode} />
            ) : (
              <ConfigAction {...commonProps} actions={actions} actionName={selectedAction.current} />
            )}
          </Fragment>
        )}
      </Fragment>
    </RightSidebar>
  )
}

export default ExecuteForm
