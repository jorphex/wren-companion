const assert = require('node:assert/strict')
const test = require('node:test')

const { PageSession, derivePageOwner } = require('../src/page-session')

class ListenerSet {
  constructor() {
    this.listeners = new Set()
  }

  addListener(listener) {
    this.listeners.add(listener)
  }

  removeListener(listener) {
    this.listeners.delete(listener)
  }

  emit(value) {
    for (const listener of [...this.listeners]) listener(value)
  }
}

class FakePort {
  constructor() {
    this.onMessage = new ListenerSet()
    this.onDisconnect = new ListenerSet()
    this.messages = []
  }

  postMessage(message) {
    this.messages.push(message)
  }
}

class FakeSocket {
  constructor() {
    this.readyState = 0
    this.bufferedAmount = 0
    this.listeners = new Map()
    this.sent = []
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, [])
    this.listeners.get(type).push(listener)
  }

  emit(type, value = {}) {
    for (const listener of this.listeners.get(type) || []) listener(value)
  }

  open() {
    this.readyState = 1
    this.emit('open')
  }

  send(message) {
    if (this.failSend) throw new Error('send failed')
    this.sent.push(message)
  }

  close(code, reason) {
    this.closeArgs = [code, reason]
    this.readyState = 3
    this.emit('close')
  }
}

function request(id = 1, method = 'eth_chainId') {
  return { type: 'rpc', payload: { jsonrpc: '2.0', id, method, params: [] } }
}

function setup(owner = { tabId: 1, frameId: 0, origin: 'https://example.test' }) {
  const port = new FakePort()
  const sockets = []
  let sequence = 0
  const session = new PageSession({
    port,
    owner,
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    randomId: () => `id-${++sequence}`
  })
  return { port, session, sockets }
}

test('derives a canonical owner only from supported browser sender metadata', () => {
  assert.deepEqual(
    derivePageOwner({
      tab: { id: 7 },
      frameId: 2,
      documentId: 'document-1',
      origin: 'https://example.test',
      url: 'HTTPS://Example.TEST:443/path?query=1'
    }),
    {
      tabId: 7,
      frameId: 2,
      documentId: 'document-1',
      origin: 'https://example.test'
    }
  )
  assert.deepEqual(
    derivePageOwner({ tab: { id: 8 }, frameId: 0, url: 'https://firefox.test/path' }),
    { tabId: 8, frameId: 0, origin: 'https://firefox.test' }
  )

  for (const sender of [
    undefined,
    {},
    { tab: { id: -1 }, frameId: 0, url: 'https://example.test' },
    { tab: { id: 1 }, frameId: -1, url: 'https://example.test' },
    { tab: { id: 1 }, frameId: 0, url: 'file:///tmp/test.html' },
    { tab: { id: 1 }, frameId: 0, url: 'chrome://settings' },
    {
      tab: { id: 1 },
      frameId: 0,
      origin: 'null',
      url: 'https://example.test/sandboxed'
    },
    {
      tab: { id: 1 },
      frameId: 0,
      origin: 'https://attacker.test',
      url: 'https://example.test'
    },
    { tab: { id: 1 }, frameId: 0, url: 'not a url' }
  ]) {
    assert.equal(derivePageOwner(sender), undefined)
  }
})

test('queues requests until open and supplies trusted origin metadata', () => {
  const { port, sockets } = setup()
  port.onMessage.emit(request())

  assert.equal(sockets.length, 1)
  assert.equal(sockets[0].sent.length, 0)
  sockets[0].open()

  assert.deepEqual(JSON.parse(sockets[0].sent[0]), {
    jsonrpc: '2.0',
    id: 'frame-page:id-1',
    method: 'eth_chainId',
    params: [],
    __frameOrigin: 'https://example.test'
  })
  assert.deepEqual(port.messages[0], { type: 'transport', connected: true })
})

test('opens lazily when a dapp waits for the provider connect event', () => {
  const { port, sockets } = setup()
  port.onMessage.emit({ type: 'connect' })

  assert.equal(sockets.length, 1)
  sockets[0].open()
  assert.deepEqual(port.messages, [{ type: 'transport', connected: true }])
  assert.deepEqual(sockets[0].sent, [])
})

