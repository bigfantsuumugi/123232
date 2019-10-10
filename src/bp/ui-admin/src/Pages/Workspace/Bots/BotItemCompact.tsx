import {
  AnchorButton,
  Button,
  Icon,
  Intent,
  Menu,
  MenuItem,
  Popover,
  PopoverInteractionKind,
  Position,
  Tag,
  Tooltip
} from '@blueprintjs/core'
import { BotConfig } from 'botpress/sdk'
import React, { FC } from 'react'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import history from '~/history'
import { toastInfo } from '~/utils/toaster'

import AccessControl, { isChatUser } from '../../../App/AccessControl'

interface Props {
  bot: BotConfig
  deleteBot?: () => void
  exportBot?: () => void
  createRevision?: () => void
  rollback?: () => void
}

const BotItemCompact: FC<Props> = ({ bot, deleteBot, exportBot, createRevision, rollback }) => {
  const botShortLink = `${window.location.origin + window['ROOT_PATH']}/s/${bot.id}`
  const botStudioLink = isChatUser() ? botShortLink : `studio/${bot.id}`

  return (
    <div className="bp_table-row" key={bot.id}>
      <div className="actions">
        <AccessControl resource="admin.bots.*" operation="write">
          <Button
            text="Config"
            icon="cog"
            minimal={true}
            className="configBtn"
            onClick={() => history.push(`/bot/${bot.id}/details`)}
          />
        </AccessControl>

        {!bot.disabled && (
          <AnchorButton text="Open chat" icon="chat" href={botShortLink} target="_blank" minimal={true} />
        )}

        <AccessControl resource="admin.bots.*" operation="read">
          <Popover minimal position={Position.BOTTOM} interactionKind={PopoverInteractionKind.HOVER}>
            <Button id="btn-menu" icon={<Icon icon="menu" />} minimal={true} />
            <Menu>
              {!bot.disabled && (
                <MenuItem disabled={bot.locked} icon="edit" text="Edit in Studio" href={botStudioLink} />
              )}

              <CopyToClipboard text={botShortLink} onCopy={() => toastInfo('Copied to clipboard')}>
                <MenuItem icon="link" text="Copy link to clipboard" />
              </CopyToClipboard>

              <AccessControl resource="admin.bots.*" operation="write">
                <MenuItem text="Create Revision" icon="cloud-upload" id="btn-createRevision" onClick={createRevision} />
                <MenuItem text="Rollback" icon="undo" id="btn-rollbackRevision" onClick={rollback} />
                <MenuItem text="Export" icon="export" id="btn-export" onClick={exportBot} />
                <MenuItem text="Delete" icon="trash" id="btn-delete" onClick={deleteBot} />
              </AccessControl>
            </Menu>
          </Popover>
        </AccessControl>
      </div>

      <div className="title">
        {bot.locked && (
          <span>
            <Icon icon="lock" intent={Intent.PRIMARY} iconSize={13} />
            &nbsp;
          </span>
        )}
        {bot.disabled ? <span>{bot.name || bot.id}</span> : <a href={botStudioLink}>{bot.name || bot.id}</a>}

        {!bot.defaultLanguage && (
          <Tooltip position="right" content="Bot language is missing. Please set it in bot config.">
            <Icon icon="warning-sign" intent={Intent.DANGER} style={{ marginLeft: 10 }} />
          </Tooltip>
        )}

        {bot.disabled && (
          <Tag intent={Intent.WARNING} className="botbadge">
            disabled
          </Tag>
        )}
        {bot.private && (
          <Tag intent={Intent.PRIMARY} className="botbadge">
            private
          </Tag>
        )}
      </div>
      <p>{bot.description}</p>
    </div>
  )
}

export default BotItemCompact
