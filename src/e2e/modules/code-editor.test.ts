import { clickOn } from '../expectPuppeteer'
import {
  autoAnswerDialog,
  clickOnTreeNode,
  expectBotApiCallSuccess,
  gotoStudio,
  triggerKeyboardShortcut,
  waitForBotApiResponse,
  getTime
} from '../utils'

const waitForFilesToLoad = async () =>
  await page.waitForFunction(`document.querySelectorAll(".bp3-icon-document").length > 0`)

describe('Module - Code Editor', () => {
  beforeAll(async () => {
    if (!page.url().includes('studio')) {
      await gotoStudio()
    }
  })

  it('Load Code Editor', async () => {
    await clickOn('#bp-menu_code-editor')
    await expectBotApiCallSuccess('mod/code-editor/files')
  })

  it('Create new action', async () => {
    console.log(`${getTime()} Create new action: answering dialog`)
    autoAnswerDialog('hello')
    console.log(`${getTime()} Create new action: btn-add-action`)
    await clickOn('#btn-add-action')
    console.log(`${getTime()} Create new action: btn-add-action-bot`)
    await clickOn('#btn-add-action-bot')

    console.log(`${getTime()} Create new action: focus monaco-editor`)
    await page.focus('#monaco-editor')
    console.log(`${getTime()} Create new action: click`)
    await page.mouse.click(469, 297)
    console.log(`${getTime()} Create new action: wait for 500`)
    await page.waitFor(500) // Required so the editor is correctly focused at the right place
    console.log(`${getTime()} Create new action: type hi`)
    await page.keyboard.type(`const lol = 'hi' //`)

    console.log(`${getTime()} Create new action: keys`)
    await Promise.all([
      expectBotApiCallSuccess('mod/code-editor/save', 'POST'),
      expectBotApiCallSuccess('mod/code-editor/files', 'GET'),
      triggerKeyboardShortcut('KeyS', true)
    ])
  })

  it('Duplicate action', async () => {
    await waitForFilesToLoad()
    await clickOnTreeNode('hello.js', 'right')
    await clickOn('#btn-duplicate')

    await expectBotApiCallSuccess('mod/code-editor/save', 'POST')
  })

  it('Disable file', async () => {
    await waitForFilesToLoad()
    await clickOnTreeNode('hello_copy.js', 'right')
    await clickOn('#btn-disable')

    await expectBotApiCallSuccess('mod/code-editor/rename', 'POST')
    const response = await waitForBotApiResponse('mod/code-editor/files')
    const disabledFile = response.actionsBot.find(x => x.name === '.hello_copy.js')
    expect(disabledFile).toBeDefined()
  })

  it('Delete file', async () => {
    await waitForFilesToLoad()
    autoAnswerDialog()
    await clickOnTreeNode('.hello_copy.js', 'right')
    await clickOn('#btn-delete')

    await expectBotApiCallSuccess('mod/code-editor/remove', 'POST')
    const response = await waitForBotApiResponse('mod/code-editor/files')
    expect(response.actionsBot.find(x => x.name === '.hello_copy.js')).toBeUndefined()
  })
})
