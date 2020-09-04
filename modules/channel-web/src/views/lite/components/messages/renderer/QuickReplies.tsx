import React, { Component, Fragment } from 'react'
import { FormattedMessage } from 'react-intl'

import { Renderer } from '../../../typings'
import * as Keyboard from '../../Keyboard'

import { Button } from './Button'

/**
 * Displays an array of button, and handle when they are clicked
 *
 * @param {object} buttons The list of buttons to display (object with a label and a payload)
 * @param {function} onSendData Called with the required payload to answer the quick reply
 * @param {function} onFileUpload This is called when a file is uploaded
 *
 * @return onSendData is called with the reply
 */
export class QuickReplies extends Component<Renderer.QuickReply> {
  handleButtonClicked = (title, payload) => {
    // tslint:disable-next-line: no-floating-promises
    this.props.onSendData?.({
      type: 'quick_reply',
      text: title,
      payload
    })
  }

  renderKeyboard(buttons: Renderer.QuickReplyButton[]) {
    return (
      <div className="bpw-quick_reply-buttons-container">
        {buttons.map((btn, idx) => {
          if (Array.isArray(btn)) {
            return this.renderKeyboard(btn)
          } else {
            return (
              <Button
                key={idx}
                label={(btn.label || btn.title)?.toString()}
                payload={btn.payload}
                preventDoubleClick={!btn.allowMultipleClick}
                onButtonClick={this.handleButtonClicked}
                onFileUpload={this.props.onFileUpload}
              />
            )
          }
        })}
      </div>
    )
  }

  render() {
    const buttons = this.props.buttons || this.props.quick_replies
    const kbd = (
      <div className={'bpw-keyboard-quick_reply'}>
        {buttons && (
          <Fragment>
            <span className="bpw-keyboard-label">
              <FormattedMessage id={'composer.quickReplyLabel'} />
            </span>
            {this.renderKeyboard(buttons)}
          </Fragment>
        )}
      </div>
    )

    return (
      <Keyboard.Prepend keyboard={kbd} visible={this.props.isLastGroup && this.props.isLastOfGroup}>
        {this.props.children}
      </Keyboard.Prepend>
    )
  }
}
