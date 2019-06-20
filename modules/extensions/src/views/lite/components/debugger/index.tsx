import { Tab, Tabs } from '@blueprintjs/core'
import '@blueprintjs/core/lib/css/blueprint.css'
import ms from 'ms'
import nanoid from 'nanoid'
import React from 'react'
import { MdBugReport } from 'react-icons/md'

import Settings from './settings'
import style from './style.scss'
import { Decision } from './views/Decision'
import { Entities } from './views/Entities'
import { Flow } from './views/Flow'
import { Inspector } from './views/Inspector'
import { Intents } from './views/Intents'
import { Slots } from './views/Slots'
import { Suggestions } from './views/Suggestions'
import EventNotFound from './EventNotFound'
import FetchingEvent from './FetchingEvent'
import Header from './Header'
import SplashScreen from './SplashScreen'

export const updater = { callback: undefined }

const WEBCHAT_WIDTH = 400
const DEV_TOOLS_WIDTH = 450
const RETRY_PERIOD = 500

export class Debugger extends React.Component<Props, State> {
  state = {
    event: undefined,
    showEventNotFound: false,
    visible: false,
    selectedTabId: 'basic',
    showSettings: false,
    fetching: false
  }
  allowedRetryCount = 0
  currentRetryCount = 0
  retryTimer: number

  async componentDidMount() {
    updater.callback = this.selectEvent

    this.props.store.view.setLayoutWidth(WEBCHAT_WIDTH)
    this.props.store.view.setContainerWidth(WEBCHAT_WIDTH)

    this.props.store.setMessageWrapper({ module: 'extensions', component: 'Wrapper' })
    window.addEventListener('keydown', this.hotkeyListener)

    const { data } = await this.props.store.bp.axios.get('/mod/extensions/events/update-frequency')
    const { collectionInterval } = data
    const maxDelai = ms(collectionInterval as string)
    this.allowedRetryCount = Math.ceil(maxDelai / RETRY_PERIOD)
  }

  componentWillUnmount() {
    this.props.store.view.removeHeaderButton('toggleDev')
    window.removeEventListener('keydown', this.hotkeyListener)
    this.props.store.setMessageWrapper(undefined)
    this.resetWebchat()
  }

  componentDidUpdate(_prevProps, prevState) {
    if (prevState.visible && !this.state.visible) {
      this.resetWebchat()
    }
  }

  resetWebchat() {
    this.props.store.view.setHighlightedMessages([])
    this.props.store.view.setLayoutWidth(WEBCHAT_WIDTH)
    this.props.store.view.setContainerWidth(WEBCHAT_WIDTH)
  }

  hotkeyListener = e => {
    if (e.ctrlKey && e.key === 'F12') {
      this.toggleDebugger()
    }
  }

  selectEvent = async eventId => {
    const previousEvent = this.state.event

    // tslint:disable-next-line: no-floating-promises
    this.loadEvent(eventId)

    if (previousEvent && previousEvent.id === eventId && this.state.visible) {
      this.closeDebugger()
      return
    }
    this.openDebugger()
    this.props.store.view.setHighlightedMessages(eventId)
  }

  loadEvent = async eventId => {
    clearInterval(this.retryTimer)
    const event = await this.fetchEvent(eventId)
    if (!event) {
      this.setState({ fetching: true })

      this.retryTimer = window.setInterval(async () => {
        await this.retryLoadEvent(eventId)
      }, RETRY_PERIOD)
    }
    this.setState({ event })
  }

  retryLoadEvent = async eventId => {
    const event = await this.fetchEvent(eventId)
    this.currentRetryCount++

    if (!event && this.currentRetryCount < this.allowedRetryCount) {
      return
    }

    clearInterval(this.retryTimer)
    this.currentRetryCount = 0
    this.setState({ event, showEventNotFound: !event, fetching: false })
  }

  fetchEvent = async eventId => {
    try {
      const { data } = await this.props.store.bp.axios.get('/mod/extensions/events/' + eventId)
      return data
    } catch (err) {
      return
    }
  }

  handleNewSession = () => {
    const userId = nanoid(20)
    this.props.store.setUserId(userId)
  }

  toggleDebugger = () => {
    if (this.state.visible) {
      this.closeDebugger()
      return
    }
    this.openDebugger()
  }

  closeDebugger = () => {
    this.props.store.view.setContainerWidth(WEBCHAT_WIDTH)
    this.setState({ visible: false })
  }

  openDebugger = () => {
    this.props.store.view.setContainerWidth(WEBCHAT_WIDTH + DEV_TOOLS_WIDTH)
    this.setState({ visible: true })
  }

  toggleSettings = e => this.setState({ showSettings: !this.state.showSettings })
  handleTabChange = selectedTabId => this.setState({ selectedTabId })

  renderSummary() {
    return (
      <div>
        <Decision decision={this.state.event.decision} />
        <Intents nlu={this.state.event.nlu} />
        <Entities nlu={this.state.event.nlu} />
        <Suggestions suggestions={this.state.event.suggestions} />
        <Slots nlu={this.state.event.nlu} />
      </div>
    )
  }

  renderWhenNoEvent() {
    if (this.state.fetching) {
      return <FetchingEvent />
    }
    if (this.state.showEventNotFound) {
      return <EventNotFound />
    }
    return <SplashScreen />
  }

  render() {
    if (!this.state.visible) {
      return null
    }

    return (
      <div className={style.container2}>
        <Settings store={this.props.store} isOpen={this.state.showSettings} toggle={this.toggleSettings} />
        <Header newSession={this.handleNewSession} toggleSettings={this.toggleSettings} />
        {!this.state.event && this.renderWhenNoEvent()}
        {this.state.event && (
          <div className={style.content}>
            <Tabs id="tabs" onChange={this.handleTabChange} selectedTabId={this.state.selectedTabId}>
              <Tab id="basic" title="Summary" panel={this.renderSummary()} />
              <Tab id="advanced" title="View payload" panel={<Inspector data={this.state.event} />} />
              <Tab id="flow" title="Debug flow" panel={<Flow stacktrace={this.state.event.state.__stacktrace} />} />
            </Tabs>
          </div>
        )}
      </div>
    )
  }
}

interface Props {
  store: any
}

interface State {
  event: any
  selectedTabId: string
  visible: boolean
  showSettings: boolean
  showEventNotFound: boolean
  fetching: boolean
}
