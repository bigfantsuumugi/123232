import { Icon, Tab, Tabs, Tag } from '@blueprintjs/core'
import { AxiosInstance } from 'axios'
import { Container, SidePanel, SplashScreen } from 'botpress/ui'
import _ from 'lodash'
import React, { FC, useEffect, useState } from 'react'

import { makeApi } from '../api'

import EntityEditor from './entities/EntityEditor'
import { EntitySidePanelSection } from './entities/SidePanelSection'
import IntentEditor from './intents/editor'
import { IntentSidePanelSection } from './intents/SidePanelSection'
import style from './style.scss'

export interface NluItem {
  name: string
  type: 'intent' | 'entity'
}

interface Props {
  bp: { axios: AxiosInstance }
  contentLang: string
}

const ITEM_TYPE_PARAM = 'type'
const ITEM_NAME_PARAM = 'id'

const NLU: FC<Props> = props => {
  const api = makeApi(props.bp)
  const [currentItem, setCurrentItem] = useState<NluItem | undefined>()
  const [intents, setIntents] = useState([])
  const [entities, setEntities] = useState([])
  const [contexts, setContexts] = useState([])

  const loadIntents = () => api.fetchIntents().then(setIntents)
  const loadEntities = () => api.fetchEntities().then(setEntities)

  useEffect(() => {
    api.fetchContexts().then(setContexts)
    loadIntents()
    loadEntities()
    setCurrentItemFromPath()
  }, [window.location.href])

  const handleSelectItem = (item: NluItem | undefined) => {
    setCurrentItem(item)

    if (!item) {
      return
    }

    const url = new URL(window.location.href)
    url.searchParams.set(ITEM_TYPE_PARAM, item.type)
    url.searchParams.set(ITEM_NAME_PARAM, item.name)
    window.history.pushState(window.history.state, '', url.toString())
  }

  const getCurrentItemFromPath = () => {
    const url = new URL(window.location.href)
    const type = url.searchParams.get(ITEM_TYPE_PARAM)
    const name = url.searchParams.get(ITEM_NAME_PARAM)
    if (type && name) {
      return { type, name } as NluItem
    }
  }

  const setCurrentItemFromPath = () => {
    const newCurrentItem = getCurrentItemFromPath()

    if (!isEqual(newCurrentItem, currentItem)) {
      setCurrentItem(newCurrentItem)
    }
  }

  const isEqual = (item: NluItem, otherItem: NluItem) => {
    const isSame = item === otherItem
    const areDefined = item && otherItem
    return isSame || (areDefined && item.name === otherItem.name && item.type === otherItem.type)
  }

  const updateEntity = entity => {
    api.updateEntity(entity)
    const i = entities.findIndex(ent => ent.id == entity.id)
    setEntities([...entities.slice(0, i), entity, ...entities.slice(i + 1)])
  }

  const intentsPanel = (
    <IntentSidePanelSection
      api={api}
      contentLang={props.contentLang}
      intents={intents}
      currentItem={currentItem}
      setCurrentItem={handleSelectItem}
      reloadIntents={loadIntents}
    />
  )

  const entitiesPanel = (
    <EntitySidePanelSection
      api={api}
      entities={entities}
      currentItem={currentItem}
      setCurrentItem={handleSelectItem}
      reloadEntities={loadEntities}
    />
  )

  return (
    <Container>
      <SidePanel>
        <Tabs id="nlu-tabs" className={style.headerTabs} defaultSelectedTabId="intents" large={false}>
          <Tab id="intents" panel={intentsPanel}>
            <span>Intents</span>{' '}
            <Tag large={false} round={true} minimal={true}>
              {intents.length}
            </Tag>
          </Tab>
          <Tab id="entities" panel={entitiesPanel}>
            <span>Entities</span>{' '}
            <Tag large={false} round={true} minimal={true}>
              {entities.length}
            </Tag>
          </Tab>
        </Tabs>
      </SidePanel>
      <div className={style.container}>
        {!currentItem && (
          <SplashScreen
            icon={<Icon iconSize={80} icon="translate" style={{ marginBottom: '3em' }} />}
            title="Understanding"
            description="Use Botpress native Natural language understanding engine to make your bot smarter."
          />
        )}
        {intents.length && currentItem && currentItem.type === 'intent' && (
          <IntentEditor
            intent={intents.find(i => i.name == currentItem.name)}
            contexts={contexts} // TODO fetch this within the component
            axios={props.bp.axios} // TODO replace this with api instance
            reloadIntents={loadIntents}
            contentLang={props.contentLang}
          />
        )}
        {entities.length && currentItem && currentItem.type === 'entity' && (
          <EntityEditor entity={entities.find(ent => ent.name === currentItem.name)} onUpdate={updateEntity} />
        )}
      </div>
    </Container>
  )
}

export default NLU
