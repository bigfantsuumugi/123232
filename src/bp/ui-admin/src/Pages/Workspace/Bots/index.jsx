import React, { Component, Fragment } from 'react'

import { connect } from 'react-redux'
import { Row, Col, Alert } from 'reactstrap'

import _ from 'lodash'

import { fetchBots } from '../../../reducers/bots'
import { fetchPermissions } from '../../../reducers/user'
import { fetchLicensing } from '../../../reducers/license'

import SectionLayout from '../../Layouts/Section'
import LoadingSection from '../../Components/LoadingSection'

import api from '../../../api'
import { AccessControl } from '../../../App/AccessControl'
import CreateBotModal from './CreateBotModal'
import ImportBotModal from './ImportBotModal'
import BotItemPipeline from './BotItemPipeline'
import BotItemCompact from './BotItemCompact'
import RollbackBotModal from './RollbackBotModal'
import { toast } from 'react-toastify'

import {
  Popover,
  Button,
  PopoverInteractionKind,
  Position,
  ButtonGroup,
  Alignment,
  Intent,
  Callout
} from '@blueprintjs/core'

import { Downloader } from '~/Pages/Components/Downloader'

class Bots extends Component {
  state = {
    isCreateBotModalOpen: false,
    focusedBot: null,
    isRollbackModalOpen: false
  }

  renderLoading() {
    return <LoadingSection />
  }

  componentDidMount() {
    this.downloadLink = React.createRef()
    this.props.fetchBots()
    this.props.fetchPermissions()
    if (!this.props.licensing) {
      this.props.fetchLicensing()
    }
  }

  toggleCreateBotModal = () => {
    this.setState({ isCreateBotModalOpen: !this.state.isCreateBotModalOpen })
  }

  toggleImportBotModal = () => {
    this.setState({ isImportBotModalOpen: !this.state.isImportBotModalOpen })
  }

  async exportBot(botId) {
    this.setState({
      archiveUrl: `/admin/bots/${botId}/export`,
      archiveName: `bot_${botId}_${Date.now()}.tgz`
    })
  }

  async deleteBot(botId) {
    if (window.confirm("Are you sure you want to delete this bot? This can't be undone.")) {
      await api.getSecured().delete(`/admin/bots/${botId}`)
      await this.props.fetchBots()
    }
  }

  renderEmptyBots() {
    return (
      <Callout title="This workspace has no bot, yet" style={{ textAlign: 'center' }}>
        <p>
          <br />
          In Botpress, bots are always assigned to a workspace.
          <br />
          Create your first bot to start building.
        </p>
      </Callout>
    )
  }

  renderCreateNewBotButton() {
    return (
      <AccessControl permissions={this.props.permissions} resource="admin.bots.*" operation="write">
        <Popover minimal interactionKind={PopoverInteractionKind.HOVER} position={Position.BOTTOM}>
          <Button id="btn-create-bot" intent={Intent.NONE} text="Create Bot" rightIcon="caret-down" />
          <ButtonGroup vertical={true} minimal={true} fill={true} alignText={Alignment.LEFT}>
            <Button
              id="btn-new-bot"
              text="New Bot"
              icon="add"
              onClick={() => this.setState({ isCreateBotModalOpen: true })}
            />
            <Button
              id="btn-import-bot"
              text="Import Existing"
              icon="import"
              onClick={() => this.setState({ isImportBotModalOpen: true })}
            />
          </ButtonGroup>
        </Popover>
      </AccessControl>
    )
  }

  hasUnlangedBots = () => {
    return this.props.bots.reduce((hasUnlangedBots, bot) => hasUnlangedBots || !bot.defaultLanguage, false)
  }

  async requestStageChange(botId) {
    await api.getSecured().post(`/admin/bots/${botId}/stage`)
    await this.props.fetchBots()
  }

  isLicensed = () => {
    return _.get(this.props.licensing, 'status') === 'licensed'
  }

  async createRevision(botId) {
    await api.getSecured().post(`admin/bots/${botId}/revisions`)
    toast.success('Revisions created')
  }

  toggleRollbackModal = botId => {
    this.setState({
      focusedBot: typeof botId === 'string' ? botId : null,
      isRollbackModalOpen: !this.state.isRollbackModalOpen
    })
  }

