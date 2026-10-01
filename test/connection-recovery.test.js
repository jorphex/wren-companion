const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const FrameProvider = require('../src/provider')
const { PageConnection } = require('../src/page-connection')
const { PageSession } = require('../src/page-session')

const flush = () => new Promise((resolve) => setImmediate(resolve))

function attachContentBridge(connection, session, deliver) {
  const listeners = []
  const runtimePort = {
    onMessage: { addListener: (listener) => listeners.push(listener) },
    onDisconnect: { addListener() {} },
    postMessage: (message) => deliver(() => session.handlePortMessage(message), message)
  }
  const window = {
    location: { origin: 'https://recovery.example' },
    setTimeout,
    addEventListener() {},
    postMessage: (_message, _origin, ports) => connection.attach(ports[0])
  }
  window.top = window
  const script = { dataset: {}, remove() {} }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/inject.js'), 'utf8'), {
    require: (name) => require(path.join(__dirname, '../src', name)),
    window,
    document: { createElement: () => script, head: { appendChild: () => script.onload() } },
    chrome: {
      runtime: {
        id: 'qualification',
        getURL: (name) => name,
        connect: () => runtimePort,
        onMessage: { addListener() {} }
      }
    },
    crypto: globalThis.crypto,
    localStorage: {},
    setTimeout,
    clearTimeout,
    MessageChannel: class {
      constructor() {
        this.port1 = {
          start() {},
          close() {},
          postMessage: (data) => this.port2.onmessage?.({ data })
        }
        this.port2 = {
          start() {},
          close() {},
          postMessage: (data) => this.port1.onmessage?.({ data })
        }
      }
    }
  })
  return (message) => listeners.forEach((listener) => listener(message))
}

function connectionHarness(withProvider = true, deliver = (callback) => callback()) {
  const connection = new PageConnection()
  const requests = []
  const reservations = []
  const releases = []
  let postToPage = (message) => connection.handleMessage(message)
  let sequence = 0
  const socket = {
    readyState: 1,
    bufferedAmount: 0,
    send(serialized) {
      requests.push(JSON.parse(serialized))
    }
  }
  const session = new PageSession({
    port: {
      onMessage: { addListener() {}, removeListener() {} },
      onDisconnect: { addListener() {}, removeListener() {} },
      postMessage: (message) => postToPage(message)
    },
    owner: { tabId: 1, frameId: 0, origin: 'https://recovery.example' },
    createSocket: () => {
      throw new Error('Unexpected socket creation')
    },
    reserveRequest: (bytes) => {
      reservations.push(bytes)
      return true
    },
    releaseRequest: (bytes) => releases.push(bytes),
    randomId: () => `recovery-${++sequence}`
  })
  session.socket = socket
  if (withProvider) postToPage = attachContentBridge(connection, session, deliver)
  else {
    connection.attach({
      postMessage: (message) => deliver(() => session.handlePortMessage(message), message),
      close() {}
    })
  }
  const provider = withProvider ? new FrameProvider(connection) : undefined
  const reply = (request, result) =>
    session.handleSocketMessage(socket, {
      data: JSON.stringify({ id: request.id, jsonrpc: '2.0', result })
    })
  return { connection, provider, session, socket, requests, reservations, releases, reply }
}

test('recovers after 40 silent handshakes without leaking background capacity', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  const harness = connectionHarness()
  const { connection, provider, session, requests, reservations, releases, reply } = harness
  try {
    connection.handleMessage({ type: 'transport', connected: true })
    for (let attempt = 0; attempt < 40; attempt++) {
      context.mock.timers.tick(3000)
      await flush()
      if (attempt < 39) {
        context.mock.timers.tick(250)
        await flush()
      }
    }
    assert.equal(requests.length, 80)
    assert.equal(session.pending.size, 0)
    assert.equal(session.pageIds.size, 0)
    assert.equal(provider.pending.size, 0)
    assert.equal(reservations.length, releases.length)
    context.mock.timers.tick(250)
    await flush()
    const [network, chain] = requests.slice(-2)
    reply(network, '4663')
    reply(chain, '0x1237')
    await flush()
    assert.equal(provider.connected, true)
    assert.equal(provider.chainId, '0x1237')
    reply(requests[1], '0x1')
    assert.equal(provider.chainId, '0x1237')
    assert.equal(session.pending.size, 0)
    assert.equal(reservations.length, releases.length)
  } finally {
    provider.close()
  }
})

test('a late failed-handshake reply cannot change the page or Companion chain', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { connection, provider, session, socket, requests, reservations, releases, reply } =
    connectionHarness()
  try {
    connection.handleMessage({ type: 'transport', connected: true })
    const [failed, stale] = requests.slice()
    session.handleSocketMessage(socket, {
      data: JSON.stringify({
        id: failed.id,
        jsonrpc: '2.0',
        error: { code: 4900, message: 'Temporary failure' }
      })
    })
    await flush()
    context.mock.timers.tick(250)
    const [network, chain] = requests.slice(-2)
    reply(network, '4663')
    reply(chain, '0x1237')
    await flush()
    reply(stale, '0x1')
    assert.equal(provider.chainId, '0x1237')
    assert.equal(session.currentChain, '0x1237')
    assert.equal(session.pending.size, 0)
    assert.equal(reservations.length, releases.length)
  } finally {
    provider.close()
  }
})

