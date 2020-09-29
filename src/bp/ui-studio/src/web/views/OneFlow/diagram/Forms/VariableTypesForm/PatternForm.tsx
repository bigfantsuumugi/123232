import axios from 'axios'
import sdk from 'botpress/sdk'
import { Contents, lang, MainContent, MoreOptions, MoreOptionsItems, sharedStyle, Tabs } from 'botpress/shared'
import cx from 'classnames'
import _ from 'lodash'
import React, { FC, Fragment, useEffect, useRef, useState } from 'react'

interface Props {
  customKey: string
  defaultLang: string
  contentLang: string
  formData: sdk.NLU.EntityDefinition
  close: () => void
  deleteEntity: (entityId: string) => void
  updateEntity: (originalId: string, entity: sdk.NLU.EntityDefinition) => void
  updateFormItem: (entity) => void
}

const preparePattern = (pattern: string, matchCase?: boolean) => {
  try {
    let p = pattern || ''
    if (!p.startsWith('^')) {
      p = `^${p}`
    }
    if (!p.endsWith('$')) {
      p = `${p}$`
    }
    return new RegExp(p, matchCase ? '' : 'i')
  } catch (err) {
    console.error('Pattern invalid', err)
  }
}

const PatternForm: FC<Props> = ({
  customKey,
  defaultLang,
  contentLang,
  formData,
  close,
  updateEntity,
  deleteEntity,
  updateFormItem
}) => {
  const originalEntity = useRef(formData)
  const [showOptions, setShowOptions] = useState(false)
  const [forceUpdate, setForceUpdate] = useState(false)
  const [patternValid, setPatternValid] = useState(false)

  const { pattern, matchCase, examples } = formData

  useEffect(() => {
    setForceUpdate(!forceUpdate)
    originalEntity.current = formData
  }, [customKey])

  useEffect(() => {
    if (_.isEqual(formData, originalEntity.current) || !formData.pattern || !patternValid) {
      return
    }

    const newEntity = { ...formData }

    updateEntity(originalEntity.current.name, newEntity)
    originalEntity.current = newEntity
  }, [formData])

  useEffect(() => {
    try {
      new RegExp(pattern)
      setPatternValid(true)
    } catch (e) {
      setPatternValid(false)
    }
  }, [pattern])

  const moreOptionsItems: MoreOptionsItems[] = [
    {
      label: lang.tr('studio.library.deleteVariableFromLibrary'),
      action: () => deleteEntity(formData.name),
      type: 'delete'
    }
  ]

  const invalidFields = !patternValid ? [{ field: 'pattern', message: lang.tr('studio.library.patternInvalid') }] : []

  return (
    <MainContent.RightSidebar className={sharedStyle.wrapper} canOutsideClickClose={true} close={() => close()}>
      <Fragment key={customKey}>
        <div className={cx(sharedStyle.formHeader, sharedStyle.noSelect)}>
          <Tabs tabs={[{ id: 'content', title: lang.tr('pattern') }]} />
          <MoreOptions show={showOptions} onToggle={setShowOptions} items={moreOptionsItems} />
        </div>

        <Contents.Form
          currentLang={contentLang}
          defaultLang={defaultLang}
          axios={axios}
          fields={[
            {
              key: 'pattern',
              type: 'text',
              required: true,
              placeholder: 'studio.library.regexPatternPlaceholder',
              label: 'module.builtin.regexPattern',
              moreInfo: {
                label: 'learnMore',
                url: 'https://regex101.com/'
              }
              // TODO add combo box to select from predefined patterns or custom
            },
            {
              key: 'examples',
              type: 'text_array',
              label: 'examples',
              placeholder: 'studio.library.examplePlaceholder',
              validation: { regex: preparePattern(pattern, matchCase) },
              group: {
                minimum: 1,
                addLabel: 'studio.library.addExample',
                addLabelTooltip: 'studio.library.addExampleTooltip'
              }
            }
          ]}
          advancedSettings={[
            {
              key: 'matchCase',
              type: 'checkbox',
              label: 'Match case'
            },
            {
              key: 'sensitive',
              type: 'checkbox',
              label: 'Value contains sensitive data'
            }
          ]}
          formData={formData || {}}
          invalidFields={invalidFields}
          onUpdate={data => updateFormItem(data)}
        />
      </Fragment>
    </MainContent.RightSidebar>
  )
}

export default PatternForm
