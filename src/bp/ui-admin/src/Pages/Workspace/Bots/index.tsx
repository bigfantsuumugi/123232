import {
  Alignment,
  Button,
  ButtonGroup,
  Callout,
  Intent,
  Popover,
  PopoverInteractionKind,
  Position
} from '@blueprintjs/core'
import _ from 'lodash'
import React, { Component, Fragment } from 'react'
import { connect } from 'react-redux'
import { RouteComponentProps } from 'react-router'
import { Alert, Col, Row } from 'reactstrap'
import { toastSuccess } from '~/utils/toaster'
import { Downloader } from '~/Pages/Components/Downloader'

import api from '../../../api'
import { fetchBots } from '../../../reducers/bots'
import { fetchLicensing } from '../../../reducers/license'
import AccessControl from '../../../App/AccessControl'
import LoadingSection from '../../Components/LoadingSection'
import SectionLayout from '../../Layouts/Section'

import BotItemCompact from './BotItemCompact'
import BotItemPipeline from './BotItemPipeline'
import CreateBotModal from './CreateBotModal'
import ImportBotModal from './ImportBotModal'
import RollbackBotModal from './RollbackBotModal'

interface Props extends RouteComponentProps {
  bots: any
  workspace: any
  fetchBots: any
  fetchLicensing: any
  licensing: any
}

class Bots extends Component<Props> {
  state = {
    isCreateBotModalOpen: false,
    isRollbackModalOpen: false,
    isImportBotModalOpen: false,
    focusedBot: null,
    archiveUrl: undefined,
    archiveName: ''
  }

  componentDidMount() {
    this.props.fetchBots()
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
      await api.getSecured().post(`/admin/bots/${botId}/delete`)
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
      <AccessControl resource="admin.bots.*" operation="write">
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
    toastSuccess('Revisions created')
  }

  toggleRollbackModal = (botId?: string) => {
    this.setState({
      focusedBot: typeof botId === 'string' ? botId : null,
      isRollbackModalOpen: !this.state.isRollbackModalOpen
    })
  }

  handleRollbackSuccess = () => {
    this.props.fetchBots()
    toastSuccess('Rollback success')
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
            deleteBot={this.deleteBot.bind(this, bot.id)}
            exportBot={this.exportBot.bind(this, bot.id)}
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
                    allowStageChange={allowStageChange}
                    requestStageChange={this.requestStageChange.bind(this, bot.id)}
                    deleteBot={this.deleteBot.bind(this, bot.id)}
                    exportBot={this.exportBot.bind(this, bot.id)}
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
          title="Bots"
          helpText="This page lists all the bots created under the current workspace."
          activePage="bots"
          mainContent={this.renderBots()}
          sideMenu={!this.isPipelineView && this.renderCreateNewBotButton()}
        />
        <AccessControl resource="admin.bots.*" operation="write">
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
        </AccessControl>
      </Fragment>
    )
  }
}

const mapStateToProps = state => ({
  bots: state.bots.bots,
  workspace: state.bots.workspace,
  loading: state.bots.loadingBots,
  licensing: state.license.licensing
})

const mapDispatchToProps = {
  fetchBots,
  fetchLicensing
}

export default connect(
  mapStateToProps,
  mapDispatchToProps
)(Bots)
