import { Tab, Tabs } from '@blueprintjs/core'
import { FormData } from 'botpress/common/typings'
import { ContentForms, Dropdown, lang, MoreOptions, MoreOptionsItems, RightSidebar } from 'botpress/shared'
import cx from 'classnames'
import React, { FC, useEffect, useRef, useState } from 'react'

import style from './style.scss'

interface Props {
  bp: any
  deleteContent: () => void
  close: () => void
  onUpdate: (data: FormData) => void
  formData: FormData
}

const ContentAnswerForm: FC<Props> = ({ bp, close, formData, onUpdate, deleteContent }) => {
  const contentType = useRef(formData?.contentType || 'image')
  const [showOptions, setShowOptions] = useState(false)
  const moreOptionsItems: MoreOptionsItems[] = [
    {
      icon: 'trash',
      label: lang.tr('module.qna.contentForm.deleteContent'),
      action: deleteContent,
      type: 'delete'
    }
  ]

  const handleContentTypeChange = value => {
    contentType.current = value
    onUpdate({ ...ContentForms.getEmptyFormData(value), contentType: value, id: formData?.id })
  }

  const contentTypes = [
    { value: 'image', label: 'Image' },
    { value: 'card', label: 'Card' },
    { value: 'carousel', label: 'Carousel' },
    { value: 'suggestions', label: 'Suggestions' }
  ]

  useEffect(() => {
    console.log('test2')
  }, [])

  const contentFields = ContentForms.contentTypesFields[contentType.current]

  return (
    <RightSidebar className={style.wrapper} canOutsideClickClose close={close}>
      <div className={style.formHeader}>
        <Tabs id="contentFormTabs">
          <Tab id="content" title="Content" />
        </Tabs>
        <MoreOptions show={showOptions} onToggle={setShowOptions} items={moreOptionsItems} />
      </div>
      <div className={cx(style.fieldWrapper, style.contentTypeField)}>
        <span className={style.formLabel}>{lang.tr('studio.content.contentType')}</span>
        {contentTypes && (
          <Dropdown
            filterable={false}
            className={style.formSelect}
            items={contentTypes}
            defaultItem={contentType.current}
            rightIcon="chevron-down"
            onChange={option => {
              handleContentTypeChange(option.value)
            }}
          />
        )}
      </div>
      <ContentForms.Form
        key={contentType.current}
        fields={contentFields.fields}
        advancedSettings={contentFields.advancedSettings}
        bp={bp}
        formData={formData}
        contentType={contentType.current}
        onUpdate={data => onUpdate({ ...data, contentType: contentType.current })}
      />
    </RightSidebar>
  )
}

export default ContentAnswerForm
