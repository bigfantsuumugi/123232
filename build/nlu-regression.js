var http = require('http')
var fs = require('fs')
const { exit } = require('process')

const repoRootDir = `${__dirname}/..`
const nluTestingDir = `${repoRootDir}/modules/nlu-testing/`

async function post(path, content, headers) {
  var post_options = {
    host: '127.0.0.1',
    port: '3000',
    path,
    method: 'POST',
    headers,
    timeout: 2000
  }

  return new Promise(function(resolve, reject) {
    var post_req = http.request(post_options, function(res) {
      res.setEncoding('utf8')

      let receivedData = ''
      res.on('data', function(chunk) {
        receivedData += chunk
      })
      res.on('error', function(err) {
        reject(err)
      })
      res.on('end', function() {
        resolve(receivedData)
      })
    })

    // post the data
    post_req.write(content)
    post_req.end()
  })
}

async function get(path, headers) {
  var post_options = {
    host: '127.0.0.1',
    port: '3000',
    path,
    method: 'GET',
    headers
  }

  return new Promise(function(resolve, reject) {
    var get_req = http.request(post_options, function(res) {
      res.setEncoding('utf8')

      let receivedData = ''
      res.on('data', function(chunk) {
        receivedData += chunk
      })
      res.on('error', function(err) {
        reject(err)
      })
      res.on('end', function() {
        resolve(receivedData)
      })
    })
    get_req.end()
  })
}

async function login() {
  var data = 'email=admin&password=123456'
  const rawLogin = await post('/api/v1/auth/login/basic/default', data, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data)
  })
  const login = JSON.parse(rawLogin)

  const token = login.payload && login.payload.token
  return login.statusCode ? undefined : token
}

async function signup() {
  var data = 'email=admin&password=123456'
  const rawLogin = await post('/api/v1/auth/register/basic/default', data, {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(data)
  })
  const login = JSON.parse(rawLogin)

  const token = login.payload && login.payload.token
  return login.statusCode ? undefined : token
}

async function createBot(botId, token) {
  const newBot = JSON.stringify({
    id: botId,
    name: 'testy',
    template: {
      id: 'bp-nlu-regression-testing',
      moduleId: 'nlu-testing'
    },
    category: undefined
  })

  await post('/api/v1/admin/bots', newBot, {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(newBot),
    'X-BP-Workspace': 'default'
  })
}

async function waitForTraining(botId, token) {
  return new Promise(function(resolve) {
    var i = 0
    console.log(`training...`)
    const intervalId = setInterval(async () => {
      const raw = await get(`/api/v1/bots/${botId}/mod/nlu/train`, {
        Authorization: `Bearer ${token}`
      })
      const trainingStatus = JSON.parse(raw)
      if (!trainingStatus.isTraining) {
        clearInterval(intervalId)
        resolve()
      } else {
        console.log(`training... ${2 * ++i}s`)
      }
    }, 2000)
  })
}

function round(n, acc) {
  var num = Math.pow(10, acc)
  return Math.round(n * num) / num
}

async function runAllTests(botId, token) {
  const baseNluTesting = `/api/v1/bots/${botId}/mod/nlu-testing`
  const rawTests = await get(`${baseNluTesting}/tests`, {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  })
  const allTests = JSON.parse(rawTests)
  const nTests = allTests.length
  let nPassing = 0

  var i = 0
  for (const test of allTests) {
    const retry = () =>
      post(`${baseNluTesting}/tests/${test.id}/run`, '', {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      })

    let rawResult
    try {
      rawResult = await retry()
    } catch (err) {
      console.error(err, 'retrying')
      rawResult = await retry()
    }

    const testResult = JSON.parse(rawResult)
    nPassing += testResult.success ? 1 : 0
    console.log(`(${i++} /${nTests}) #${test.id}`, 'success: ', testResult.success)
  }

  const acc = (nPassing / nTests) * 100
  return round(acc, 1)
}

async function compareScore(score) {
  const latestResultsFile = `${nluTestingDir}/src/bot-templates/bp-nlu-regression-testing/latest-results.csv`
  const latestResultsContent = fs.readFileSync(latestResultsFile, { encoding: 'utf8' })
  const previousScoreOccurence = latestResultsContent.match(/summary: ((100|\d{1,2})[.]\d{1})?/gm)
  if (!previousScoreOccurence || !previousScoreOccurence[0]) {
    return false
  }

  const previousScoreString = previousScoreOccurence[0].split(':')[1]
  const previousScore = parseFloat(previousScoreString)
  console.log('previous score was: ', previousScore)

  return score >= previousScore
}

async function main() {
  try {
    let token = await login()
    if (!token) {
      token = await signup()
    }
    if (!token) {
      console.error('Unable to login and sign up...')
      exit(1)
    }

    const botId = 'testy'

    await createBot(botId, token)
    await waitForTraining(botId, token)
    console.log('training done!')

    const score = await runAllTests(botId, token)
    console.log('score: ', score)

    const testPasses = await compareScore(score)
    if (!testPasses) {
      console.error('There seems to be a regression on NLU BPDS...')
      exit(1)
    }

    console.log('No regression noted!')
    exit(0)
  } catch (err) {
    console.error(err)
    exit(1)
  }
}
main()