test('expires queued identity reads without expiring an interactive approval', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { session, socket, requests, reservations, releases, reply } = connectionHarness(false)
  try {
    socket.readyState = 0
    session.handlePortMessage({
      type: 'connection',
      payload: { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] }
    })
    session.handlePortMessage({
      type: 'rpc',
      payload: { id: 2, jsonrpc: '2.0', method: 'eth_sendTransaction', params: [{}] }
    })
    assert.equal(session.queue.length, 2)
    context.mock.timers.tick(10_000)
    await flush()
    assert.equal(session.pending.size, 1)
    assert.equal(session.pageIds.size, 1)
    assert.equal(session.queue.length, 1)
    assert.equal(JSON.parse(session.queue[0].serialized).method, 'eth_sendTransaction')
    assert.equal(session.queuedBytes, session.queue[0].bytes)
    assert.equal(releases.length, 1)
    socket.readyState = 1
    session.handleSocketOpen(socket)
    reply(requests[0], '0xabc')
    assert.equal(session.pending.size, 0)
    assert.equal(session.queue.length, 0)
    assert.equal(session.queuedBytes, 0)
    assert.equal(reservations.length, releases.length)
  } finally {
    session.resetTransport()
  }
})

test('releases handshake timers once on response, refusal, or disconnect', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const { session, socket, requests, reservations, releases, reply } = connectionHarness(false)
  const identity = (id) => ({
    type: 'connection',
    payload: { id, jsonrpc: '2.0', method: 'eth_chainId', params: [] }
  })
  try {
    session.handlePortMessage(identity(1))
    reply(requests[0], '0x1')
    session.handlePortMessage(identity(2))
    session.handlePortMessage(identity(3))
    session.resetTransport()
    assert.equal(reservations.length, releases.length)
    session.socket = socket
    socket.readyState = 0
    for (let id = 4; id < 64; id++) {
      session.handlePortMessage({
        type: 'rpc',
        payload: { id, jsonrpc: '2.0', method: 'eth_accounts', params: [] }
      })
    }
    for (let control = 0; control < 4; control++) {
      session.requestControl('eth_chainId').catch(() => {})
    }
    assert.equal(session.queue.length, 64)
    session.handlePortMessage(identity(100))
    session.resetTransport()
    const released = releases.length
    context.mock.timers.tick(10_000)
    await flush()
    assert.equal(session.pending.size, 0)
    assert.equal(releases.length, released)
    assert.equal(reservations.length, releases.length)
  } finally {
    session.resetTransport()
  }
})

for (const oldEvent of ['timeout', 'success', 'error']) {
  test(`an old ${oldEvent} cannot affect a retry after delayed delivery`, async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
    let deliveries = 0
    const { connection, provider, session, socket, requests, reservations, releases, reply } =
      connectionHarness(true, (callback) => setTimeout(callback, ++deliveries <= 2 ? 400 : 0))
    try {
      connection.handleMessage({ type: 'transport', connected: true })
      context.mock.timers.tick(400)
      await flush()
      const old = requests.slice()
      context.mock.timers.tick(2600)
      await flush()
      context.mock.timers.tick(250)
      await flush()
      context.mock.timers.tick(0)
      await flush()
      const [network, chain] = requests.slice(-2)
      for (const request of requests) assert.equal(Object.hasOwn(request, 'generation'), false)
      if (oldEvent === 'timeout') {
        context.mock.timers.tick(150)
        await flush()
        assert.equal(provider.pending.size, 2)
      } else {
        if (oldEvent === 'success') {
          reply(network, '4663')
          reply(chain, '0x1237')
          await flush()
        }
        context.mock.timers.tick(50)
        if (oldEvent === 'success') reply(old[1], '0x1')
        else {
          session.handleSocketMessage(socket, {
            data: JSON.stringify({
              id: old[0].id,
              jsonrpc: '2.0',
              error: { code: 4900, message: 'Old attempt failed' }
            })
          })
          await flush()
          assert.equal(provider.pending.size, 2)
        }
      }
      reply(network, '4663')
      reply(chain, '0x1237')
      await flush()
      assert.equal(provider.connected, true)
      assert.equal(provider.chainId, '0x1237')
      assert.equal(session.currentChain, '0x1237')
      assert.equal(session.pending.size, 0)
      assert.equal(reservations.length, releases.length)
    } finally {
      provider.close()
    }
  })
}

test('rejects stale or invalid attempts without disturbing the current pair', () => {
  const { session, requests, reservations, releases, reply } = connectionHarness(false)
  const identity = (id, generation, method = 'net_version', type = 'connection') => ({
    type,
    generation,
    payload: { id, jsonrpc: '2.0', method, params: [] }
  })
  try {
    session.handlePortMessage(identity(1, 2))
    session.handlePortMessage(identity(2, 2, 'eth_chainId'))
    session.handlePortMessage(identity(3, 1))
    for (const invalid of [0, -1, 1.5, NaN, Infinity, '3', null]) {
      session.handlePortMessage(identity(4, invalid))
    }
    session.handlePortMessage(identity(5, 3, 'eth_chainId', 'rpc'))
    assert.equal(requests.length, 2)
    assert.equal(session.pending.size, 2)
    reply(requests[0], '4663')
    reply(requests[1], '0x1237')
    assert.equal(session.currentChain, '0x1237')
    assert.equal(reservations.length, releases.length)
  } finally {
    session.resetTransport()
  }
})
