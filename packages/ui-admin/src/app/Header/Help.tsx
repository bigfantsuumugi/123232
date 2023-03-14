import { Icon, Menu, MenuItem, Popover, Position, Button, Colors, Tooltip } from '@blueprintjs/core'
import { lang } from 'botpress/shared'
import React, { useState } from 'react'
import style from './style.scss'

const FORUM_LINK = 'https://github.com/botpress/botpress/discussions'
const DOCS_LINK = 'https://v12.botpress.com/'

export const HelpMenu = props => {
  const [isHelpPopoverOpen, setHelpPopoverOpen] = useState(false)

  return (
    <div id="help_dropdown">
      <Popover
        content={
          <Menu>
            <MenuItem icon="people" text={lang.tr('forum')} onClick={() => window.open(FORUM_LINK)} />
            <MenuItem icon="book" text={lang.tr('docs')} onClick={() => window.open(DOCS_LINK)} />
          </Menu>
        }
        minimal
        isOpen={isHelpPopoverOpen}
        position={Position.TOP_RIGHT}
        canEscapeKeyClose
        onClose={() => setHelpPopoverOpen(false)}
        fill
        modifiers={{
          preventOverflow: { enabled: true, boundariesElement: 'window' }
        }}
      >
        <Tooltip content={<div className={style.tooltip}>{lang.tr('help')}</div>}>
          <Button onClick={() => setHelpPopoverOpen(!isHelpPopoverOpen)} minimal>
            <Icon color={Colors.BLACK} icon="help" iconSize={16} />
          </Button>
        </Tooltip>
      </Popover>
    </div>
  )
}
