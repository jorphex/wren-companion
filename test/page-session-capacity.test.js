const assert = require('node:assert/strict')
const test = require('node:test')

const {
  evictIdleTopSessions,
  isEvictableIdleTopSession,
  sessionsForTab,
  terminatePageSession
} = require('../src/page-session-capacity')

function session(tabId, frameId = 0, update = {}) {
  return {
    owner: { tabId, frameId },
    closed: false,
    everUsed: false,
    socket: undefined,
    pending: new Map(),
    queue: [],
    close() {
      this.closed = true
    },
    ...update
  }
}

test('evicts an idle top-tab priming port to admit a 257th requesting dapp', () => {
  const sessions = new Set(Array.from({ length: 256 }, (_, index) => session(index + 1)))

  const evicted = evictIdleTopSessions(sessions, {
    tabId: 257,
    maxGlobalSessions: 256,
    maxTabSessions: 8,
    requiredGlobalSlots: 1,
    requiredTabSlots: 1
  })

  assert.equal(evicted.length, 1)
  assert.equal(evicted[0].closed, true)
  assert.equal([...sessions].filter((candidate) => !candidate.closed).length, 255)
})

test('never evicts active sockets, pending work, or frame sessions', () => {
  const active = session(1, 0, { everUsed: true, socket: {} })
  const pending = session(2, 0, { everUsed: true, pending: new Map([['request', {}]]) })
  const frame = session(3, 4)
  const idle = session(4)
  const sessions = new Set([active, pending, frame, idle])

  const evicted = evictIdleTopSessions(sessions, {
    tabId: 5,
    maxGlobalSessions: 4,
    maxTabSessions: 8,
    requiredGlobalSlots: 1,
    requiredTabSlots: 1
  })

  assert.deepEqual(evicted, [idle])
  assert.equal(isEvictableIdleTopSession(active), false)
  assert.equal(isEvictableIdleTopSession(pending), false)
  assert.equal(isEvictableIdleTopSession(frame), false)
  assert.deepEqual(sessionsForTab(sessions, 3), [frame])
})

test('preserves an occupied per-tab cap when no idle top port is available', () => {
  const sessions = new Set(Array.from({ length: 8 }, () => session(7, 0, { everUsed: true })))

  assert.deepEqual(
    evictIdleTopSessions(sessions, {
      tabId: 7,
      maxGlobalSessions: 256,
      maxTabSessions: 8,
      requiredGlobalSlots: 1,
      requiredTabSlots: 1
    }),
    []
  )
  assert.equal(sessionsForTab(sessions, 7).length, 8)
})

test('terminates an evicted browser port instead of leaving a live orphan', () => {
  const messages = []
  let disconnected = false
  const candidate = session(1, 0, {
    safePost(message) {
      messages.push(message)
    },
    port: {
      disconnect() {
        disconnected = true
      }
    }
  })

  terminatePageSession(candidate, (disconnect) => disconnect())

  assert.deepEqual(messages, [{ type: 'fatal' }])
  assert.equal(candidate.closed, true)
  assert.equal(disconnected, true)
})
