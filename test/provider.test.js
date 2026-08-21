const assert = require('node:assert/strict')
const EventEmitter = require('node:events')
const test = require('node:test')

const FrameProvider = require('../src/provider')

class FakeConnection extends EventEmitter {
  constructor() {
    super()
    this.sent = []
    this.openCalls = 0
    this.connectionMessages = []
  }

  send(payload, connectionMessage = false) {
    this.sent.push(payload)
    this.connectionMessages.push(connectionMessage)
  }

  close() {
    this.emit('close')
  }

  open() {
    this.openCalls += 1
  }

  respond(request, result) {
    this.emit('payload', { jsonrpc: '2.0', id: request.id, result })
  }
}

async function connect(provider, connection) {
  const connected = new Promise((resolve) => provider.once('connect', resolve))
  connection.emit('connect')
  const [network, chain] = connection.sent.slice(-2)
  assert.equal(network.method, 'net_version')
  assert.equal(chain.method, 'eth_chainId')
  assert.deepEqual(connection.connectionMessages.slice(-2), [true, true])
  connection.respond(network, '1')
  connection.respond(chain, '0x1')
  return connected
}

async function setupConnected() {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  await connect(provider, connection)
  connection.sent = []
  connection.connectionMessages = []
  return { connection, provider }
}

test('emits EIP-1193 connect only after resolving chain identity', async () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)

  assert.deepEqual(await connect(provider, connection), { chainId: '0x1' })
  assert.equal(provider.isConnected(), true)
  assert.equal(provider.chainId, '0x1')
  assert.equal(provider.networkVersion, '1')
})

test('opens transport when a dapp waits for the connect event', () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  provider.on('connect', () => {})
  assert.equal(connection.openCalls, 1)
})

test('holds ordinary RPC until the chain identity handshake completes', async () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  const result = provider.request({ method: 'eth_accounts' })

  assert.equal(connection.openCalls, 1)
  assert.equal(connection.sent.length, 0)
  connection.emit('connect')
  const [network, chain] = connection.sent
  connection.respond(network, '1')
  connection.respond(chain, '0x1')
  await new Promise((resolve) => setImmediate(resolve))
  const request = connection.sent.at(-1)
  assert.equal(request.method, 'eth_accounts')
  connection.respond(request, ['0x1234'])
  assert.deepEqual(await result, ['0x1234'])
})

test('rejects RPC waiting on a transport that closes before handshake', async () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  const result = provider.request({ method: 'eth_accounts' })
  connection.emit('close')
  await assert.rejects(result, (error) => error.code === 4900)
})

test('forwards requests and preserves provider error codes', async () => {
  const { connection, provider } = await setupConnected()
  const result = provider.request({ method: 'eth_chainId' })
  connection.respond(connection.sent[0], '0xa')
  assert.equal(await result, '0xa')

  const rejected = provider.request({ method: 'eth_requestAccounts' })
  const request = connection.sent.at(-1)
  connection.emit('payload', {
    jsonrpc: '2.0',
    id: request.id,
    error: { code: 4001, message: 'Rejected' }
  })
  await assert.rejects(rejected, (error) => error.code === 4001 && error.message === 'Rejected')
})

test('updates account state and supports legacy callback requests', async () => {
  const { connection, provider } = await setupConnected()
  const accounts = provider.request({ method: 'eth_accounts' })
  connection.respond(connection.sent[0], ['0x1234'])
  assert.deepEqual(await accounts, ['0x1234'])
  assert.equal(provider.selectedAddress, '0x1234')

  const callback = new Promise((resolve, reject) => {
    provider.sendAsync(
      { id: 99, jsonrpc: '2.0', method: 'eth_chainId', params: [] },
      (error, value) => {
        if (error) reject(error)
        else resolve(value)
      }
    )
  })
  connection.respond(connection.sent.at(-1), '0x1')
  assert.deepEqual(await callback, { id: 99, jsonrpc: '2.0', result: '0x1' })
})

test('legacy enable requests account access instead of silently reading existing accounts', async () => {
  const { connection, provider } = await setupConnected()
  const changes = []
  provider.on('accountsChanged', (accounts) => changes.push(accounts))
  const enabled = provider.enable()
  const request = connection.sent.at(-1)

  assert.equal(request.method, 'eth_requestAccounts')
  connection.respond(request, ['0x1234'])
  assert.deepEqual(await enabled, ['0x1234'])
  assert.deepEqual(provider.accounts, ['0x1234'])
  assert.deepEqual(changes, [['0x1234']])
})

