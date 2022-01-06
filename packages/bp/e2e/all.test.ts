import { Page } from 'puppeteer'

import { bpConfig } from './assets/config'
import { getPage, waitForHost } from './utils'

const test = {
  auth: './admin/auth.test',
  login: './admin/login.test',
  logout: './admin/logout.test',
  admin: {
    ui: './admin/ui.test',
    bots: './admin/bots.test',
    users: './admin/users.test'
  },
  studio: {
    ui: './studio/ui.test',
    flows: './studio/flows.test',
    cms: './studio/cms.test',
    nlu: './studio/nlu.test',
    qna: './studio/qna.test'
  },
  mod: {
    editor: './modules/code-editor.test',
    testing: './modules/testing.test',
    webchat: './modules/webchat.test'
  }
}

const admin = [test.admin.ui, test.admin.bots]
if (process.env.PRO_ENABLED) {
  admin.push(test.admin.users)
}

const studio = [test.studio.ui, test.studio.flows, test.studio.cms, test.studio.nlu]
const modules = [/*test.mod.qna*,*/ test.mod.editor, test.mod.testing, test.mod.webchat]

/** Define test pipelines below */
const allTests = [test.auth, test.login, ...admin, ...studio, ...modules, test.logout]
const studioTests = [test.login, ...studio, test.logout]
const adminTests = [test.login, ...admin, test.logout]

// Custom pipeline when testing a  specific part
const customTest = [test.auth, test.login, ...admin, test.logout]

describe('E2E Tests', () => {
  let page: Page

  beforeAll(async () => {
    await waitForHost(bpConfig.host)

    page = await getPage()
    await page.goto(bpConfig.host)
    await page.evaluate(() => {
      window.localStorage.setItem('guidedTour11_9_0', 'true')
    })
  })

  // TODO: Change me. For test purpose only
  // Change this to test a different pipeline
  studioTests.map(x => require(x))
})
