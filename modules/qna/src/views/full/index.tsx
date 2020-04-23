import { EmptyState, HeaderButtonProps, lang, MainContent } from 'botpress/shared'
import cx from 'classnames'
import React, { FC, useEffect, useReducer, useState } from 'react'

import style from './style.scss'
import QnA from './Components/QnA'
import EmptyStateIcon from './Icons/EmptyStateIcon'

const ITEMS_PER_PAGE = 20

interface State {
  count: number
  items: any[]
  loading: boolean
  page: number
}

const fetchReducer = (state: State, action): State => {
  if (action.type === 'dataSuccess') {
    const { items, count, page } = action.data

    return {
      ...state,
      count,
      items,
      loading: false,
      page
    }
  } else if (action.type === 'updateQnA') {
    const { data, index } = action.data
    const newItems = state.items

    newItems[index] = { ...newItems[index], data }

    return {
      ...state,
      items: newItems
    }
  } else if (action.type === 'deleteQnA') {
    const { index } = action.data
    const newItems = state.items

    console.log(index)

    newItems.splice(index, 1)

    return {
      ...state,
      items: newItems
    }
  } else if (action.type === 'disableQnA') {
    const { index } = action.data
    const newItems = state.items

    newItems[index].enabled = false

    return {
      ...state,
      items: newItems
    }
  } else if (action.type === 'toogleEnabledQnA') {
    const { index } = action.data
    const newItems = state.items

    newItems[index].data.enabled = !newItems[index].data.enabled

    return {
      ...state,
      items: newItems
    }
  } else {
    throw new Error(`That action type isn't supported.`)
  }
}

interface Props {
  bp: any
  contentLang: string
  defaultLanguage: string
  languages: string[]
}

const QnAList: FC<Props> = props => {
  const [currentTab, setCurrentTab] = useState('qna')
  const [currentLang, setCurrentLang] = useState(props.contentLang)
  const [state, dispatch] = useReducer(fetchReducer, {
    count: 0,
    items: [],
    loading: true,
    page: 1
  })
  const { items, loading } = state

  useEffect(() => {
    fetchData()
      .then(() => {})
      .catch(() => {})
  }, [])

  const addQnA = () => {
    console.log('add')
  }

  const tabs = [
    {
      id: 'qna',
      title: lang.tr('module.qna.fullName')
    }
  ]

  const buttons: HeaderButtonProps[] = [
    {
      icon: 'translate',
      optionsItems: props.languages?.map(language => ({
        label: lang.tr(`isoLangs.${language}.name`),
        action: () => {
          setCurrentLang(language)
        }
      })),
      disabled: !items.length
    },
    {
      icon: 'filter',
      disabled: !items.length,
      onClick: () => {}
    },
    {
      icon: 'sort',
      disabled: !items.length,
      onClick: () => {}
    },
    {
      icon: 'collapse-all',
      disabled: !items.length,
      onClick: () => {}
    },
    {
      icon: 'plus',
      onClick: addQnA
    }
  ]

  const fetchData = async (page = 1) => {
    const params = { limit: ITEMS_PER_PAGE, offset: (page - 1) * ITEMS_PER_PAGE }
    const { data } = await props.bp.axios.get('/mod/qna/questions', { params })

    dispatch({ type: 'dataSuccess', data: { ...data, page } })
  }

  return (
    <MainContent.Wrapper>
      <MainContent.Header tabChange={setCurrentTab} tabs={tabs} buttons={buttons} />
      <div className={cx(style.content, { [style.empty]: !items.length })}>
        {!!items.length &&
          items.map((item, index) => (
            <QnA
              updateQnA={data => dispatch({ type: 'updateQnA', data: { data, index } })}
              key={item.id}
              deleteQnA={() => dispatch({ type: 'deleteQnA', data: { index } })}
              toogleEnabledQnA={() => dispatch({ type: 'toogleEnabledQnA', data: { index } })}
              contentLang={currentLang}
              question={item}
            />
          ))}
        {!items.length && !loading && (
          <EmptyState icon={<EmptyStateIcon />} text={lang.tr('module.qna.form.emptyState')} />
        )}
      </div>
    </MainContent.Wrapper>
  )
}

export default QnAList
