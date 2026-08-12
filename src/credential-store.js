const DATABASE_NAME = 'wren-companion'
const DATABASE_VERSION = 1
const STORE_NAME = 'credentials'
const CREDENTIAL_ID = 'wren-companion-auth-v3'
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const FINGERPRINT = /^[A-Za-z0-9_-]{43}$/u
const CHANNEL_ROLES = ['control', 'page']
const BUNDLE_FINGERPRINT_DOMAIN = 'wren-companion-key-bundle-v3\0'

function bytesToBase64Url(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function isCanonicalCoordinate(value) {
  if (typeof value !== 'string' || !FINGERPRINT.test(value)) return false
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

function normalizeExportedPublicKey(publicKey) {
  if (!publicKey || typeof publicKey !== 'object' || Array.isArray(publicKey)) return publicKey
  const fields = new Set(['alg', 'crv', 'ext', 'key_ops', 'kty', 'x', 'y'])
  if (
    Object.keys(publicKey).some((field) => !fields.has(field)) ||
    (publicKey.alg !== undefined && publicKey.alg !== 'ES256')
  ) {
    return publicKey
  }
  return {
    kty: publicKey.kty,
    crv: publicKey.crv,
    x: publicKey.x,
    y: publicKey.y,
    ext: publicKey.ext,
    key_ops: publicKey.key_ops
  }
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

async function fingerprintPublicKeyBundle(publicKeys, subtle = crypto.subtle) {
  if (
    !publicKeys ||
    typeof publicKeys !== 'object' ||
    Object.keys(publicKeys).length !== 2 ||
    !isPublicKey(publicKeys.control) ||
    !isPublicKey(publicKeys.page)
  ) {
    throw new Error('Invalid Companion public-key bundle')
  }
  const control = await fingerprintPublicKey(publicKeys.control, subtle)
  const page = await fingerprintPublicKey(publicKeys.page, subtle)
  if (control === page) throw new Error('Companion role keys must be distinct')
  const digest = await subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${BUNDLE_FINGERPRINT_DOMAIN}${control}.${page}`)
  )
  return bytesToBase64Url(new Uint8Array(digest))
}

async function createRoleCredential(role, subtle = crypto.subtle, now = Date.now()) {
  if (!CHANNEL_ROLES.includes(role)) throw new Error('Invalid Companion channel role')
  const keyPair = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, [
    'sign',
    'verify'
  ])
  const publicKey = normalizeExportedPublicKey(await subtle.exportKey('jwk', keyPair.publicKey))
  if (!isPublicKey(publicKey) || !isPrivateKey(keyPair.privateKey)) {
    throw new Error('Browser generated an unsupported Companion credential')
  }
  return {
    role,
    privateKey: keyPair.privateKey,
    publicKey,
    fingerprint: await fingerprintPublicKey(publicKey, subtle),
    createdAt: now
  }
}

async function createCredentialBundle(
  subtle = crypto.subtle,
  installationId = crypto.randomUUID(),
  now = Date.now()
) {
  if (!UUID_V4.test(installationId)) throw new Error('Invalid Companion installation identifier')
  const [control, page] = await Promise.all(
    CHANNEL_ROLES.map((role) => createRoleCredential(role, subtle, now))
  )
  const publicKeys = { control: control.publicKey, page: page.publicKey }
  return {
    id: CREDENTIAL_ID,
    protocolVersion: 3,
    installationId,
    fingerprint: await fingerprintPublicKeyBundle(publicKeys, subtle),
    credentials: { control, page },
    createdAt: now
  }
}

async function validateRoleCredential(credential, role, subtle) {
  if (
    !credential ||
    typeof credential !== 'object' ||
    Object.keys(credential).length !== 5 ||
    credential.role !== role ||
    !isPrivateKey(credential.privateKey) ||
    !isPublicKey(credential.publicKey) ||
    !FINGERPRINT.test(credential.fingerprint) ||
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
    const probe = new TextEncoder().encode(`wren-companion-credential-v3\0${role}`)
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

function validDesktopPin(desktop) {
  return (
    desktop &&
    typeof desktop === 'object' &&
    Object.keys(desktop).length === 4 &&
    UUID_V4.test(desktop.installationId) &&
    FINGERPRINT.test(desktop.fingerprint) &&
    isPublicKey(desktop.publicKey) &&
    Number.isSafeInteger(desktop.pinnedAt) &&
    desktop.pinnedAt >= 0
  )
}

async function validateCredentialBundle(bundle, subtle = crypto.subtle) {
  if (
    !bundle ||
    typeof bundle !== 'object' ||
    bundle.id !== CREDENTIAL_ID ||
    bundle.protocolVersion !== 3 ||
    !UUID_V4.test(bundle.installationId) ||
    !FINGERPRINT.test(bundle.fingerprint) ||
    !bundle.credentials ||
    Object.keys(bundle.credentials).length !== 2 ||
    !Number.isSafeInteger(bundle.createdAt) ||
    bundle.createdAt < 0 ||
    (bundle.desktop !== undefined && !validDesktopPin(bundle.desktop))
  ) {
    return false
  }
  if (bundle.desktop) {
    if (
      (await fingerprintPublicKey(bundle.desktop.publicKey, subtle)) !== bundle.desktop.fingerprint
    )
      return false
  }
  if (
    !(await validateRoleCredential(bundle.credentials.control, 'control', subtle)) ||
    !(await validateRoleCredential(bundle.credentials.page, 'page', subtle)) ||
    bundle.credentials.control.fingerprint === bundle.credentials.page.fingerprint
  ) {
    return false
  }
  try {
    return (
      (await fingerprintPublicKeyBundle(
        {
          control: bundle.credentials.control.publicKey,
          page: bundle.credentials.page.publicKey
        },
        subtle
      )) === bundle.fingerprint
    )
  } catch {
    return false
  }
}

class CredentialStore {
  constructor({ storage, subtle = crypto.subtle, now = Date.now }) {
    this.storage = storage
    this.subtle = subtle
    this.now = now
    this.mutation = Promise.resolve()
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

  async getForAuthentication() {
    return this.rotationCandidate || this.get()
  }

  async loadOrCreate() {
    const stored = await this.storage.get()
    if (await validateCredentialBundle(stored, this.subtle)) return stored
    const installationId = UUID_V4.test(stored?.installationId)
      ? stored.installationId
      : crypto.randomUUID()
    const bundle = await createCredentialBundle(this.subtle, installationId, this.now())
    await this.storage.set(bundle)
    return bundle
  }

  mutate(operation) {
    const result = this.mutation.then(operation)
    this.mutation = result.catch(() => {})
    return result
  }

  rotate() {
    return this.mutate(async () => {
      const current = await this.get()
      const bundle = await createCredentialBundle(this.subtle, current.installationId, this.now())
      this.rotationCandidate = bundle
      return bundle
    })
  }

  cancelRotation(candidate) {
    if (candidate && this.rotationCandidate === candidate) this.rotationCandidate = undefined
  }

  pinDesktop(desktop) {
    return this.mutate(async () => {
      const current = await this.get()
      if (current.desktop) {
        if (
          current.desktop.installationId !== desktop.installationId ||
          current.desktop.fingerprint !== desktop.fingerprint
        ) {
          throw new Error('Pinned Wren desktop identity mismatch')
        }
        return current.desktop
      }
      if (!validDesktopPin(desktop)) throw new Error('Invalid Wren desktop identity')
      if ((await fingerprintPublicKey(desktop.publicKey, this.subtle)) !== desktop.fingerprint) {
        throw new Error('Invalid Wren desktop fingerprint')
      }
      const next = { ...current, desktop: { ...desktop } }
      await this.storage.set(next)
      this.pending = Promise.resolve(next)
      return next.desktop
    })
  }

  commitAuthentication(bundle, desktop) {
    return this.mutate(async () => {
      if (this.rotationCandidate === bundle) {
        if (!validDesktopPin(desktop)) throw new Error('Invalid Wren desktop identity')
        if ((await fingerprintPublicKey(desktop.publicKey, this.subtle)) !== desktop.fingerprint) {
          throw new Error('Invalid Wren desktop fingerprint')
        }
        const next = { ...bundle, desktop: { ...desktop } }
        await this.storage.set(next)
        this.pending = Promise.resolve(next)
        this.rotationCandidate = undefined
        return next.desktop
      }
      const current = await this.get()
      if (current !== bundle) throw new Error('Companion credential changed during authentication')
      if (current.desktop) {
        if (
          current.desktop.installationId !== desktop.installationId ||
          current.desktop.fingerprint !== desktop.fingerprint
        ) {
          throw new Error('Pinned Wren desktop identity mismatch')
        }
        return current.desktop
      }
      if (!validDesktopPin(desktop)) throw new Error('Invalid Wren desktop identity')
      if ((await fingerprintPublicKey(desktop.publicKey, this.subtle)) !== desktop.fingerprint) {
        throw new Error('Invalid Wren desktop fingerprint')
      }
      const next = { ...current, desktop: { ...desktop } }
      await this.storage.set(next)
      this.pending = Promise.resolve(next)
      return next.desktop
    })
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
        reject(request.error || new Error('Unable to open Companion credential store'))
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

  set(bundle) {
    return this.request('readwrite', (store) => store.put(bundle))
  }

  remove() {
    return this.request('readwrite', (store) => store.delete(CREDENTIAL_ID))
  }
}

module.exports = {
  CHANNEL_ROLES,
  CREDENTIAL_ID,
  CredentialStore,
  IndexedDbCredentialStorage,
  bytesToBase64Url,
  createCredentialBundle,
  createRoleCredential,
  fingerprintPublicKey,
  fingerprintPublicKeyBundle,
  isPublicKey,
  validateCredentialBundle
}
