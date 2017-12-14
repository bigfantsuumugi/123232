import React, { Component } from 'react'
import classnames from 'classnames'
import sortBy from 'lodash/sortBy'

import { Alert, Button, Modal } from 'react-bootstrap'

import ContentWrapper from '~/components/Layout/ContentWrapper'
import PageHeader from '~/components/Layout/PageHeader'
import Loading from '~/components/Util/Loading'
import About from './About'

import { fetchStatus } from './util'

export default class GhostView extends Component {
  state = {
    loading: true,
    data: null,
    error: null,
    showAbout: false,
    showSyncHelp: false
  }

  showAbout = () => {
    this.setState({ showAbout: true })
  }

  hideAbout = () => {
    this.setState({ showAbout: false })
  }

  showSyncHelp = () => {
    this.setState({ showSyncHelp: true })
  }

  hideSyncHelp = () => {
    this.setState({ showSyncHelp: false })
  }

  fetch() {
    this.setState({ loading: true })

    fetchStatus()
      .then(data => {
        this.setState({ data, loading: false, error: null })
      })
      .catch(error => {
        this.setState({ error: error.message || 'Unknown', loading: false })
      })
  }

  componentDidMount() {
    this.fetch()
  }

  renderRevision({ folder, file, revision, created_on: createdOn }) {
    return (
      <li key={`${folder}/${file}/${revision}`}>
        {revision}, created {createdOn}
      </li>
    )
  }

  renderFile(folder, file, data) {
    data = sortBy(data, 'created_on')
    return (
      <li key={`${folder}/${file}`}>
        <strong>{file}</strong>
        <ul>{data.map(datum => this.renderRevision(datum))}</ul>
      </li>
    )
  }

  renderFolder(folder, data) {
    const files = Object.keys(data).sort()
    return (
      <li key={folder}>
        <strong>{folder}</strong>
        <ul>{files.map(file => this.renderFile(folder, file, data[file]))}</ul>
      </li>
    )
  }

  renderContent() {
    const { data } = this.state
    const folders = Object.keys(data).sort()

    if (!folders.length) {
      return (
        <Alert bsStyle="success">
          <p>You don't have any ghost content in your DB, DB is in sync with the bot source code.</p>
          <p>
            Don't know what is ghost content?&nbsp;
            <Button bsSize="small" bsStyle="link" onClick={this.showAbout}>
              Read about this feature
            </Button>.
          </p>
        </Alert>
      )
    }

    return (
      <div>
        <Alert bsStyle="warning">
          <p>
            Below is the list of ghost content present in the DB. You need to eventually sync it up with the bot source
            code.&nbsp;
            <Button bsSize="small" bsStyle="info" onClick={this.showSyncHelp}>
              Show me how to do it
            </Button>
          </p>
          <p>
            Don't know what is ghost content?&nbsp;
            <Button bsSize="small" bsStyle="link" onClick={this.showAbout}>
              Read about this feature
            </Button>
          </p>
        </Alert>
        <ul>{folders.map(folder => this.renderFolder(folder, data[folder]))}</ul>
      </div>
    )
  }

  renderBody() {
    const { loading, error } = this.state

    if (loading) {
      return <Loading />
    }

    if (error) {
      return (
        <Alert bsStyle="danger">
          <p>Error fetching status dta: {error}.</p>
          <p>
            <Button bsStyle="info" onClick={() => this.fetch()}>
              Try again
            </Button>
          </p>
        </Alert>
      )
    }

    return this.renderContent()
  }

  render() {
    return (
      <ContentWrapper>
        <PageHeader>Ghost Content</PageHeader>
        {this.renderBody()}

        <Modal show={this.state.showAbout} onHide={this.hideAbout}>
          <Modal.Header closeButton>
            <Modal.Title>Ghost Content</Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <About />
          </Modal.Body>
          <Modal.Footer>
            <Button onClick={this.hideAbout}>Close</Button>
          </Modal.Footer>
        </Modal>
      </ContentWrapper>
    )
  }
}
