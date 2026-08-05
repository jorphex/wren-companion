const assert = require('node:assert/strict')
const test = require('node:test')

const { AuthenticatedSocket } = require('../src/authenticated-socket')
const { authPayload, pairingCode } = require('../src/auth-protocol')
const { CredentialStore } = require('../src/credential-store')

class MemoryStorage {
  async get() {
    return this.value
  }

  async set(value) {
    this.value = value
  }

  async remove() {
    this.value = undefined
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

  message(value) {
    this.emit('message', { data: JSON.stringify(value) })
  }

  send(value) {
    this.sent.push(value)
  }

  close(code, reason) {
    this.readyState = 3
    this.closeArgs = [code, reason]
    this.emit('close', { code, reason })
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))
const pause = () => new Promise((resolve) => setTimeout(resolve, 5))

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  do {
    if (predicate()) return
    await pause()
  } while (Date.now() < deadline)
  throw new Error('Timed out waiting for authentication fixture')
}

async function setup() {
  const raw = new FakeSocket()
  const credentialStore = new CredentialStore({ storage: new MemoryStorage() })
  const statuses = []
  const socket = new AuthenticatedSocket({
    socket: raw,
    credentialStore,
    identity: { browser: 'chrome', extensionId: 'a'.repeat(32) },
    now: () => 1000,
    onStatus: (status) => statuses.push(status)
  })
  const opened = []
  const messages = []
  socket.addEventListener('open', () => opened.push(true))
  socket.addEventListener('message', (event) => messages.push(event.data))
  raw.open()
  await waitFor(() => raw.sent.length === 1)
  const hello = JSON.parse(raw.sent[0])
  return { credential: await credentialStore.get(), hello, messages, opened, raw, socket, statuses }
}

test('quarantines traffic until the signed desktop handshake completes', async () => {
  const { credential, hello, messages, opened, raw, socket, statuses } = await setup()
  assert.equal(socket.readyState, 0)
  assert.equal(hello.step, 'hello')
  assert.deepEqual(hello.publicKey, credential.publicKey)

  const challenge = {
    type: 'frame-auth',
    version: 2,
    step: 'challenge',
    challengeId: '18e73d72-3643-4cf6-846f-83854160f9f2',
    clientNonce: hello.clientNonce,
    serverNonce: Buffer.alloc(32, 2).toString('base64url'),
    browser: 'chrome',
    extensionId: 'a'.repeat(32),
    installationId: credential.installationId,
    fingerprint: credential.fingerprint,
    expiresAt: 61_000
  }
  raw.message(challenge)
  await waitFor(() => raw.sent.length === 2)
  const proof = JSON.parse(raw.sent[1])
  assert.equal(proof.step, 'proof')
  assert.equal(statuses.at(-1).pairingCode, await pairingCode(challenge))

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    credential.publicKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
  assert.equal(
    await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      Buffer.from(proof.signature, 'base64url'),
      authPayload(challenge)
    ),
    true
  )

  raw.message({
    type: 'frame-auth',
    version: 2,
    step: 'authenticated',
    fingerprint: credential.fingerprint
  })
  await flush()
  assert.equal(socket.readyState, 1)
  assert.equal(opened.length, 1)

  raw.message({ jsonrpc: '2.0', id: 1, result: '0x1' })
  assert.equal(JSON.parse(messages[0]).result, '0x1')
  socket.send('request')
  assert.equal(raw.sent.at(-1), 'request')
})

test('fails closed on a substituted challenge or explicit desktop denial', async () => {
  const substituted = await setup()
  substituted.raw.message({
    type: 'frame-auth',
    version: 2,
    step: 'challenge',
    challengeId: '18e73d72-3643-4cf6-846f-83854160f9f2',
    clientNonce: substituted.hello.clientNonce,
    serverNonce: Buffer.alloc(32, 2).toString('base64url'),
    browser: 'chrome',
    extensionId: 'b'.repeat(32),
    installationId: substituted.credential.installationId,
    fingerprint: substituted.credential.fingerprint,
    expiresAt: 61_000
  })
  await flush()
  assert.deepEqual(substituted.raw.closeArgs, [1002, 'Wren authentication challenge mismatch'])

  const denied = await setup()
  denied.raw.message({
    type: 'frame-auth',
    version: 2,
    step: 'error',
    code: 'denied',
    message: 'Frame Companion pairing was denied'
  })
  await flush()
  assert.deepEqual(denied.raw.closeArgs, [1008, 'Wren authentication failed'])
  assert.equal(denied.statuses.at(-1).code, 'denied')
})

test('cancels asynchronous authentication and bounds a stalled desktop', async () => {
  const raw = new FakeSocket()
  const timers = new Map()
  let nextTimer = 1
  const socket = new AuthenticatedSocket({
    socket: raw,
    credentialStore: new CredentialStore({ storage: new MemoryStorage() }),
    identity: { browser: 'chrome', extensionId: 'a'.repeat(32) },
    setTimer: (callback, delay) => {
      const id = nextTimer++
      timers.set(id, { callback, delay })
      return id
    },
    clearTimer: (id) => timers.delete(id)
  })

  raw.open()
  await waitFor(() => raw.sent.length === 1)
  assert.equal([...timers.values()][0].delay, 10_000)
  ;[...timers.values()][0].callback()
  assert.deepEqual(raw.closeArgs, [1008, 'Wren authentication failed'])

  const sent = raw.sent.length
  await flush()
  assert.equal(raw.sent.length, sent)
  assert.equal(socket.readyState, 3)
})
