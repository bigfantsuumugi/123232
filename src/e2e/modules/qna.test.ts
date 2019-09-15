import path from 'path'

import { clickOn, expectMatch, expectMatchElement, fillField, uploadFile } from '../expectPuppeteer'
import {
  autoAnswerDialog,
  expectBotApiCallSuccess,
  getElementCenter,
  gotoStudio,
  waitForBotApiResponse
} from '../utils'

const getQnaCount = async (): Promise<number> => (await page.$$('div[role="entry"]')).length

describe('Module - QNA', () => {
  beforeAll(async () => {
    if (!page.url().includes('studio')) {
      await gotoStudio()
    }
  })

  it('Load questions', async () => {
    await clickOn('#bp-menu_qna')
    await expectBotApiCallSuccess('mod/qna/questions')
  })

  it('Filter by category', async () => {
    await fillField('#select-category', 'monkey')
    await page.keyboard.press('Enter')
    await expectBotApiCallSuccess('mod/qna/questions?question=&categories[]=monkeys', 'GET')
    await expect(await getQnaCount()).toBe(2)
    await page.keyboard.press('Delete')
  })

  it('Create new entry', async () => {
    await clickOn('#btn-create-qna')
    await expectMatch('Create a new')
    await fillField('#input-questions', 'are you working?')
    await page.keyboard.press('Tab')
    await page.keyboard.type('I sure am!')
    await page.keyboard.press('Enter')
    await clickOn('#btn-submit')
    await expectBotApiCallSuccess('mod/qna/questions', 'POST')
    await expectBotApiCallSuccess('mod/qna/questions', 'GET')
  })

  it('Filter by name', async () => {
    await page.waitFor(300) // Required because the create action clears the filter after it loads new qna
    await fillField('#input-search', 'are you working')
    await expectBotApiCallSuccess('mod/qna/questions', 'GET')
    await expect(await getQnaCount()).toBe(1)
  })

  it('Delete entry', async () => {
    autoAnswerDialog()
    const element = await expectMatchElement('div[role="entry"]', { text: 'are you working' })
    const { x, y } = await getElementCenter(element)
    await page.mouse.move(x, y) // This makes the delete icon visible for the next step

    await clickOn('.icon-delete')
    await expectBotApiCallSuccess('mod/qna/questions')
  })

  it('Export to JSON', async () => {
    await clickOn('#btn-export')
    const response = await waitForBotApiResponse('mod/qna/export')
    expect(response).toBeDefined()
    expect(response.length).toBeGreaterThan(0)
  })

  it('Import from JSON', async () => {
    await clickOn('#btn-import')
    await uploadFile('#input-file', path.join(__dirname, '../assets/qna_22-08-2019.json'))
    await clickOn('#chk-replace')
    await clickOn('#btn-upload')
    await expectBotApiCallSuccess('mod/qna/import', 'POST')
    await expectBotApiCallSuccess('mod/qna/questions', 'GET')
    await page.focus('body') // Sets back the focus to the page when the modal is closed
    await page.waitFor(300)
  })
})