  handleRollbackSuccess = () => {
    this.props.fetchBots()
    toast.success('Rollback success')
  }

  renderCompactView() {
    if (!this.props.bots.length) {
      return this.renderEmptyBots()
    }
    return (
      <div className="bp_table bot_views compact_view">
        {this.props.bots.map(bot => (
          <BotItemCompact
            key={bot.id}
            bot={bot}
            history={this.props.history}
            deleteBot={this.deleteBot.bind(this, bot.id)}
            exportBot={this.exportBot.bind(this, bot.id)}
            permissions={this.props.permissions}
            createRevision={this.createRevision.bind(this, bot.id)}
            rollback={this.toggleRollbackModal.bind(this, bot.id)}
          />
        ))}
      </div>
    )
  }

  renderPipelineView() {
    const pipeline = this.props.workspace.pipeline
    const botsByStage = _.groupBy(this.props.bots, 'pipeline_status.current_stage.id')
    const colSize = Math.floor(12 / pipeline.length)

    return (
      <Fragment>
        <Row className="pipeline_view bot_views">
          {pipeline.map((stage, idx) => {
            const allowStageChange = this.isLicensed() && idx !== pipeline.length - 1
            return (
              <Col key={stage.id} md={colSize}>
                {pipeline.length > 1 && <h3 className="pipeline_title">{stage.label}</h3>}
                {idx === 0 && <div className="pipeline_bot create">{this.renderCreateNewBotButton()}</div>}
                {(botsByStage[stage.id] || []).map(bot => (
                  <BotItemPipeline
                    key={bot.id}
                    bot={bot}
                    history={this.props.history}
                    allowStageChange={allowStageChange}
                    requestStageChange={this.requestStageChange.bind(this, bot.id)}
                    deleteBot={this.deleteBot.bind(this, bot.id)}
                    exportBot={this.exportBot.bind(this, bot.id)}
                    permissions={this.props.permissions}
                    createRevision={this.createRevision.bind(this, bot.id)}
                    rollback={this.toggleRollbackModal.bind(this, bot.id)}
                  />
                ))}
              </Col>
            )
          })}
        </Row>
      </Fragment>
    )
  }

  renderBots() {
    const botsView = this.isPipelineView ? this.renderPipelineView() : this.renderCompactView()
    return (
      <div>
        {this.hasUnlangedBots() && (
          <Alert color="warning">
            You have bots without specified language. Default language is mandatory since Botpress 11.8. Please set bot
            language in the bot config page.
          </Alert>
        )}
        {botsView}
      </div>
    )
  }

  get isPipelineView() {
    return this.props.workspace.pipeline.length > 1
  }

  render() {
    if (!this.props.bots) {
      return <LoadingSection />
    }

    return (
      <Fragment>
        <Downloader url={this.state.archiveUrl} filename={this.state.archiveName} />

        <SectionLayout
          title={`Your bots`}
          helpText="This page lists all the bots created under the default workspace."
          activePage="bots"
          mainContent={this.renderBots()}
          sideMenu={!this.isPipelineView && this.renderCreateNewBotButton()}
        />
        <RollbackBotModal
          botId={this.state.focusedBot}
          isOpen={this.state.isRollbackModalOpen}
          toggle={this.toggleRollbackModal}
          onRollbackSuccess={this.handleRollbackSuccess}
        />
        <CreateBotModal
          isOpen={this.state.isCreateBotModalOpen}
          toggle={this.toggleCreateBotModal}
          onCreateBotSuccess={this.props.fetchBots}
        />
        <ImportBotModal
          isOpen={this.state.isImportBotModalOpen}
          toggle={this.toggleImportBotModal}
          onCreateBotSuccess={this.props.fetchBots}
        />
      </Fragment>
    )
  }
}

const mapStateToProps = state => ({
  bots: state.bots.bots,
  workspace: state.bots.workspace,
  loading: state.bots.loadingBots,
  permissions: state.user.permissions,
  licensing: state.license.licensing
})

const mapDispatchToProps = {
  fetchBots,
  fetchLicensing,
  fetchPermissions
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Bots)
