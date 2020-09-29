import { Tab, Tabs } from '@blueprintjs/core'
import axios from 'axios'
import { BotEvent, FlowNode, FlowVariable, FormData, NodeTransition } from 'botpress/sdk'
import { Contents, Dropdown, lang, MainContent, MoreOptions, MoreOptionsItems, sharedStyle } from 'botpress/shared'
import cx from 'classnames'
import { Variables } from 'common/typings'
import _ from 'lodash'
import React, { FC, Fragment, useEffect, useRef, useState } from 'react'
import { defaultTransition } from '~/views/FlowBuilder/diagram/manager'

import TextField from './TextField'

interface Props {
  deleteContent: () => void
  editingContent: number
  customKey: string
  variables: Variables
  events: BotEvent[]
  close: (closingKey: number) => void
  onUpdate: (data: any) => void
  onUpdateVariables: (variable: FlowVariable) => void
  formData: FormData
  contentTypes: any
  defaultLang: string
  contentLang: string
  node: FlowNode
}

const ContentForm: FC<Props> = ({
  contentTypes,
  customKey,
  editingContent,
  defaultLang,
  close,
  formData,
  onUpdate,
  onUpdateVariables,
  deleteContent,
  variables,
  events,
  node,
  contentLang
}) => {
  const [canOutsideClickClose, setCanOutsideClickClose] = useState(true)
  const contentType = useRef(formData?.contentType || 'builtin_text')
  const [showOptions, setShowOptions] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)
  const contentTypesFields = contentTypes.reduce((acc, type) => ({ ...acc, [type.id]: type.schema.newJson }), {})

  useEffect(() => {
    contentType.current = formData?.contentType || 'builtin_text'
    setForceUpdate(!forceUpdate)
  }, [editingContent, customKey])

  const moreOptionsItems: MoreOptionsItems[] = [
    {
      label: lang.tr('deleteContent'),
      action: deleteContent,
      type: 'delete'
    }
  ]

  const handleContentTypeChange = value => {
    const { fields, advancedSettings } = contentTypesFields?.[value] || {}
    const schemaFields = [...(fields || []), ...(advancedSettings || [])]
    contentType.current = value
    onUpdate({
      content: {
        ...Contents.createEmptyDataFromSchema(schemaFields, contentLang),
        contentType: value,
        id: formData?.id
      }
    })
  }

  const contentFields = contentTypesFields?.[contentType.current]
  const { fields, advancedSettings } = contentFields || {}
  const schemaFields = [...(fields || []), ...(advancedSettings || [])]

  // TODO reimplement hasChanged, doesn't work properly atm
  const hasChanged = !(
    _.isEqual(formData, { contentType: contentType.current }) ||
    _.isEqual(formData, {
      ...Contents.createEmptyDataFromSchema(schemaFields, contentLang),
      contentType: contentType.current
    }) ||
    _.isEqual(formData, {
      ...Contents.createEmptyDataFromSchema(schemaFields, contentLang),
      contentType: contentType.current,
      id: formData?.id
    })
  )

  const prepareUpdate = data => {
    if (!data.suggestions) {
      onUpdate({ content: { ...data, contentType: contentType.current } })
      return
    }

    const langs = Object.keys(data.suggestions)
    const transitions: NodeTransition[] = [
      ...(node?.next.filter(
        transition => transition.contentIndex !== editingContent && transition.condition !== 'true'
      ) || [])
    ]

    const triggers = data.suggestions[defaultLang].map(({ name, tags }, idx) => {
      const utterances = langs.reduce((acc, curr) => {
        return { ...acc, [curr]: [name, ...(data.suggestions[curr]?.find(x => x.name === name)?.tags || [])] }
      }, {})

      const currentDest = node?.next.find(x => x.condition === `choice-${name}${idx}`)?.node ?? ''

      transitions.push({
        condition: `choice-${name}${idx}`,
        caption: [...([name] || []), ...(tags || [])].filter(Boolean).join(' · '),
        contentIndex: editingContent,
        node: currentDest
      })

      return {
        name: `choice-${name}${idx}`,
        effect: 'jump.node',
        conditions: [
          {
            params: { utterances },
            id: 'user_intent_is'
          }
        ],
        type: 'contextual',
        gotoNodeId: currentDest,
        suggestion: { label: name, value: name, position: data.position },
        expiryPolicy: {
          strategy: data.expiryPolicy,
          turnCount: data.turnCount ?? 3
        }
      }
    })

    onUpdate({ content: { ...data, contentType: contentType.current }, triggers, transitions })
  }

  return (
    <MainContent.RightSidebar
      className={sharedStyle.wrapper}
      canOutsideClickClose={canOutsideClickClose}
      close={() => close(editingContent)}
    >
      <Fragment key={`${contentType.current}-${contentLang}-${customKey || editingContent}`}>
        <div className={sharedStyle.formHeader}>
          <Tabs id="contentFormTabs">
            <Tab id="content" title={lang.tr('studio.flow.nodeType.say')} />
          </Tabs>
          <MoreOptions show={showOptions} onToggle={setShowOptions} items={moreOptionsItems} />
        </div>
        <div className={cx(sharedStyle.fieldWrapper, sharedStyle.typeField)}>
          <span className={sharedStyle.formLabel}>{lang.tr('studio.content.contentType')}</span>
          {!!contentTypes.length && (
            <Dropdown
              filterable={false}
              className={sharedStyle.formSelect}
              items={_.sortBy(contentTypes, 'schema.newJson.order').map(type => ({
                value: type.id,
                label: lang.tr(type.title)
              }))}
              defaultItem={contentType.current}
              rightIcon="chevron-down"
              confirmChange={
                hasChanged && {
                  message: lang.tr('studio.content.confirmChangeContentType'),
                  acceptLabel: lang.tr('change'),
                  callback: setCanOutsideClickClose
                }
              }
              onChange={option => {
                handleContentTypeChange(option.value)
              }}
            />
          )}
        </div>
        {!!contentFields && (
          <Contents.Form
            axios={axios}
            currentLang={contentLang}
            defaultLang={defaultLang}
            mediaPath={`${window.BOT_API_PATH}/media`}
            overrideFields={{
              textOverride: props => (
                <TextField
                  {...props}
                  currentLang={contentLang}
                  defaultLang={defaultLang}
                  variables={variables}
                  events={events}
                  onUpdateVariables={onUpdateVariables}
                />
              )
            }}
            variables={variables}
            events={events}
            fields={contentFields.fields}
            advancedSettings={contentFields.advancedSettings}
            formData={formData}
            onUpdate={data => prepareUpdate({ ...data, contentType: contentType.current })}
            onUpdateVariables={onUpdateVariables}
          />
        )}
      </Fragment>
    </MainContent.RightSidebar>
  )
}

export default ContentForm
