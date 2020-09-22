import { NLU } from 'botpress/sdk'
import { lang, toast, utils } from 'botpress/shared'
import cx from 'classnames'
import React, { FC, Fragment, useEffect, useRef, useState } from 'react'
import { HotKeys } from 'react-hotkeys'
import { connect } from 'react-redux'
import { Redirect, Route, Switch } from 'react-router-dom'
import SplitPane from 'react-split-pane'
import { bindActionCreators } from 'redux'
import { setEmulatorOpen, toggleBottomPanel, trainSessionReceived, viewModeChanged, zoomIn, zoomOut } from '~/actions'
import SelectContentManager from '~/components/Content/Select/Manager'
import PluginInjectionSite from '~/components/PluginInjectionSite'
import BackendToast from '~/components/Util/BackendToast'
import { RootReducer } from '~/reducers'
import storage from '~/util/storage'
import Content from '~/views/Content'
import FlowBuilder from '~/views/FlowBuilder'
import Logs from '~/views/Logs'
import Module from '~/views/Module'
import OneFlow from '~/views/OneFlow'

import { TrainingStatusService } from './training-status-service'
import BetaNotice from './BetaNotice'
import BotUmountedWarning from './BotUnmountedWarning'
import CommandPalette from './CommandPalette'
import GuidedTour from './GuidedTour'
import LanguageServerHealth from './LangServerHealthWarning'
import layout from './Layout.scss'
import NotTrainedWarning from './NotTrainedWarning'
import Sidebar from './Sidebar'
import StatusBar from './StatusBar'
import Toolbar from './Toolbar'
import BottomPanel from './Toolbar/BottomPanel'

const { isInputFocused } = utils
const WEBCHAT_PANEL_STATUS = 'bp::webchatOpened'

interface ILayoutProps {
  viewModeChanged: any
  docModal: any
  location: any
  toggleBottomPanel: () => null
  zoomIn: () => null
  zoomOut: () => null
  history: any
  trainSessionReceived: (ts: NLU.TrainingSession) => void
  setEmulatorOpen: (state: boolean) => void
}

type StateProps = ReturnType<typeof mapStateToProps>

