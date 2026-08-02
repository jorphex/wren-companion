const assert = require('node:assert/strict')
const test = require('node:test')

const { ControlClient } = require('../src/control-client')

class FakeSocket {
  constructor() {
    this.readyState = 0
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

  send(value) {
    if (this.failSend) throw new Error('send failed')
    this.sent.push(value)
  }

  close(code, reason) {
    this.readyState = 3
    this.closeArgs = [code, reason]
    this.emit('close')
  }
}

function setup() {
  const sockets = []
  const timers = new Map()
  let nextTimer = 1
  const opened = []
  const closed = []
  const client = new ControlClient({
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    onOpen: () => opened.push(true),
    onClose: () => closed.push(true),
    setTimer: (callback, delay) => {
      const id = nextTimer++
      timers.set(id, { callback, delay })
      return id
    },
    clearTimer: (id) => timers.delete(id)
  })
  return { client, closed, opened, sockets, timers }
}

test('connects explicitly and resolves only validated matching responses', async () => {
  const { client, opened, sockets, timers } = setup()
  client.connect()
  sockets[0].open()
  assert.equal(opened.length, 1)

  const response = client.request('wallet_getEthereumChains')
  const request = JSON.parse(sockets[0].sent[0])
  sockets[0].emit('message', {
    data: JSON.stringify({ jsonrpc: '2.0', id: request.id, result: [{ chainId: 1 }] })
  })

  assert.deepEqual(await response, [{ chainId: 1 }])
  assert.equal(timers.size, 0)
})

test('rejects unsupported methods and disconnected requests', async () => {
  const { client } = setup()
  await assert.rejects(client.request('eth_sendTransaction'), (error) => error.code === -32600)
  await assert.rejects(client.request('frame_summon'), (error) => error.code === 4900)
})

test('times out bounded control requests and caps pending work', async () => {
  const { client, sockets, timers } = setup()
  client.connect()
  sockets[0].open()

  const requests = Array.from({ length: 16 }, () => client.request('web3_clientVersion'))
  await assert.rejects(client.request('web3_clientVersion'), (error) => error.code === -32005)

  const firstTimer = [...timers.values()][0]
  firstTimer.callback()
  await assert.rejects(requests[0], (error) => error.code === -32002)

  client.dispose()
  await Promise.all(requests.slice(1).map((request) => assert.rejects(request)))
})

test('closes on malformed responses and schedules a bounded reconnect', async () => {
  const { client, closed, sockets, timers } = setup()
  client.connect()
  sockets[0].open()
  const pending = client.request('web3_clientVersion')
  sockets[0].emit('message', { data: '{bad json' })

  assert.deepEqual(sockets[0].closeArgs, [1002, 'Invalid Frame control response'])
  await assert.rejects(pending, (error) => error.code === 4900)
  assert.equal(closed.length, 1)
  const reconnect = [...timers.values()][0]
  assert.equal(reconnect.delay, 250)
  reconnect.callback()
  assert.equal(sockets.length, 2)
})

test('rejects and reconnects when a browser socket send fails', async () => {
  const { client, sockets, timers } = setup()
  client.connect()
  sockets[0].open()
  sockets[0].failSend = true

  await assert.rejects(client.request('web3_clientVersion'), (error) => error.code === 4900)
  assert.deepEqual(sockets[0].closeArgs, [1011, 'Frame request failed'])
  assert.equal(timers.size, 1)
})

test('restarts immediately with a fresh socket and rejects pending work', async () => {
  const { client, closed, sockets } = setup()
  client.connect()
  sockets[0].open()
  const pending = client.request('web3_clientVersion')

  client.restart()

  await assert.rejects(pending, (error) => error.code === 4900)
  assert.deepEqual(sockets[0].closeArgs, [1000, 'Control connection reset'])
  assert.equal(closed.length, 1)
  assert.equal(sockets.length, 2)
})

test('pauses without reconnecting until explicitly restarted', () => {
  const { client, sockets } = setup()
  client.connect()
  sockets[0].open()

  client.pause()

  assert.deepEqual(sockets[0].closeArgs, [1000, 'Control connection reset'])
  assert.equal(sockets.length, 1)
  client.ping()
  assert.equal(sockets.length, 1)
  client.restart()
  assert.equal(sockets.length, 2)
})

test('keeps sending bounded liveness requests and closes a stalled peer', () => {
  const { client, sockets, timers } = setup()
  client.connect()
  sockets[0].open()

  client.ping()
  client.ping()
  assert.equal(sockets[0].sent.length, 2)
  assert.deepEqual(
    [...timers.values()].map(({ delay }) => delay),
    [25_000, 25_000]
  )

  ;[...timers.values()][0].callback()
  assert.deepEqual(sockets[0].closeArgs, [1011, 'Frame keepalive timed out'])
})
