const DATABASE_NAME = 'frame-companion'
const DATABASE_VERSION = 1
const STORE_NAME = 'credentials'
const CREDENTIAL_ID = 'desktop-auth-v2'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function isCanonicalCoordinate(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(value)) return false
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/') + '='
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    return bytes.length === 32 && bytesToBase64Url(bytes) === value
  } catch {
    return false
  }
}

function isPublicKey(publicKey) {
  return (
    publicKey &&
    typeof publicKey === 'object' &&
    !Array.isArray(publicKey) &&
    Object.keys(publicKey).length === 6 &&
    publicKey.kty === 'EC' &&
    publicKey.crv === 'P-256' &&
    isCanonicalCoordinate(publicKey.x) &&
    isCanonicalCoordinate(publicKey.y) &&
    publicKey.ext === true &&
    Array.isArray(publicKey.key_ops) &&
    publicKey.key_ops.length === 1 &&
    publicKey.key_ops[0] === 'verify'
  )
}

function isPrivateKey(privateKey) {
  return (
    privateKey &&
    typeof privateKey === 'object' &&
    privateKey.type === 'private' &&
    privateKey.extractable === false &&
    privateKey.algorithm?.name === 'ECDSA' &&
    privateKey.algorithm?.namedCurve === 'P-256' &&
    Array.isArray(privateKey.usages) &&
    privateKey.usages.length === 1 &&
    privateKey.usages[0] === 'sign'
  )
}

async function fingerprintPublicKey(publicKey, subtle = crypto.subtle) {
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${publicKey.x}.${publicKey.y}`)
  )
  return bytesToBase64Url(new Uint8Array(digest))
}

async function createCredential(subtle = crypto.subtle, installationId = crypto.randomUUID()) {
  if (!UUID_V4.test(installationId)) throw new Error('Invalid Companion installation identifier')
  const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify'
  ])
  const publicKey = await subtle.exportKey('jwk', keyPair.publicKey)
  if (!isPublicKey(publicKey) || !isPrivateKey(keyPair.privateKey)) {
    throw new Error('Browser generated an unsupported companion credential')
  }
  return {
    id: CREDENTIAL_ID,
    protocolVersion: 2,
    installationId,
    privateKey: keyPair.privateKey,
    publicKey,
    fingerprint: await fingerprintPublicKey(publicKey, subtle),
    createdAt: Date.now()
  }
}

async function validateCredential(credential, subtle = crypto.subtle) {
  if (
    !credential ||
    typeof credential !== 'object' ||
    credential.id !== CREDENTIAL_ID ||
    credential.protocolVersion !== 2 ||
    typeof credential.installationId !== 'string' ||
    !UUID_V4.test(credential.installationId) ||
    !isPrivateKey(credential.privateKey) ||
    !isPublicKey(credential.publicKey) ||
    typeof credential.fingerprint !== 'string' ||
    !Number.isSafeInteger(credential.createdAt) ||
    credential.createdAt < 0
  ) {
    return false
  }

  try {
    if ((await fingerprintPublicKey(credential.publicKey, subtle)) !== credential.fingerprint)
      return false
    const publicKey = await subtle.importKey(
      'jwk',
      credential.publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    const probe = new TextEncoder().encode('frame-companion-credential-v1')
    const signature = await subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      credential.privateKey,
      probe
    )
    return subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, signature, probe)
  } catch {
    return false
  }
}

class CredentialStore {
  constructor({ storage, subtle = crypto.subtle, now = Date.now }) {
    this.storage = storage
    this.subtle = subtle
    this.now = now
  }

  get() {
    if (!this.pending) {
      const pending = this.loadOrCreate()
      this.pending = pending
      pending.catch(() => {
        if (this.pending === pending) this.pending = undefined
      })
    }
    return this.pending
  }

  async loadOrCreate() {
    const stored = await this.storage.get()
    if (await validateCredential(stored, this.subtle)) return stored

    const credential = await createCredential(this.subtle)
    credential.createdAt = this.now()
    await this.storage.set(credential)
    return credential
  }

  async rotate() {
    const current = await this.get()
    const pending = createCredential(this.subtle, current.installationId).then(
      async (credential) => {
        credential.createdAt = this.now()
        await this.storage.set(credential)
        return credential
      }
    )
    this.pending = pending
    pending.catch(() => {
      if (this.pending === pending) this.pending = undefined
    })
    return pending
  }
}

class IndexedDbCredentialStorage {
  constructor(indexedDb = indexedDB) {
    this.indexedDb = indexedDb
  }

  open() {
    if (this.database) return Promise.resolve(this.database)
    if (this.opening) return this.opening

    this.opening = new Promise((resolve, reject) => {
      const request = this.indexedDb.open(DATABASE_NAME, DATABASE_VERSION)
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
        }
      }
      request.onsuccess = () => {
        this.database = request.result
        this.database.onversionchange = () => {
          this.database?.close()
          this.database = undefined
        }
        resolve(this.database)
      }
      request.onerror = () =>
        reject(request.error || new Error('Unable to open companion credential store'))
      request.onblocked = () => reject(new Error('Companion credential store is blocked'))
    }).finally(() => {
      this.opening = undefined
    })

    return this.opening
  }

  async request(mode, operation) {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode)
      const request = operation(transaction.objectStore(STORE_NAME))
      let result
      let settled = false
      const fail = (error) => {
        if (settled) return
        settled = true
        reject(error)
      }
      request.onsuccess = () => {
        result = request.result
      }
      request.onerror = () =>
        fail(request.error || new Error('Companion credential operation failed'))
      transaction.oncomplete = () => {
        if (settled) return
        settled = true
        resolve(result)
      }
      transaction.onerror = () =>
        fail(transaction.error || new Error('Companion credential transaction failed'))
      transaction.onabort = () =>
        fail(transaction.error || new Error('Companion credential transaction aborted'))
    })
  }

  get() {
    return this.request('readonly', (store) => store.get(CREDENTIAL_ID))
  }

  set(credential) {
    return this.request('readwrite', (store) => store.put(credential))
  }

  remove() {
    return this.request('readwrite', (store) => store.delete(CREDENTIAL_ID))
  }
}

module.exports = {
  CREDENTIAL_ID,
  CredentialStore,
  IndexedDbCredentialStorage,
  bytesToBase64Url,
  createCredential,
  fingerprintPublicKey,
  isPublicKey,
  validateCredential
}
