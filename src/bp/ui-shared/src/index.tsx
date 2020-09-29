import MoreOptions from '../../ui-shared-lite/MoreOptions'
import Overlay from '../../ui-shared-lite/Overlay'
import ToolTip from '../../ui-shared-lite/ToolTip'

import style from './style.scss'
import { sendTelemetry, startFallback } from './telemetry'
import { defaultLocale, lang, langAvaibale, langExtend, langInit, langLocale } from './translations'
import { isInputFocused } from './utils/inputs'
import { controlKey, keyMap } from './utils/keyboardShortcuts'
import { Commander } from './Commander'
import confirmDialog from './ConfirmDialog'
import Contents from './Contents'
import contextMenu from './ContextMenu'
import { Body, Footer, Wrapper } from './Dialog'
import Dropdown from './Dropdown'
import EmptyState from './EmptyState'
import FormFields from './FormFields'
import Icons from './Icons'
import MainContainer from './MainContainer'
import MainContent from './MainContent'
import MarkdownContent from './MarkdownContent'
import MultiLevelDropdown from './MultiLevelDropdown'
import ShortcutLabel from './ShortcutLabel'
import Textarea from './Textarea'
import { toast } from './Toaster'
import TreeView from './TreeView'

exports.Commander = Commander
exports.Dialog = { Wrapper, Footer, Body }
exports.Dropdown = Dropdown
exports.EmptyState = EmptyState
exports.MainContainer = MainContainer
exports.Contents = Contents
exports.FormFields = FormFields
exports.MainContent = MainContent
exports.MarkdownContent = MarkdownContent
exports.MoreOptions = MoreOptions
exports.MultiLevelDropdown = MultiLevelDropdown
exports.Overlay = Overlay
exports.ShortcutLabel = ShortcutLabel
exports.Textarea = Textarea
exports.ToolTip = ToolTip
exports.TreeView = TreeView
exports.Icons = Icons
exports.sharedStyle = style

exports.contextMenu = contextMenu
exports.confirmDialog = confirmDialog
exports.lang = {
  tr: lang,
  init: langInit,
  extend: langExtend,
  getLocale: langLocale,
  getAvailable: langAvaibale,
  defaultLocale
}
exports.toast = toast
exports.utils = { controlKey, keyMap, isInputFocused }
exports.telemetry = {
  startFallback,
  sendTelemetry
}