test('waits for companion authentication before opening and resumes explicitly', () => {
  const port = new FakePort()
  const sockets = []
  let ready = false
  const session = new PageSession({
    port,
    owner: { tabId: 1, frameId: 0, origin: 'https://example.test' },
    socketReady: () => ready,
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    }
  })

  port.onMessage.emit(request())
  assert.equal(sockets.length, 0)
  assert.equal(session.queue.length, 1)

  ready = true
  session.resumeTransport()
  assert.equal(sockets.length, 1)
  sockets[0].open()
  assert.equal(sockets[0].sent.length, 1)
})

test('resets authenticated transport and rejects owned pending work', () => {
  const { port, session, sockets } = setup()
  port.onMessage.emit(request(12))
  sockets[0].open()

  session.resetTransport()

  assert.deepEqual(sockets[0].closeArgs, [1000, 'Companion authentication reset'])
  assert.equal(session.socket, undefined)
  assert.equal(port.messages.at(-1).payload.error.code, 4900)
})

test('marks only chain identity requests as extension connection traffic', () => {
  const { port, sockets } = setup()
  port.onMessage.emit({
    type: 'connection',
    payload: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
  })
  sockets[0].open()
  assert.equal(JSON.parse(sockets[0].sent[0]).__extensionConnecting, true)

  port.onMessage.emit({
    type: 'connection',
    payload: { jsonrpc: '2.0', id: 2, method: 'eth_accounts', params: [] }
  })
  assert.equal(port.messages.at(-1).payload.error.code, -32600)
  assert.equal(sockets[0].sent.length, 1)
})

test('confirms the page after its first successful RPC and tracks chain identity', () => {
  const states = []
  const port = new FakePort()
  const sockets = []
  let sequence = 0
  const session = new PageSession({
    port,
    owner: { tabId: 1, frameId: 0, origin: 'https://example.test' },
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    randomId: () => `id-${++sequence}`,
    onStateChange: (changed) =>
      states.push({ confirmed: changed.pageConnectionConfirmed, chainId: changed.currentChain })
  })

  port.onMessage.emit({
    type: 'connection',
    payload: { jsonrpc: '2.0', id: 1, method: 'net_version', params: [] }
  })
  port.onMessage.emit({
    type: 'connection',
    payload: { jsonrpc: '2.0', id: 2, method: 'eth_chainId', params: [] }
  })
  sockets[0].open()
  const [networkRequest, chainRequest] = sockets[0].sent.map((value) => JSON.parse(value))

  sockets[0].emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: networkRequest.id, result: '8453' })
  })
  assert.equal(session.pageConnectionConfirmed, true)
  assert.equal(session.currentChain, '')
  sockets[0].emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: chainRequest.id, result: '0x2105' })
  })

  assert.equal(session.pageConnectionConfirmed, true)
  assert.equal(session.currentChain, '0x2105')
  assert.deepEqual(states.at(-1), { confirmed: true, chainId: '0x2105' })

  sockets[0].close(1006, 'lost')
  assert.equal(session.pageConnectionConfirmed, false)
  assert.equal(session.currentChain, '')
})

test('popup control queries make the tab ready without impersonating page activity', async () => {
  const { session, sockets } = setup()
  const result = session.requestControl('eth_chainId', [], true)
  sockets[0].open()
  const load = JSON.parse(sockets[0].sent[0])
  sockets[0].emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: load.id, result: '0x1' })
  })

  assert.equal(await result, '0x1')
  assert.equal(session.pageConnectionConfirmed, false)
  assert.equal(session.currentChain, '0x1')
})

test('returns a response only through the owning document port', () => {
  const first = setup({ tabId: 1, frameId: 0, origin: 'https://one.test' })
  const second = setup({ tabId: 1, frameId: 2, origin: 'https://two.test' })
  first.port.onMessage.emit(request(7))
  second.port.onMessage.emit(request(7))
  first.sockets[0].open()
  second.sockets[0].open()
  const firstTransportId = JSON.parse(first.sockets[0].sent[0]).id

  first.sockets[0].emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: firstTransportId, result: '0x1' })
  })

  assert.deepEqual(first.port.messages.at(-1), {
    type: 'rpc',
    payload: { jsonrpc: '2.0', id: 7, result: '0x1' }
  })
  assert.equal(second.port.messages.filter(({ type }) => type === 'rpc').length, 0)
})

