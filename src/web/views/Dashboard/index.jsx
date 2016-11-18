import React from 'react'

import ContentWrapper from '~/components/Layout/ContentWrapper'
import PageHeader from '~/components/Layout/PageHeader'
import {Glyphicon} from 'react-bootstrap'

const style = require('./style.scss')

export default class DashboardView extends React.Component {
  constructor(props, context) {
    super(props, context)
  }

  render() {
    return <ContentWrapper>
      {PageHeader(<span> Dashboard</span>)}
      <h1>Dashboard</h1>
    </ContentWrapper>
  }
}