test('emits account changes from direct grants once and suppresses duplicate subscription state', async () => {
  const { connection, provider } = await setupConnected()
  const changes = []
  provider.on('accountsChanged', (accounts) => changes.push(accounts))
  await new Promise((resolve) => queueMicrotask(resolve))
  const subscription = connection.sent.find(({ method }) => method === 'eth_subscribe')
  connection.respond(subscription, 'accounts-subscription')
  await new Promise((resolve) => queueMicrotask(resolve))

  const granted = provider.request({ method: 'eth_requestAccounts' })
  connection.respond(connection.sent.at(-1), ['0x1234'])
  assert.deepEqual(await granted, ['0x1234'])
  connection.emit('payload', {
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: 'accounts-subscription', result: ['0x1234'] }
  })

  assert.deepEqual(changes, [['0x1234']])
})

test('emits a subscription grant once when it arrives before the request response', async () => {
  const { connection, provider } = await setupConnected()
  const changes = []
  provider.on('accountsChanged', (accounts) => changes.push(accounts))
  await new Promise((resolve) => queueMicrotask(resolve))
  const subscription = connection.sent.find(({ method }) => method === 'eth_subscribe')
  connection.respond(subscription, 'accounts-subscription')
  await new Promise((resolve) => queueMicrotask(resolve))

  const granted = provider.request({ method: 'eth_requestAccounts' })
  const request = connection.sent.at(-1)
  connection.emit('payload', {
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: 'accounts-subscription', result: ['0x1234'] }
  })
  connection.respond(request, ['0x1234'])

  assert.deepEqual(await granted, ['0x1234'])
  assert.deepEqual(changes, [['0x1234']])
})

test('subscribes only for observed events and emits standard subscription messages', async () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  const changes = []
  const messages = []
  provider.on('accountsChanged', (accounts) => changes.push(accounts))
  provider.on('message', (message) => messages.push(message))
  await connect(provider, connection)
  await new Promise((resolve) => queueMicrotask(resolve))

  const subscription = connection.sent.find(({ method }) => method === 'eth_subscribe')
  assert.deepEqual(subscription.params, ['accountsChanged'])
  connection.respond(subscription, 'subscription-1')
  await new Promise((resolve) => queueMicrotask(resolve))
  connection.emit('payload', {
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: 'subscription-1', result: ['0xabcd'] }
  })

  assert.deepEqual(changes, [['0xabcd']])
  assert.deepEqual(messages, [
    {
      type: 'eth_subscription',
      data: { subscription: 'subscription-1', result: ['0xabcd'] }
    }
  ])
})

test('rejects every pending request when the document transport closes', async () => {
  const { connection, provider } = await setupConnected()
  const first = provider.request({ method: 'eth_chainId' })
  const second = provider.request({ method: 'eth_accounts' })
  connection.emit('close')

  await assert.rejects(first, (error) => error.code === 4900)
  await assert.rejects(second, (error) => error.code === 4900)
  assert.equal(provider.pending.size, 0)
})

test('clears stale subscription ownership on every transport close', () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  provider.subscriptions.set('stale', 'accountsChanged')
  provider.subscriptionPromises.set('chainChanged', Promise.resolve())

  connection.emit('close')

  assert.equal(provider.subscriptions.size, 0)
  assert.equal(provider.subscriptionPromises.size, 0)
})

test('preserves bound legacy batch and subscription methods', async () => {
  const { connection, provider } = await setupConnected()
  const { request, sendBatch, subscribe, unsubscribe } = provider

  const direct = request({ method: 'eth_chainId' })
  connection.respond(connection.sent.at(-1), '0x1')
  assert.equal(await direct, '0x1')

  const batch = sendBatch([{ method: 'eth_chainId' }, { method: 'net_version' }])
  connection.respond(connection.sent.at(-2), '0x1')
  connection.respond(connection.sent.at(-1), '1')
  assert.deepEqual(await batch, ['0x1', '1'])

  const subscribed = subscribe('eth_subscribe', 'newHeads')
  connection.respond(connection.sent.at(-1), 'sub-1')
  assert.equal(await subscribed, 'sub-1')
  const heads = []
  provider.on('sub-1', (head) => heads.push(head))
  connection.emit('payload', {
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: 'sub-1', result: { number: '0x1' } }
  })
  assert.deepEqual(heads, [{ number: '0x1' }])

  const unsubscribed = unsubscribe('eth_unsubscribe', 'sub-1')
  connection.respond(connection.sent.at(-1), true)
  assert.equal(await unsubscribed, true)
})

test('suppresses desktop chain events while manual targeting is active', () => {
  const connection = new FakeConnection()
  const provider = new FrameProvider(connection)
  const changes = []
  provider.on('chainChanged', (chainId) => changes.push(chainId))
  provider.subscriptions.set('sub-chain', 'chainChanged')

  provider.setChain('0xa')
  connection.emit('payload', {
    jsonrpc: '2.0',
    method: 'eth_subscription',
    params: { subscription: 'sub-chain', result: '0x1' }
  })
  assert.deepEqual(changes, ['0xa'])
  assert.equal(provider.chainId, '0xa')

  provider.setChain(undefined)
  assert.deepEqual(changes, ['0xa', '0x1'])
})
