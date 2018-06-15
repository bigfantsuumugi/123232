import React, { Component } from 'react'
import { Button, Checkbox, Panel } from 'react-bootstrap'
import axios from 'axios'
import _ from 'lodash'
import classnames from 'classnames'
import moment from 'moment'

import PageHeader from '~/components/Layout/PageHeader'
import ContentWrapper from '~/components/Layout/ContentWrapper'

import styles from './style.scss'

class LoggerView extends Component {
  state = {
    autoRefresh: true,
    logs: null,
    limit: 25,
    hasMore: false
  }

  componentDidMount() {
    if (!this.state.logs) {
      this.getArchiveKey()
      this.queryLogs()
      this.refreshInterval = setInterval(this.queryLogs, 1000)
    }
  }

  componentWillUnmount() {
    clearInterval(this.refreshInterval)
    this.cancelLoading = true
  }

  loadMore = () => {
    this.setState({ limit: this.state.limit + 50, logs: null })
  }

  toggleAutoRefresh = () => {
    if (this.state.autoRefresh) {
      clearInterval(this.refreshInterval)
    } else {
      this.refreshInterval = setInterval(this.queryLogs, 1000)
    }

    this.setState({ autoRefresh: !this.state.autoRefresh })
  }

  renderLine(line, index) {
    const time = moment(new Date(line.timestamp)).format('MMM DD HH:mm:ss')
    const message = line.message.replace(/\[\d\d?m/gi, '')

    return (
      <li key={`log_event_${index}`} className={styles.line}>
        <span className={styles.time}>{time}</span>
        <span className={styles['level-' + line.level]}>{line.level + ': '}</span>
        <span className={styles.message}>{message}</span>
      </li>
    )
  }

  renderLoading() {
    return <div style={{ marginTop: '20px' }} className="whirl traditional" />
  }

  getArchiveKey() {
    axios.get('/api/logs/key').then(({ data }) => this.setState({ archiveUrl: '/api/logs/archive/' + data.secret }))
  }

  queryLogs = () => {
    axios
      .get('/api/logs', {
        params: {
          limit: this.state.limit
        }
      })
      .then(result => {
        if (this.cancelLoading) {
          return
        }
        this.setState({
          logs: result.data,
          hasMore: result.data && result.data.length >= this.state.limit
        })
      })
  }

  renderLines() {
    if (!_.isArray(this.state.logs)) {
      return this.renderLoading()
    }

    return this.state.logs.filter(x => _.isString(x.message)).map(this.renderLine)
  }

  render() {
    const logs = this.renderLines()
    const logsPanelClassName = classnames('panel', 'panel-default', styles['logs-panel'])
    const canLoadMore = this.state.limit < 500 && this.state.hasMore

    return (
      <ContentWrapper>
        <PageHeader>
          <span> Logs</span>
        </PageHeader>
        <Panel className={styles.panel}>
          <Panel.Body>
            <form className="pull-left">
              <Checkbox
                className={styles['panel-checkbox']}
                checked={this.state.autoRefresh}
                inline
                onChange={this.toggleAutoRefresh}
              >
                Auto refresh
              </Checkbox>
            </form>
            <div className="pull-right">
              <Button href={this.state.archiveUrl}>Export logs archive</Button>
            </div>
          </Panel.Body>
        </Panel>
        <div className={logsPanelClassName}>
          <div className="panel-body">
            <ul className={styles.events}>{logs}</ul>
          </div>
          {canLoadMore && (
            <div href="#" className={styles['logs-panel-footer']} onClick={this.loadMore}>
              Load more
            </div>
          )}
        </div>
      </ContentWrapper>
    )
  }
}

export default LoggerView