const Layout: FC<ILayoutProps & StateProps> = props => {
  const mainElRef = useRef(null)
  const [langSwitcherOpen, setLangSwitcherOpen] = useState(false)
  const [guidedTourOpen, setGuidedTourOpen] = useState(false)

  useEffect(() => {
    const viewMode = props.location.query && props.location.query.viewMode

    setImmediate(() => {
      props.viewModeChanged(Number(viewMode) || 0)
    })

    setTimeout(() => BotUmountedWarning(), 500)

    const handleWebChatPanel = message => {
      if (message.data.name === 'webchatLoaded' && storage.get(WEBCHAT_PANEL_STATUS) === 'opened') {
        toggleEmulator()
      }

      if (message.data.name === 'webchatOpened') {
        storage.set(WEBCHAT_PANEL_STATUS, 'opened')
        props.setEmulatorOpen(true)
      }

      if (message.data.name === 'webchatClosed') {
        storage.set(WEBCHAT_PANEL_STATUS, 'closed')
        props.setEmulatorOpen(false)
      }
    }
    window.addEventListener('message', handleWebChatPanel)

    return () => {
      window.removeEventListener('message', handleWebChatPanel)
    }
  }, [])

  useEffect(() => {
    const trainStatusService = new TrainingStatusService(props.contentLang, props.trainSessionReceived)
    // tslint:disable-next-line: no-floating-promises
    trainStatusService.fetchTrainingStatus()
    trainStatusService.startPolling()

    return () => trainStatusService.stopPolling()
  }, [props.contentLang])

  useEffect(() => {
    if (props.translations) {
      lang.extend(props.translations)
      lang.init()
    }
  }, [props.translations])

  const toggleEmulator = () => {
    window.botpressWebChat.sendEvent({ type: 'toggle' })
  }

  const toggleGuidedTour = () => {
    !window.USE_ONEFLOW && setGuidedTourOpen(!guidedTourOpen)
  }

  const focusEmulator = e => {
    if (!isInputFocused() || e.ctrlKey) {
      e.preventDefault()
      window.botpressWebChat.sendEvent({ type: 'show' })
    }
  }

  const closeEmulator = e => {
    window.botpressWebChat.sendEvent({ type: 'hide' })
  }

  const toggleDocs = e => {
    e.preventDefault()

    if (props.docHints.length) {
      window.open(`https://botpress.com/docs/${props.docHints[0]}`, '_blank')
    }
  }

  const toggleLangSwitcher = e => {
    e && e.preventDefault()
    if (!isInputFocused()) {
      setLangSwitcherOpen(() => {
        // lang switcher just closed
        if (!langSwitcherOpen) {
          focusMain()
        }
        return !langSwitcherOpen
      })
    }
  }

  const focusMain = () => {
    if (mainElRef?.current) {
      mainElRef.current.focus()
    }
  }

  const gotoUrl = url => {
    if (!isInputFocused()) {
      props.history.push(url)
      focusMain()
    }
  }

  const toggleBottomPanel = e => {
    e.preventDefault()
    props.toggleBottomPanel()
  }

  const goHome = () => {
    if (!isInputFocused()) {
      window.location.href = `${window.ROOT_PATH}/admin`
    }
  }

  if (props.viewMode < 0 || !props.translations) {
    return null
  }

  const keyHandlers = {
    'emulator-focus': focusEmulator,
    cancel: closeEmulator,
    'docs-toggle': toggleDocs,
    'bottom-bar': toggleBottomPanel,
    'lang-switcher': toggleLangSwitcher,
    'go-flow': () => gotoUrl('/flows'),
    'go-home': goHome,
    'go-content': () => gotoUrl('/content'),
    'go-module-code': () => gotoUrl('/modules/code-editor'),
    'go-module-qna': () => gotoUrl('/modules/qna'),
    'go-module-testing': () => gotoUrl('/modules/testing'),
    'go-module-analytics': () => gotoUrl('/modules/analytics'),
    'go-understanding': () => gotoUrl('/modules/nlu'),
    'zoom-in': e => {
      e.preventDefault()
      props.zoomIn()
    },
    'zoom-out': e => {
      e.preventDefault()
      props.zoomOut()
    }
  }

  const splitPanelLastSizeKey = `bp::${window.BOT_ID}::bottom-panel-size`
  const lastSize = parseInt(localStorage.getItem(splitPanelLastSizeKey) || '175', 10)
  const bottomBarSize = props.bottomPanel ? lastSize : '100%'

  return (
    <Fragment>
      <HotKeys
        handlers={keyHandlers}
        id="mainLayout"
        className={cx(layout.mainLayout, { 'layout-emulator-open': props.emulatorOpen })}
      >
        <Sidebar />
        <div className={layout.container}>
          <Toolbar
            hasDoc={props.docHints?.length}
            toggleDocs={toggleDocs}
            onToggleEmulator={toggleEmulator}
            toggleBottomPanel={props.toggleBottomPanel}
          />
          <SplitPane
            split={'horizontal'}
            defaultSize={lastSize}
            onChange={size => size > 100 && localStorage.setItem(splitPanelLastSizeKey, size.toString())}
            size={bottomBarSize}
            maxSize={-100}
            className={layout.mainSplitPaneWToolbar}
          >
            <main ref={mainElRef} className={layout.main} id="main" tabIndex={9999}>
              <Switch>
                <Route
                  exact
                  path="/"
                  render={() => {
                    if (!window.IS_BOT_MOUNTED) {
                      return <Redirect to="/" />
                    }

                    return window.USE_ONEFLOW ? <Redirect to="/oneflow" /> : <Redirect to="/flows" />
                  }}
                />
                <Route exact path="/content" component={Content} />
                <Route exact path="/flows/:flow*" component={FlowBuilder} />
                <Route exact path="/oneflow/:flow*" component={OneFlow} />
                <Route exact path="/modules/:moduleName/:componentName?" render={props => <Module {...props} />} />
                <Route exact path="/logs" component={Logs} />
              </Switch>
            </main>
            <BottomPanel />
          </SplitPane>

          <PluginInjectionSite site="overlay" />
          <BackendToast />
          <SelectContentManager />
          <GuidedTour isDisplayed={!window.USE_ONEFLOW && guidedTourOpen} onToggle={toggleGuidedTour} />
          <BetaNotice />
          <LanguageServerHealth />
        </div>
      </HotKeys>
      <NotTrainedWarning />
      <StatusBar
        langSwitcherOpen={langSwitcherOpen}
        toggleLangSwitcher={toggleLangSwitcher}
        onToggleGuidedTour={toggleGuidedTour}
        toggleBottomPanel={props.toggleBottomPanel}
      />
      <CommandPalette toggleEmulator={toggleEmulator} />
    </Fragment>
  )
}

const mapStateToProps = (state: RootReducer) => ({
  viewMode: state.ui.viewMode,
  docHints: state.ui.docHints,
  emulatorOpen: state.ui.emulatorOpen,
  bottomPanel: state.ui.bottomPanel,
  translations: state.language.translations,
  contentLang: state.language.contentLang
})

const mapDispatchToProps = dispatch =>
  bindActionCreators(
    { viewModeChanged, toggleBottomPanel, trainSessionReceived, setEmulatorOpen, zoomIn, zoomOut },
    dispatch
  )

export default connect(mapStateToProps, mapDispatchToProps)(Layout)
