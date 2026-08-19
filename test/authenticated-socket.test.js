const assert = require('node:assert/strict')
const test = require('node:test')

const { AuthenticatedSocket } = require('../src/authenticated-socket')
const { authPayload, pairingCode } = require('../src/auth-protocol')
const { CredentialStore, createCredentialBundle } = require('../src/credential-store')

class MemoryStorage {
  constructor(value) {
    this.value = value
  }

  async get() {
    return this.value
  }

  async set(value) {
    this.value = value
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

const pause = () => new Promise((resolve) => setTimeout(resolve, 5))
const nonce = (byte) => Buffer.alloc(32, byte).toString('base64url')

async function waitFor(predicate, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  do {
    if (predicate()) return
    await pause()
  } while (Date.now() < deadline)
  throw new Error('Timed out waiting for authentication fixture')
}

async function setup({ credentialStore, role = 'control', now = () => 1000 } = {}) {
  const raw = new FakeSocket()
  const store = credentialStore || new CredentialStore({ storage: new MemoryStorage() })
  const statuses = []
  const socket = new AuthenticatedSocket({
    socket: raw,
    credentialStore: store,
    channelRole: role,
    now,
    onStatus: (status) => statuses.push(status)
  })
  const opened = []
  const messages = []
  socket.addEventListener('open', () => opened.push(true))
  socket.addEventListener('message', (event) => messages.push(event.data))
  raw.open()
  await waitFor(() => raw.sent.length === 1)
  return {
    bundle: await store.getForAuthentication(),
    credentialStore: store,
    hello: JSON.parse(raw.sent[0]),
    messages,
    opened,
    raw,
    socket,
    statuses
  }
}

async function signedChallenge(session, desktopBundle, overrides = {}) {
  const desktopCredential = desktopBundle.credentials.control
  const challenge = {
    type: 'frame-auth',
    version: 3,
    step: 'challenge',
    peerKind: 'companion',
    channelRole: session.hello.channelRole,
    challengeId: '18e73d72-3643-4cf6-846f-83854160f9f2',
    desktopNonce: nonce(2),
    clientNonce: session.hello.clientNonce,
    expiresAt: 61_000,
    desktop: {
      installationId: desktopBundle.installationId,
      fingerprint: desktopCredential.fingerprint,
      publicKey: desktopCredential.publicKey
    },
    client: {
      installationId: session.hello.client.installationId,
      fingerprint: session.hello.client.fingerprint,
      roleFingerprint: session.hello.client.roleFingerprint
    },
    ...overrides
  }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    desktopCredential.privateKey,
    authPayload(challenge, 'desktop-challenge')
  )
  return { ...challenge, signature: Buffer.from(signature).toString('base64url') }
}

async function signedAck(challenge, desktopBundle) {
  const { publicKey, ...desktop } = challenge.desktop
  assert.ok(publicKey)
  const ack = { ...challenge, step: 'authenticated', desktop }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    desktopBundle.credentials.control.privateKey,
    authPayload(ack, 'desktop-ack')
  )
  return { ...ack, signature: Buffer.from(signature).toString('base64url') }
}

async function issueChallenge(session, desktopBundle) {
  const challenge = await signedChallenge(session, desktopBundle)
  session.raw.message(challenge)
  await waitFor(() => session.raw.sent.length === 2)
  return { challenge, response: JSON.parse(session.raw.sent[1]) }
}

async function complete(session, desktopBundle) {
  const { challenge, response } = await issueChallenge(session, desktopBundle)
  session.raw.message(await signedAck(challenge, desktopBundle))
  await waitFor(() => session.opened.length === 1)
  return response
}

async function verifiesRoleSignature(response, challenge, hello, role) {
  const publicKey = await crypto.subtle.importKey(
    'jwk',
    hello.client.publicKeys[role],
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify']
  )
  return crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    publicKey,
    Buffer.from(response.signature, 'base64url'),
    authPayload(challenge, 'client-response')
  )
}

test('quarantines traffic until signed challenge and final ack verify, then pins desktop', async () => {
  const session = await setup()
  const desktop = await createCredentialBundle()
  assert.equal(session.socket.readyState, 0)
  assert.equal(session.hello.version, 3)
  assert.equal(session.hello.peerKind, 'companion')
  assert.equal(Object.hasOwn(session.hello, 'browser'), false)
  assert.equal(Object.hasOwn(session.hello, 'extensionId'), false)
  assert.equal(session.hello.client.fingerprint, session.bundle.fingerprint)
  assert.deepEqual(session.hello.client.publicKeys, {
    control: session.bundle.credentials.control.publicKey,
    page: session.bundle.credentials.page.publicKey
  })

  const { challenge, response } = await issueChallenge(session, desktop)
  assert.equal(response.step, 'response')
  assert.equal(session.statuses.at(-1).pairingCode, await pairingCode(challenge))
  assert.equal(await verifiesRoleSignature(response, challenge, session.hello, 'control'), true)
  assert.equal(await verifiesRoleSignature(response, challenge, session.hello, 'page'), false)
  assert.equal((await session.credentialStore.get()).desktop, undefined)

  session.raw.message(await signedAck(challenge, desktop))
  await waitFor(() => session.opened.length === 1)
  assert.equal(session.socket.readyState, 1)
  assert.equal(
    (await session.credentialStore.get()).desktop.fingerprint,
    desktop.credentials.control.fingerprint
  )

  session.raw.message({ jsonrpc: '2.0', id: 1, result: '0x1' })
  assert.equal(JSON.parse(session.messages[0]).result, '0x1')
  session.socket.send('request')
  assert.equal(session.raw.sent.at(-1), 'request')
})

