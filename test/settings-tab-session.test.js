const assert = require('node:assert/strict')
const test = require('node:test')

const { activeTabSession } = require('../src/settings-tab-session')

test('normalizes an active-tab query failure to no settings session', async () => {
  const port = { frameTabId: 3, frameOrigin: 'https://stale.example' }
  const browserApi = {
    tabs: { query: async () => Promise.reject(new Error('tab closed')) }
  }

  assert.equal(await activeTabSession(browserApi, port, new Set()), undefined)
  assert.deepEqual(port, {})
})

test('captures the active origin and returns its preferred session', async () => {
  const port = {}
  const preferred = {
    owner: { tabId: 7, frameId: 0, origin: 'https://example.test' },
    connected: true,
    pageConnectionConfirmed: true
  }
  const browserApi = {
    tabs: { query: async () => [{ id: 7, url: 'https://example.test/path?query=value' }] }
  }

  assert.equal(await activeTabSession(browserApi, port, new Set([preferred])), preferred)
  assert.deepEqual(port, { frameTabId: 7, frameOrigin: 'https://example.test' })
})
