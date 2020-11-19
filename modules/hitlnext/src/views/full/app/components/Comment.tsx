import { ContentSection, lang } from 'botpress/shared'
import { agentName } from '../../shared/helper'
import moment from 'moment'
import React, { FC, useContext } from 'react'

import { IComment } from '../../../../types'
import style from '../../style.scss'
import { Context } from '../Store'

const Comment: FC<IComment> = props => {
  const { state } = useContext(Context)

  function formatDate(str) {
    return moment(str).format('DD/MM/YYYY')
  }

  function displayAgentName() {
    const agent = state.agents[props.agentId]

    if (state.currentAgent?.agentId === props.agentId) {
      return lang.tr('module.hitlnext.handoff.you')
    } else {
      return agentName(agent)
    }
  }

  return (
    <ContentSection title={`#${props.handoffId}`}>
      <ul>
        <li>{props.content}</li>
      </ul>
      <p className={style.createdDate}>
        {formatDate(props.createdAt)} <span>⋅</span> {displayAgentName()}
      </p>
    </ContentSection>
  )
}

export default Comment
