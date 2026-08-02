const assert = require('node:assert/strict')
const test = require('node:test')

const { PageConnection } = require('../src/page-connection')

class FakeMessagePort {
  constructor() {
    this.messages = []
    this.started = false
    this.closed = false
  }

  postMessage(message) {
    if (this.failPost) throw new Error('closed')
    this.messages.push(message)
  }

  start() {
    this.started = true
  }

  close() {
    this.closed = true
  }

  emit(data) {
    this.onmessage?.({ data })
  }
}

test('queues provider traffic until one document channel attaches', () => {
  const connection = new PageConnection()
  const port = new FakeMessagePort()
  connection.open()
  connection.send({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
  connection.send({ jsonrpc: '2.0', id: 2, method: 'net_version', params: [] }, true)

  assert.equal(connection.attach(port), true)
  assert.equal(connection.attach(new FakeMessagePort()), false)
  assert.equal(port.started, true)
  assert.deepEqual(port.messages, [
    { type: 'connect' },
    {
      type: 'rpc',
      payload: { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }
    },
    {
      type: 'connection',
      payload: { jsonrpc: '2.0', id: 2, method: 'net_version', params: [] }
    }
  ])
})

test('accepts only strict transport and validated RPC messages', () => {
  const connection = new PageConnection()
  const port = new FakeMessagePort()
  const events = []
  connection.on('connect', () => events.push('connect'))
  connection.on('close', () => events.push('close'))
  connection.on('payload', (payload) => events.push(payload))
  connection.attach(port)

  port.emit({ type: 'transport', connected: true })
  port.emit({ type: 'transport', connected: true, injected: true })
  port.emit({ type: 'rpc', payload: { jsonrpc: '2.0', id: 1, result: '0x1' } })
  const circular = {}
  circular.self = circular
  port.emit({ type: 'rpc', payload: circular })
  port.emit({ type: 'rpc', payload: { jsonrpc: '2.0', id: 2, result: '0x2' }, extra: true })
  port.emit({ type: 'transport', connected: false })

  assert.deepEqual(events, ['connect', { jsonrpc: '2.0', id: 1, result: '0x1' }, 'close'])
})

test('bounds pre-attachment traffic and closes after a failed flush', () => {
  const bounded = new PageConnection()
  for (let index = 0; index < 64; index += 1) bounded.open()
  assert.throws(() => bounded.open(), /queue exceeded/u)

  const failed = new PageConnection()
  const port = new FakeMessagePort()
  port.failPost = true
  failed.open()
  assert.equal(failed.attach(port), false)
  assert.equal(port.closed, true)
})
