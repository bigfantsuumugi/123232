import { Icon } from '@blueprintjs/core'
import { SearchBar, SectionAction, SidePanel, SidePanelSection } from 'botpress/ui'
import { inject, observer } from 'mobx-react'
import React from 'react'

import { FilePermissions } from '../../backend/typings'
import { HOOK_SIGNATURES } from '../../typings/hooks'

import FileStatus from './components/FileStatus'
import { RootStore, StoreDef } from './store'
import { EditorStore } from './store/editor'
import FileNavigator from './FileNavigator'

class PanelContent extends React.Component<Props> {
  private expandedNodes = {}

  state = {
    actionFiles: [],
    hookFiles: [],
    botConfigs: []
  }

  componentDidMount() {
    this.updateFolders()
  }

  componentDidUpdate(prevProps) {
    if (prevProps.files !== this.props.files) {
      this.updateFolders()
    }
  }

  updateFolders() {
    if (!this.props.files) {
      return
    }

    const { actionsBot, actionsGlobal, hooksGlobal, configsBot, configsGlobal } = this.props.files

    const actionFiles = []
    actionsBot && actionFiles.push({ label: `Bot (${window['BOT_NAME']})`, files: actionsBot })
    actionsGlobal && actionFiles.push({ label: 'Global', files: actionsGlobal })

    const hookFiles = hooksGlobal ? [{ label: 'Global', files: hooksGlobal }] : []

    const botConfigFiles = []
    configsBot && botConfigFiles.push({ label: 'Current Bot', files: configsBot })
    configsGlobal && botConfigFiles.push({ label: 'Global', files: configsGlobal })

    this.setState({ actionFiles, hookFiles, botConfigs: botConfigFiles })
  }

  updateNodeState = (id: string, isExpanded: boolean) => {
    if (isExpanded) {
      this.expandedNodes[id] = true
    } else {
      delete this.expandedNodes[id]
    }
  }

  renderSectionBotsConfig() {
    const { readPermissions } = (this.props.permissions || {}) as FilePermissions
    if (!readPermissions || (!readPermissions.globalConfigs && !readPermissions.botConfigs)) {
      return null
    }

    return (
      <SidePanelSection label={'Configurations'}>
        <FileNavigator
          files={this.state.botConfigs}
          disableContextMenu={true}
          expandedNodes={this.expandedNodes}
          onNodeStateChanged={this.updateNodeState}
        />
      </SidePanelSection>
    )
  }

  renderSectionActions() {
    const { writePermissions } = (this.props.permissions || {}) as FilePermissions

    const items: SectionAction[] = [
      {
        id: `btn-add-action-bot`,
        label: 'Action - Bot',
        icon: <Icon icon="new-text-box" />,
        onClick: () => this.props.createFilePrompt('action', false)
      }
    ]

    if (writePermissions && writePermissions.globalActions) {
      items.push({
        id: `btn-add-action-global`,
        label: 'Action - Global',
        icon: <Icon icon="new-text-box" />,
        onClick: () => this.props.createFilePrompt('action', true)
      })
    }

    return (
      <SidePanelSection
        label={'Actions'}
        actions={[{ id: 'btn-add-action', icon: <Icon icon="add" />, key: 'add', items }]}
      >
        <FileNavigator
          files={this.state.actionFiles}
          expandedNodes={this.expandedNodes}
          onNodeStateChanged={this.updateNodeState}
        />
      </SidePanelSection>
    )
  }

  renderSectionHooks() {
    if (
      !this.props.permissions ||
      !this.props.permissions.readPermissions ||
      !this.props.permissions.writePermissions
    ) {
      return null
    }

    const { writePermissions, readPermissions } = this.props.permissions
    const canRead = readPermissions.hooks
    const canWrite = writePermissions.hooks

    if (!canRead) {
      return null
    }

    const actions = canWrite ? this._buildHooksActions() : []

    return (
      <SidePanelSection label={'Hooks'} actions={actions}>
        <FileNavigator
          files={this.state.hookFiles}
          expandedNodes={this.expandedNodes}
          onNodeStateChanged={this.updateNodeState}
        />
      </SidePanelSection>
    )
  }

  _buildHooksActions() {
    const hooks = Object.keys(HOOK_SIGNATURES).map(hookType => ({
      id: hookType,
      label: hookType
        .split('_')
        .map(x => x.charAt(0).toUpperCase() + x.slice(1))
        .join(' '),
      onClick: () => this.props.createFilePrompt('hook', true, hookType)
    }))

    return [
      {
        id: 'btn-add-hook',
        icon: <Icon icon="add" />,
        key: 'add',
        items: [
          {
            label: 'Event Hooks',
            items: hooks.filter(x =>
              [
                'before_incoming_middleware',
                'after_incoming_middleware',
                'before_outgoing_middleware',
                'after_event_processed',
                'before_suggestions_election',
                'before_session_timeout'
              ].includes(x.id)
            )
          },
          {
            label: 'Bot Hooks',
            items: hooks.filter(x => ['after_bot_mount', 'after_bot_unmount', 'before_bot_import'].includes(x.id))
          },
          {
            label: 'General Hooks',
            items: hooks.filter(x => ['after_server_start'].includes(x.id))
          },
          {
            label: 'Pipeline Hooks',
            items: hooks.filter(x =>
              ['on_incident_status_changed', 'on_stage_request', 'after_stage_changed'].includes(x.id)
            )
          }
        ]
      }
    ]
  }

  render() {
    return (
      <SidePanel>
        {this.props.editor.isOpenedFile && this.props.editor.isDirty ? (
          <FileStatus />
        ) : (
          <React.Fragment>
            <SearchBar
              icon="filter"
              placeholder="Filter files"
              onChange={this.props.setFilenameFilter}
              showButton={false}
            />

            {this.renderSectionActions()}
            {this.renderSectionHooks()}
            {this.renderSectionBotsConfig()}
          </React.Fragment>
        )}
      </SidePanel>
    )
  }
}

export default inject(({ store }: { store: RootStore }) => ({
  store,
  editor: store.editor,
  files: store.files,
  isDirty: store.editor.isDirty,
  setFilenameFilter: store.setFilenameFilter,
  createFilePrompt: store.createFilePrompt,
  permissions: store.permissions
}))(observer(PanelContent))

type Props = { store?: RootStore; editor?: EditorStore } & Pick<
  StoreDef,
  'files' | 'permissions' | 'createFilePrompt' | 'setFilenameFilter'
>
