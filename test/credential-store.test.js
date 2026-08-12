const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CREDENTIAL_ID,
  CredentialStore,
  IndexedDbCredentialStorage,
  createCredentialBundle,
  fingerprintPublicKeyBundle,
  validateCredentialBundle
} = require('../src/credential-store')

class MemoryStorage {
  constructor(value) {
    this.value = value
    this.writes = 0
  }
  async get() {
    return this.value
  }
  async set(value) {
    this.value = value
    this.writes += 1
  }
}

function controlledIndexedDb() {
  const transactions = []
  const database = {
    objectStoreNames: { contains: () => true },
    close() {},
    transaction() {
      const transaction = {
        objectStore: () => ({
          get: () => transaction.request,
          put: () => transaction.request,
          delete: () => transaction.request
        }),
        request: {}
      }
      transactions.push(transaction)
      return transaction
    }
  }
  return {
    transactions,
    open() {
      const request = { result: database }
      queueMicrotask(() => request.onsuccess())
      return request
    }
  }
}

test('creates one atomic v3 bundle with separate nonextractable control and page keys', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage, now: () => 1234 })
  const bundle = await store.get()

  assert.equal(bundle.id, CREDENTIAL_ID)
  assert.equal(bundle.protocolVersion, 3)
  assert.deepEqual(Object.keys(bundle.credentials).sort(), ['control', 'page'])
  assert.notEqual(bundle.credentials.control.fingerprint, bundle.credentials.page.fingerprint)
  assert.equal(
    bundle.fingerprint,
    await fingerprintPublicKeyBundle({
      control: bundle.credentials.control.publicKey,
      page: bundle.credentials.page.publicKey
    })
  )
  for (const role of ['control', 'page']) {
    assert.equal(bundle.credentials[role].role, role)
    assert.equal(bundle.credentials[role].privateKey.extractable, false)
    assert.deepEqual(bundle.credentials[role].privateKey.usages, ['sign'])
  }
  assert.equal(storage.writes, 1)
  assert.equal(await validateCredentialBundle(bundle), true)
})

test('atomically replaces malformed or v2 storage while preserving a valid installation id', async () => {
  const installationId = crypto.randomUUID()
  const storage = new MemoryStorage({
    id: 'desktop-auth-v2',
    protocolVersion: 2,
    installationId
  })
  const bundle = await new CredentialStore({ storage }).get()
  assert.equal(bundle.installationId, installationId)
  assert.equal(bundle.protocolVersion, 3)
  assert.equal(storage.writes, 1)
})

test('pins one verified desktop atomically and fails closed on identity replacement', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage, now: () => 55 })
  await store.get()
  const desktopBundle = await createCredentialBundle()
  const desktopCredential = desktopBundle.credentials.control
  const desktop = {
    installationId: desktopBundle.installationId,
    fingerprint: desktopCredential.fingerprint,
    publicKey: desktopCredential.publicKey,
    pinnedAt: 55
  }
  assert.deepEqual(await store.pinDesktop(desktop), desktop)
  assert.equal(storage.writes, 2)
  assert.deepEqual(await store.pinDesktop(desktop), desktop)
  assert.equal(storage.writes, 2)

  const replacement = await createCredentialBundle()
  await assert.rejects(
    store.pinDesktop({
      installationId: replacement.installationId,
      fingerprint: replacement.credentials.control.fingerprint,
      publicKey: replacement.credentials.control.publicKey,
      pinnedAt: 56
    }),
    /identity mismatch/u
  )
  assert.equal(storage.value.desktop.fingerprint, desktop.fingerprint)
})

test('stages both rotated role keys and promotes them only after signed-final authentication', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage })
  const first = await store.get()
  const rotated = await store.rotate()
  assert.equal(rotated.installationId, first.installationId)
  assert.equal(rotated.desktop, undefined)
  assert.notEqual(rotated.credentials.control.fingerprint, first.credentials.control.fingerprint)
  assert.notEqual(rotated.credentials.page.fingerprint, first.credentials.page.fingerprint)
  assert.equal(storage.writes, 1)
  assert.equal((await store.get()).fingerprint, first.fingerprint)
  assert.equal((await store.getForAuthentication()).fingerprint, rotated.fingerprint)

  const desktopBundle = await createCredentialBundle()
  const desktopCredential = desktopBundle.credentials.control
  await store.commitAuthentication(rotated, {
    installationId: desktopBundle.installationId,
    fingerprint: desktopCredential.fingerprint,
    publicKey: desktopCredential.publicKey,
    pinnedAt: 99
  })
  assert.equal(storage.writes, 2)
  assert.equal((await store.get()).fingerprint, rotated.fingerprint)
  assert.equal((await store.get()).desktop.fingerprint, desktopCredential.fingerprint)
})

test('denied and interrupted rotation retain the active pinned bundle', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage })
  const first = await store.get()
  const rotated = await store.rotate()
  store.cancelRotation(rotated)
  assert.equal((await store.getForAuthentication()).fingerprint, first.fingerprint)
  assert.equal(storage.writes, 1)

  const secondCandidate = await store.rotate()
  storage.set = async () => {
    throw new Error('write failed')
  }
  const desktopBundle = await createCredentialBundle()
  const desktopCredential = desktopBundle.credentials.control
  await assert.rejects(
    store.commitAuthentication(secondCandidate, {
      installationId: desktopBundle.installationId,
      fingerprint: desktopCredential.fingerprint,
      publicKey: desktopCredential.publicKey,
      pinnedAt: 99
    }),
    /write failed/u
  )
  assert.equal((await store.get()).fingerprint, first.fingerprint)
  assert.equal(storage.value.fingerprint, first.fingerprint)
})

test('waits for IndexedDB transaction commit and rejects late abort', async () => {
  const indexedDb = controlledIndexedDb()
  const storage = new IndexedDbCredentialStorage(indexedDb)
  await storage.open()
  let resolved = false
  const write = storage.set({ id: CREDENTIAL_ID }).then(() => {
    resolved = true
  })
  await Promise.resolve()
  const first = indexedDb.transactions[0]
  first.request.onsuccess()
  await Promise.resolve()
  assert.equal(resolved, false)
  first.oncomplete()
  await write
  assert.equal(resolved, true)

  const removed = storage.remove()
  await Promise.resolve()
  const second = indexedDb.transactions[1]
  second.request.onsuccess()
  second.onabort()
  await assert.rejects(removed, /transaction aborted/u)
})
