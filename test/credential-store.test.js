const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CredentialStore,
  IndexedDbCredentialStorage,
  createCredential,
  validateCredential
} = require('../src/credential-store')

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

class MemoryStorage {
  constructor(value) {
    this.value = value
    this.writes = 0
    this.removes = 0
  }

  async get() {
    return this.value
  }

  async set(value) {
    this.value = value
    this.writes += 1
  }

  async remove() {
    this.value = undefined
    this.removes += 1
  }
}

function subtleWithExportedKey(fields) {
  const subtle = crypto.subtle
  return {
    generateKey: subtle.generateKey.bind(subtle),
    exportKey: async (...args) => ({ ...(await subtle.exportKey(...args)), ...fields }),
    digest: subtle.digest.bind(subtle)
  }
}

test('creates and reuses a nonextractable installation credential', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage, now: () => 1234 })
  const first = await store.get()
  const second = await store.get()

  assert.equal(first, second)
  assert.equal(first.privateKey.extractable, false)
  assert.match(first.installationId, /^[0-9a-f-]{36}$/u)
  assert.deepEqual(first.privateKey.usages, ['sign'])
  assert.equal(first.createdAt, 1234)
  assert.equal(storage.writes, 1)
  assert.equal(await validateCredential(first), true)

  const reloaded = await new CredentialStore({ storage }).get()
  assert.equal(reloaded.fingerprint, first.fingerprint)
  assert.equal(storage.writes, 1)
})

test('normalizes Firefox WebCrypto public-key algorithm metadata', async () => {
  const credential = await createCredential(subtleWithExportedKey({ alg: 'ES256' }))

  assert.equal('alg' in credential.publicKey, false)
  assert.deepEqual(Object.keys(credential.publicKey).sort(), [
    'crv',
    'ext',
    'key_ops',
    'kty',
    'x',
    'y'
  ])
  assert.equal(await validateCredential(credential), true)
})

test('rejects unsupported WebCrypto public-key metadata', async () => {
  await assert.rejects(
    createCredential(subtleWithExportedKey({ alg: 'ES384' })),
    /unsupported companion credential/u
  )
  await assert.rejects(
    createCredential(subtleWithExportedKey({ unexpected: true })),
    /unsupported companion credential/u
  )
})

test('replaces malformed or mismatched persisted credentials', async () => {
  const valid = await createCredential()
  const storage = new MemoryStorage({ ...valid, fingerprint: 'a'.repeat(43) })
  const loaded = await new CredentialStore({ storage }).get()

  assert.notEqual(loaded.fingerprint, 'a'.repeat(43))
  assert.equal(await validateCredential(loaded), true)
  assert.equal(storage.writes, 1)
})

test('rotates the persisted private key explicitly', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage })
  const first = await store.get()
  const rotated = await store.rotate()

  assert.equal(storage.removes, 0)
  assert.equal(storage.writes, 2)
  assert.notEqual(rotated.fingerprint, first.fingerprint)
  assert.equal(rotated.installationId, first.installationId)
  assert.equal(await validateCredential(rotated), true)
})

test('keeps the prior credential when atomic rotation persistence fails', async () => {
  const storage = new MemoryStorage()
  const store = new CredentialStore({ storage })
  const first = await store.get()
  storage.set = async () => {
    throw new Error('write failed')
  }

  await assert.rejects(store.rotate(), /write failed/u)
  assert.equal(storage.value.fingerprint, first.fingerprint)
  assert.equal((await store.get()).fingerprint, first.fingerprint)
})

test('waits for IndexedDB transaction commit and rejects a late abort', async () => {
  const indexedDb = controlledIndexedDb()
  const storage = new IndexedDbCredentialStorage(indexedDb)
  await storage.open()

  let resolved = false
  const write = storage.set({ id: 'desktop-auth-v2' }).then(() => {
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

  const aborted = storage.remove()
  await Promise.resolve()
  const second = indexedDb.transactions[1]
  second.request.onsuccess()
  second.onabort()
  await assert.rejects(aborted, /transaction aborted/u)
})