test('page reconnect is silent and uses only the page role key in the pinned bundle', async () => {
  const storage = new MemoryStorage()
  const credentialStore = new CredentialStore({ storage })
  const desktop = await createCredentialBundle()
  const control = await setup({ credentialStore })
  await complete(control, desktop)

  const page = await setup({ credentialStore, role: 'page' })
  assert.equal(Object.hasOwn(page.hello, 'browser'), false)
  assert.equal(Object.hasOwn(page.hello, 'extensionId'), false)
  const { challenge, response } = await issueChallenge(page, desktop)
  assert.equal(await verifiesRoleSignature(response, challenge, page.hello, 'page'), true)
  assert.equal(await verifiesRoleSignature(response, challenge, page.hello, 'control'), false)
  page.raw.message(await signedAck(challenge, desktop))
  await waitFor(() => page.opened.length === 1)
  assert.equal(
    page.statuses.some((status) => status.status === 'pairing'),
    false
  )
})

test('fails closed on pinned-desktop replacement, expiry, tamper, replay, and downgrade', async () => {
  const storage = new MemoryStorage()
  const credentialStore = new CredentialStore({ storage })
  const desktop = await createCredentialBundle()
  const paired = await setup({ credentialStore })
  await complete(paired, desktop)

  const replaced = await setup({ credentialStore })
  replaced.raw.message(await signedChallenge(replaced, await createCredentialBundle()))
  await waitFor(() => replaced.raw.closeArgs)
  assert.equal(replaced.statuses.at(-1).code, 'pinned-desktop-mismatch')
  assert.equal(storage.value.desktop.fingerprint, desktop.credentials.control.fingerprint)

  const expired = await setup()
  expired.raw.message(await signedChallenge(expired, desktop, { expiresAt: 1000 }))
  await waitFor(() => expired.raw.closeArgs)
  assert.deepEqual(expired.raw.closeArgs, [1002, 'Wren authentication challenge mismatch'])

  const tampered = await setup()
  const badProof = await signedChallenge(tampered, desktop)
  badProof.signature = `${badProof.signature.startsWith('A') ? 'B' : 'A'}${badProof.signature.slice(1)}`
  tampered.raw.message(badProof)
  await waitFor(() => tampered.raw.closeArgs)
  assert.deepEqual(tampered.raw.closeArgs, [1002, 'Invalid Wren desktop proof'])

  const replayed = await setup()
  const exchange = await issueChallenge(replayed, desktop)
  replayed.raw.message(exchange.challenge)
  await waitFor(() => replayed.raw.closeArgs)
  assert.deepEqual(replayed.raw.closeArgs, [1002, 'Wren authentication acknowledgement mismatch'])

  const downgraded = await setup()
  downgraded.raw.message({ type: 'frame-auth', version: 2, step: 'challenge' })
  await waitFor(() => downgraded.raw.closeArgs)
  assert.deepEqual(downgraded.raw.closeArgs, [1008, 'Wren authentication failed'])
  assert.equal(downgraded.statuses.at(-1).status, 'upgrade-required')
})

test('never pairs over page and denied rotation retains the active credential', async () => {
  const desktop = await createCredentialBundle()
  const unpairedPage = await setup({ role: 'page' })
  unpairedPage.raw.message(await signedChallenge(unpairedPage, desktop))
  await waitFor(() => unpairedPage.raw.closeArgs)
  assert.equal(unpairedPage.statuses.at(-1).code, 'invalid-state')
  assert.equal(
    unpairedPage.statuses.some((status) => status.status === 'pairing'),
    false
  )

  const storage = new MemoryStorage()
  const credentialStore = new CredentialStore({ storage })
  const active = await credentialStore.get()
  await credentialStore.rotate()
  const rotating = await setup({ credentialStore })
  assert.notEqual(rotating.hello.client.fingerprint, active.fingerprint)
  rotating.raw.message({
    type: 'frame-auth',
    version: 3,
    step: 'error',
    code: 'denied',
    message: 'Wren Companion pairing was denied'
  })
  await waitFor(() => rotating.raw.closeArgs)
  assert.equal((await credentialStore.getForAuthentication()).fingerprint, active.fingerprint)
  assert.equal(storage.value.fingerprint, active.fingerprint)

  await credentialStore.rotate()
  const interrupted = await setup({ credentialStore })
  assert.notEqual(interrupted.hello.client.fingerprint, active.fingerprint)
  interrupted.raw.close(1006, 'Desktop disconnected')
  assert.equal((await credentialStore.getForAuthentication()).fingerprint, active.fingerprint)
  assert.equal(storage.value.fingerprint, active.fingerprint)
})

test('bounds a stalled desktop and cancels asynchronous authentication', async () => {
  const raw = new FakeSocket()
  const timers = new Map()
  let nextTimer = 1
  const socket = new AuthenticatedSocket({
    socket: raw,
    credentialStore: new CredentialStore({ storage: new MemoryStorage() }),
    channelRole: 'control',
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
  await pause()
  assert.equal(raw.sent.length, sent)
  assert.equal(socket.readyState, 3)
})
