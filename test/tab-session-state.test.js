const assert = require('node:assert/strict')
const test = require('node:test')

const { tabSessionState } = require('../src/tab-session-state')

const session = (frameId, update = {}) => ({
  owner: { tabId: 7, frameId, origin: 'https://basescan.org' },
  closed: false,
  connected: false,
  pageConnectionConfirmed: false,
  currentChain: '',
  ...update
})

test('a same-origin iframe cannot downgrade a usable top-frame session', () => {
  const sessions = new Set([session(0, { connected: true, currentChain: '0x2105' }), session(2)])

  assert.deepEqual(tabSessionState(sessions, 7, 'https://basescan.org'), {
    chain: '0x2105',
    status: 'ready'
  })
})

test('a confirmed same-origin contract iframe confirms the tab connection', () => {
  const sessions = new Set([
    session(0, { connected: true, currentChain: '0x2105' }),
    session(2, {
      connected: true,
      pageConnectionConfirmed: true,
      currentChain: '0x2105'
    })
  ])

  assert.deepEqual(tabSessionState(sessions, 7, 'https://basescan.org'), {
    chain: '0x2105',
    status: 'connected'
  })
})

test('ignores sessions from other tabs and origins', () => {
  assert.equal(
    tabSessionState(
      new Set([
        session(0, { owner: { tabId: 8, frameId: 0, origin: 'https://basescan.org' } }),
        session(0, { owner: { tabId: 7, frameId: 0, origin: 'https://example.test' } })
      ]),
      7,
      'https://basescan.org'
    ),
    undefined
  )
})