test('closes the exact socket when its browser document disconnects', () => {
  const { port, session, sockets } = setup()
  port.onMessage.emit(request())
  sockets[0].open()
  port.onDisconnect.emit()

  assert.equal(session.closed, true)
  assert.deepEqual(sockets[0].closeArgs, [1000, 'Page disconnected'])
  assert.equal(port.onMessage.listeners.size, 0)
})

test('rejects pending requests and reconnects after a transport close', () => {
  const timers = []
  const port = new FakePort()
  const sockets = []
  new PageSession({
    port,
    owner: { tabId: 1, frameId: 0, origin: 'https://example.test' },
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    setTimer: (callback, delay) => {
      timers.push({ callback, delay })
      return timers.length
    },
    clearTimer: () => {}
  })

  port.onMessage.emit(request())
  sockets[0].open()
  sockets[0].close(1006, 'lost')

  assert.deepEqual(port.messages.at(-1), {
    type: 'rpc',
    payload: {
      jsonrpc: '2.0',
      id: 1,
      error: { code: 4900, message: 'Wren disconnected' }
    }
  })
  assert.equal(timers[0].delay, 250)
  timers[0].callback()
  assert.equal(sockets.length, 2)
})

test('keeps trusted control responses out of the page channel', async () => {
  const { port, session, sockets } = setup()
  const result = session.requestControl('eth_chainId', [], true)
  sockets[0].open()
  const load = JSON.parse(sockets[0].sent[0])

  assert.equal(load.__extensionConnecting, true)
  assert.match(load.id, /^frame-control:/u)
  sockets[0].emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: load.id, result: '0xa' })
  })

  assert.equal(await result, '0xa')
  assert.equal(port.messages.filter(({ type }) => type === 'rpc').length, 0)
})

test('removes a timed-out control request from the connection queue', async () => {
  const timers = []
  const port = new FakePort()
  const session = new PageSession({
    port,
    owner: { tabId: 1, frameId: 0, origin: 'https://example.test' },
    createSocket: () => new FakeSocket(),
    setTimer: (callback) => {
      timers.push(callback)
      return timers.length
    },
    clearTimer: () => {}
  })

  const result = session.requestControl('eth_chainId')
  assert.equal(session.queue.length, 1)
  assert.ok(session.queuedBytes > 0)
  timers[0]()

  await assert.rejects(result, (error) => error.code === -32002)
  assert.equal(session.queue.length, 0)
  assert.equal(session.queuedBytes, 0)
})

test('fails closed on malformed desktop messages and duplicate request IDs', () => {
  const { port, sockets } = setup()
  port.onMessage.emit(request(1))
  port.onMessage.emit(request(1))

  assert.equal(port.messages.at(-1).payload.error.code, -32600)
  sockets[0].open()
  sockets[0].emit('message', { data: '{bad json' })
  assert.deepEqual(sockets[0].closeArgs, [1002, 'Invalid Wren response'])
})

test('accounts for aggregate request bytes until a response releases them', () => {
  const port = new FakePort()
  const socket = new FakeSocket()
  const reservations = []
  const releases = []
  let sequence = 0
  new PageSession({
    port,
    owner: { tabId: 1, frameId: 0, origin: 'https://example.test' },
    createSocket: () => socket,
    reserveRequest: (bytes) => reservations.push(bytes) && true,
    releaseRequest: (bytes) => releases.push(bytes),
    randomId: () => `id-${++sequence}`
  })

  port.onMessage.emit(request(8))
  socket.open()
  const transportId = JSON.parse(socket.sent[0]).id
  assert.equal(reservations.length, 1)
  socket.emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: transportId, result: '0x1' })
  })
  assert.deepEqual(releases, reservations)
})

test('closes instead of buffering more than the per-socket byte limit', () => {
  const { port, sockets } = setup()
  port.onMessage.emit(request())
  sockets[0].bufferedAmount = 2 * 1024 * 1024
  sockets[0].open()
  assert.deepEqual(sockets[0].closeArgs, [1013, 'Wren request buffer exceeded'])
})

test('closes and rejects a request when the browser socket send fails', () => {
  const { port, sockets } = setup()
  port.onMessage.emit({ type: 'connect' })
  sockets[0].open()
  sockets[0].failSend = true
  port.onMessage.emit(request(9))

  assert.deepEqual(sockets[0].closeArgs, [1013, 'Wren request buffer exceeded'])
  assert.equal(port.messages.at(-1).payload.error.code, 4900)
})
