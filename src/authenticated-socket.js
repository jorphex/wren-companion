const {
  AUTH_VERSION,
  authPayload,
  pairingCode,
  parseServerAuthMessage,
  validateChallenge
} = require('./auth-protocol')
const { bytesToBase64Url } = require('./credential-store')

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3
const CHALLENGE_TIMEOUT_MS = 10 * 1000
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000 + 10 * 1000

class AuthenticatedSocket {
  constructor({
    socket,
    credentialStore,
    identity,
    cryptoApi = crypto,
    now = Date.now,
    onStatus = () => {},
    setTimer = setTimeout,
    clearTimer = clearTimeout
  }) {
    this.socket = socket
    this.credentialStore = credentialStore
    this.identity = identity
    this.cryptoApi = cryptoApi
    this.now = now
    this.onStatus = onStatus
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.readyState = CONNECTING
    this.listeners = new Map()
    this.state = 'connecting'

    socket.addEventListener('open', () => this.handleOpen())
    socket.addEventListener('message', (event) => this.handleMessage(event))
    socket.addEventListener('error', (event) => this.emit('error', event))
    socket.addEventListener('close', (event) => this.handleClose(event))
  }

  get bufferedAmount() {
    return this.socket.bufferedAmount || 0
  }

  addEventListener(type, listener, options = {}) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    const entry = { listener, once: options?.once === true }
    this.listeners.get(type).add(entry)
  }

  removeEventListener(type, listener) {
    const entries = this.listeners.get(type)
    for (const entry of entries || []) {
      if (entry.listener === listener) entries.delete(entry)
    }
  }

  emit(type, event = {}) {
    for (const entry of [...(this.listeners.get(type) || [])]) {
      if (entry.once) this.listeners.get(type).delete(entry)
      entry.listener(event)
    }
  }

  async handleOpen() {
    if (this.state !== 'connecting') return
    this.state = 'preparing'
    this.setDeadline(CHALLENGE_TIMEOUT_MS)
    this.onStatus({ status: 'preparing' })
    try {
      this.credential = await this.credentialStore.get()
      if (this.state !== 'preparing') return
      const nonce = new Uint8Array(32)
      this.cryptoApi.getRandomValues(nonce)
      this.clientNonce = bytesToBase64Url(nonce)
      this.state = 'challenge'
      this.setDeadline(CHALLENGE_TIMEOUT_MS)
      this.onStatus({ status: 'authenticating', fingerprint: this.credential.fingerprint })
      this.socket.send(
        JSON.stringify({
          type: 'frame-auth',
          version: AUTH_VERSION,
          step: 'hello',
          clientNonce: this.clientNonce,
          installationId: this.credential.installationId,
          publicKey: this.credential.publicKey
        })
      )
    } catch (error) {
      this.fail(
        'credential-error',
        error instanceof Error ? error.message : 'Credential unavailable'
      )
    }
  }

  async handleMessage(event) {
    if (this.readyState === OPEN) {
      this.emit('message', event)
      return
    }
    if (this.processing || (this.state !== 'challenge' && this.state !== 'proof')) {
      this.close(1002, 'Unexpected Frame authentication response')
      return
    }

    const parsed = parseServerAuthMessage(event.data)
    if (!parsed.success) {
      if (parsed.code === 'unsupported-version') {
        this.fail(
          'unsupported-version',
          'Frame and its Companion extension use incompatible protocols'
        )
      } else {
        this.close(1002, 'Invalid Frame authentication response')
      }
      return
    }

    this.processing = true
    try {
      const message = parsed.value
      if (message.step === 'error') {
        this.fail(message.code, message.message)
        return
      }
      if (this.state === 'challenge') {
        if (
          !validateChallenge(
            message,
            {
              browser: this.identity.browser,
              extensionId: this.identity.extensionId,
              installationId: this.credential.installationId,
              clientNonce: this.clientNonce,
              fingerprint: this.credential.fingerprint
            },
            this.now()
          )
        ) {
          this.close(1002, 'Frame authentication challenge mismatch')
          return
        }
        const code = await pairingCode(message, this.cryptoApi.subtle)
        if (this.state !== 'challenge') return
        this.onStatus({ status: 'pairing', pairingCode: code, fingerprint: message.fingerprint })
        const signature = await this.cryptoApi.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          this.credential.privateKey,
          authPayload(message)
        )
        if (signature.byteLength !== 64)
          throw new Error('Browser returned an unsupported signature')
        if (this.state !== 'challenge') return
        this.state = 'proof'
        this.setDeadline(CONSENT_TIMEOUT_MS)
        this.socket.send(
          JSON.stringify({
            type: 'frame-auth',
            version: AUTH_VERSION,
            step: 'proof',
            challengeId: message.challengeId,
            signature: bytesToBase64Url(new Uint8Array(signature))
          })
        )
        return
      }
      if (message.step !== 'authenticated' || message.fingerprint !== this.credential.fingerprint) {
        this.close(1002, 'Frame authentication result mismatch')
        return
      }

      this.state = 'authenticated'
      this.clearDeadline()
      this.readyState = OPEN
      this.onStatus({ status: 'authenticated', fingerprint: message.fingerprint })
      this.emit('open')
    } catch (error) {
      this.fail(
        'authentication-error',
        error instanceof Error ? error.message : 'Authentication failed'
      )
    } finally {
      this.processing = false
    }
  }

  fail(code, message) {
    if (this.state === 'closed' || this.state === 'closing') return
    this.failed = true
    this.onStatus({ status: 'error', code, message })
    this.close(1008, 'Frame authentication failed')
  }

  send(value) {
    if (this.readyState !== OPEN) throw new Error('Frame socket is not authenticated')
    this.socket.send(value)
  }

  close(code = 1000, reason = '') {
    if (this.readyState === CLOSED || this.state === 'closed') return
    this.state = 'closing'
    this.readyState = CLOSING
    this.clearDeadline()
    try {
      this.socket.close(code, reason)
    } catch {
      this.handleClose({ code, reason })
    }
  }

  handleClose(event) {
    if (this.state === 'closed') return
    this.clearDeadline()
    this.state = 'closed'
    this.readyState = CLOSED
    if (!this.failed) this.onStatus({ status: 'disconnected' })
    this.emit('close', event)
  }

  setDeadline(delay) {
    this.clearDeadline()
    this.deadline = this.setTimer(() => {
      this.deadline = undefined
      this.fail('authentication-timeout', 'Frame authentication timed out')
    }, delay)
  }

  clearDeadline() {
    if (this.deadline !== undefined) this.clearTimer(this.deadline)
    this.deadline = undefined
  }
}

module.exports = { AuthenticatedSocket, CLOSED, CLOSING, CONNECTING, OPEN }
