const URL = require('url').URL

function isBpUrl(str) {
  const re = /^\/api\/.*\/bots\/.*\/media\/.*/

  return re.test(str)
}

function isUrl(str) {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

function formatURL(baseUrl, url) {
  if (isBpUrl(url)) {
    return `${baseUrl}${url}`
  } else {
    return url
  }
}

function extractPayload(type, data) {
  return { type, ..._.omit(data, 'event', 'temp', 'user') }
}

module.exports = {
  formatURL: formatURL,
  isUrl: isUrl,
  extractPayload: extractPayload
}
