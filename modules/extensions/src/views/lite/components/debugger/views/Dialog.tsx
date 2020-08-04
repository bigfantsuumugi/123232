import { Button } from '@blueprintjs/core'
import * as sdk from 'botpress/sdk'
import _ from 'lodash'
import React, { Fragment, SFC, useEffect, useState } from 'react'

import { Collapsible } from '../components/Collapsible'
import { Intent, isQnaItem } from '../components/Intent'
import style from '../style.scss'

import { Inspector } from './Inspector'

interface Props {
  suggestions: sdk.IO.Suggestion[]
  decision: sdk.IO.Suggestion
  stacktrace: sdk.IO.JumpPoint[]
  isExpanded: (key: string) => boolean
  toggleExpand: (section: string, expanded: boolean) => void
}

const Decision: SFC<{ decision: sdk.IO.Suggestion }> = props => {
  const decision = props.decision.sourceDetails
  const isQnA = isQnaItem(decision)

  return (
    <div className={style.section}>
      <div className={style.sectionTitle}>Decision</div>
      <div className={style.subSection}>
        {isQnA ? <Intent name={decision} /> : <p>{decision}</p>}
        <ul>
          <li>{props.decision.decision.reason}</li>
        </ul>
      </div>
    </div>
  )
}

const Suggestions: SFC<{ suggestions: sdk.IO.Suggestion[] }> = props => (
  <div className={style.section}>
    <div className={style.sectionTitle}>Suggestions</div>
    <div className={style.subSection}>
      <ul>
        {_.take(props.suggestions, 4).map(sugg => (
          <li key={sugg.sourceDetails}>
            <Intent name={sugg.sourceDetails} confidence={sugg.confidence} />
          </li>
        ))}
      </ul>
    </div>
  </div>
)

const highlightNode = (flow: string, node: string) => {
  // @ts-ignore
  window.parent && window.parent.highlightNode && window.parent.highlightNode(flow, node)
}

const Flow: SFC<{ stacktrace: sdk.IO.JumpPoint[] }> = props => (
  <div className={style.section}>
    <div className={style.sectionTitle}>Flow Nodes</div>
    <div className={style.subSection}>
      <ul>
        {props.stacktrace.map(({ flow, node }, idx) => {
          const flowName = flow && flow.replace(/\.flow\.json$/i, '')
          return (
            <li key={`${flow}:${node}:${idx}`}>
              <span>
                <a onClick={() => highlightNode(flow, node)}>
                  {flowName} / {node}
                </a>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  </div>
)

const DIALOG_JSON = 'json::dialog'
const DIALOG_PANEL = 'panel::dialog'

const Dialog: SFC<Props> = ({ decision, suggestions, stacktrace, isExpanded, toggleExpand }) => {
  const [viewJSON, setViewJSON] = useState(isExpanded(DIALOG_JSON))

  useEffect(() => {
    setViewJSON(isExpanded(DIALOG_JSON))
  }, [isExpanded(DIALOG_JSON)])

  if (!decision && !suggestions?.length && !stacktrace?.length) {
    return null
  }

  const toggleView = () => {
    const newValue = !viewJSON
    toggleExpand(DIALOG_JSON, newValue)
    setViewJSON(newValue)
  }

  const renderContent = () => {
    if (viewJSON) {
      return <Inspector data={{ decision, suggestions, stacktrace }} />
    }

    return (
      <Fragment>
        {decision && <Decision decision={decision} />}
        {stacktrace?.length > 0 && <Flow stacktrace={stacktrace} />}
        {suggestions?.length > 0 && <Suggestions suggestions={suggestions} />}
      </Fragment>
    )
  }

  return (
    <Collapsible
      opened={isExpanded(DIALOG_PANEL)}
      toggleExpand={expanded => toggleExpand(DIALOG_PANEL, expanded)}
      name="Dialog Manager"
    >
      {renderContent()}
      <Button minimal className={style.switchViewBtn} icon="eye-open" onClick={toggleView}>
        {viewJSON ? 'View as Summary' : 'View as JSON'}
      </Button>
    </Collapsible>
  )
}

export default Dialog
