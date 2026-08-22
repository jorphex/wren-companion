const { preferredTabSession } = require('./tab-session-state')

async function activeTabSession(browserApi, port, pageSessions) {
  delete port.frameTabId
  delete port.frameOrigin

  let tabs
  try {
    tabs = await browserApi.tabs.query({ active: true, currentWindow: true })
  } catch {
    return
  }

  const [tab] = tabs
  if (!Number.isInteger(tab?.id) || typeof tab.url !== 'string') return
  let origin
  try {
    origin = new URL(tab.url).origin
  } catch {
    return
  }
  port.frameTabId = tab.id
  port.frameOrigin = origin
  return preferredTabSession(pageSessions, tab.id, origin)
}

module.exports = { activeTabSession }
