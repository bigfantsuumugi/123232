import React, { Component } from 'react'
import CodeMirror from 'react-codemirror'
import _ from 'lodash'

import classnames from 'classnames'

const style = require('./style.scss')

require('codemirror/lib/codemirror.css')
require('codemirror/theme/zenburn.css')
require('codemirror/mode/yaml/yaml')

const LAST_LINE_REGEX = /^(\w.+):/
const REFRESH_INTERVAL = 1000 
const TIME_EDITING = 2000
const ANIM_TIME = 300
const WAIT_TIME = 1500

export default class CodeView extends Component {
  constructor(props) {
    super(props)

    this.state = {
      loading: true,
      lastEditTime: null
    }

    this.timer = null
    this.isEditing = this.isEditing.bind(this)
  }

  componentDidMount() {
    this.setState({
      loading: false
    })

    setTimeout(::this.refreshPositionAdjustments, WAIT_TIME)
    this.timer = setInterval(::this.refreshViewIfNeeded, REFRESH_INTERVAL)
  }

  componentWillUnmount() {
    this.setState({
      loading: true
    })

    clearInterval(this.timer)
  }

  isEditing() {
    if (!this.state.lastEditTime) {
      return false
    }

    const timeSinceLastEdit = Date.now() - this.state.lastEditTime
    return timeSinceLastEdit <= TIME_EDITING
  }

  refreshViewIfNeeded() {
    const codeChanged = !this.isEditing() && this.props.code !== this.state.lastCode

    if (codeChanged || this.props.shouldRefresh) {
      this.props.onLoading && this.props.onLoading()
      
      if (this.props.shouldRefresh) {
        this.props.resetRefresh()
      }
      
      setTimeout(::this.refreshPositionAdjustments, ANIM_TIME)
    }
  }

  refreshPositionAdjustments() {
    const blockDivs = this.getBlockDivs()
    const lastLines = this.getLastLines()
    const lineDivs = this.getLineDivs(lastLines)
    
    this.setHeights(blockDivs, lastLines, lineDivs)
    
    this.setState({
      lastCode: this.props.code
    })

    this.props.onLoaded && this.props.onLoaded()
  }

  getBlockDivs() {
    return document.getElementsByClassName('bp-umm-block')
  }

  getLastLines() {
    const lines = []
    _.forEach(this.props.code.split('\n'), (line, i) => {
      if (LAST_LINE_REGEX.test(line)) {
        const contentNext = line.match(LAST_LINE_REGEX)[1]

        lines.push({ 
          index: i,
          contentNext: contentNext 
        })
      }
    })

    return lines
  }

  getLineDivs(lastLines) {
    const lines = document.getElementsByClassName('CodeMirror-line')
    let beginIndex = 0
    
    const lineDivs = []

    _.forEach(lastLines, (last) => {
      if (last.index !== 0) {
        const index = last.index - 1

        lineDivs.push({
          lastLine: lines[index],
          numberOfRows: index - beginIndex + 1,
          beginIndex: beginIndex,
          endIndex: index
        })

        beginIndex = index + 1
      }
    })

    return lineDivs
  }

  setHeight(line, block, i, rows, lastLines) {
    const rowHeight = 20

    let linesHeight = 0
    for (let k = line.beginIndex; k <= line.endIndex; k++) {
      if (rows[k]) {
        linesHeight += rows[k].clientHeight
      }
    }

    const blockHeight = block.clientHeight

    let numberOfRowToAdd = Math.floor((blockHeight - linesHeight) / rowHeight) + 1

    if (linesHeight <= blockHeight) {
      let toAdd = ""
      
      for (let count = 0; count < numberOfRowToAdd; count++) {
        toAdd += "\n"
      }

      const content = lastLines[i + 1].contentNext
      const code = this.props.code.replace(content, toAdd + content)
      this.props.update(code)
    }

    numberOfRowToAdd = numberOfRowToAdd > 0 ? numberOfRowToAdd : 0
    let marginBottom = linesHeight + (numberOfRowToAdd * rowHeight) - (blockHeight)
    
    if (blockHeight <= 20) {
      marginBottom = 0
    }

    block.setAttribute('style', 'margin-bottom: ' + marginBottom + 'px;')
  }

  setHeights(blockDivs, lastLines, lineDivs) {
    const rows = document.getElementsByClassName('CodeMirror-line')
  
    _.forEach(lineDivs, (line, i) => {

      const block = blockDivs[i]
      
      if (!this.props.error && block) {
        this.setHeight(line, block, i, rows, lastLines)
      }
    })
  }

  handleCodeChanged(event) {
    this.props.update(event)

    this.setState({
      lastEditTime: Date.now()
    })
  }

  renderEditor() {
    const classNames = classnames({
      [style.editor]: true,
      'bp-umm-editor': true
    })

    const options = {
      theme: 'zenburn',
      mode: 'yaml',
      lineNumbers: true,
      lineWrapping: true,
      scrollbarStyle: null,
      indentWithTabs: false,
      tabSize: 2,
      indentUnit: 2,
      smartIndent: true,
      extraKeys: {
        Tab: function(cm) {
          var spaces = Array(cm.getOption("indentUnit") + 1).join(" ")
          cm.replaceSelection(spaces)
        }
      },
      addons: [
        require('codemirror/addon/search/searchcursor')
      ]
    }

    return <CodeMirror 
      className={classNames}
      value={this.props.code}
      onChange={::this.handleCodeChanged}
      options={options} />
  }

  render() {
    if (this.state.loading) {
      return null
    }

    const classNames = classnames({
      [style.code]: true,
      'bp-umm-code': true
    })

    return <div className={classNames}>
        {this.renderEditor()}
      </div>
  }
}

