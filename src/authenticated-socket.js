const {
  AUTH_VERSION,
  authPayload,
  pairingCode,
  parseServerAuthMessage,
  sameExchange,
  validateChallenge,
  verifyDesktopProof
} = require('./auth-protocol')
const { bytesToBase64Url } = require('./credential-store')
const { clearTimer: clearBrowserTimer, setTimer: setBrowserTimer } = require('./timers')

const CONNECTING = 0
const OPEN = 1
const CLOSING = 2
const CLOSED = 3
const CHALLENGE_TIMEOUT_MS = 10 * 1000
const CONSENT_TIMEOUT_MS = 5 * 60 * 1000 + 10 * 1000

const samePublicKey = (left, right) => JSON.stringify(left) === JSON.stringify(right)

class AuthenticatedSocket {
  constructor({
    socket,
    credentialStore,
    channelRole,
    cryptoApi = crypto,
    now = Date.now,
    onStatus = () => {},
    setTimer = setBrowserTimer,
    clearTimer = clearBrowserTimer
  }) {
    if (channelRole !== 'control' && channelRole !== 'page') {
      throw new Error('Invalid Companion authentication channel role')
    }
    this.socket = socket
    this.credentialStore = credentialStore
    this.channelRole = channelRole
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
    this.listeners.get(type).add({ listener, once: options?.once === true })
  }

  removeEventListener(type, listener) {
    for (const entry of this.listeners.get(type) || []) {
      if (entry.listener === listener) this.listeners.get(type).delete(entry)
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
      this.bundle = await this.credentialStore.getForAuthentication()
      this.credential = this.bundle.credentials[this.channelRole]
      if (this.state !== 'preparing') return
      const nonce = new Uint8Array(32)
      this.cryptoApi.getRandomValues(nonce)
      this.clientNonce = bytesToBase64Url(nonce)
      this.state = 'challenge'
      this.setDeadline(CHALLENGE_TIMEOUT_MS)
      this.onStatus({ status: 'authenticating' })
      this.socket.send(
        JSON.stringify({
          type: 'frame-auth',
          version: AUTH_VERSION,
          step: 'hello',
          peerKind: 'companion',
          channelRole: this.channelRole,
          clientNonce: this.clientNonce,
          client: {
            installationId: this.bundle.installationId,
            fingerprint: this.bundle.fingerprint,
            roleFingerprint: this.credential.fingerprint,
            publicKeys: {
              control: this.bundle.credentials.control.publicKey,
              page: this.bundle.credentials.page.publicKey
            }
          }
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
    if (this.processing || (this.state !== 'challenge' && this.state !== 'response')) {
      this.close(1002, 'Unexpected Wren authentication response')
      return
    }
    const parsed = parseServerAuthMessage(event.data)
    if (!parsed.success) {
      if (parsed.code === 'unsupported-version') {
        this.fail(
          'upgrade-required',
          'This Companion version needs a newer Wren desktop to verify its identity. Update Wren, then reconnect.'
        )
      } else {
        this.close(1002, 'Invalid Wren authentication response')
      }
      return
    }

    this.processing = true
    try {
      const message = parsed.value
      if (message.step === 'error') {
        if (message.code === 'unsupported-version') {
          this.fail(
            'upgrade-required',
            'This Companion version needs a newer Wren desktop to verify its identity. Update Wren, then reconnect.'
          )
        } else {
          this.fail(message.code, message.message)
        }
        return
      }
      if (this.state === 'challenge') {
        if (
          !validateChallenge(
            message,
            {
              channelRole: this.channelRole,
              installationId: this.bundle.installationId,
              clientNonce: this.clientNonce,
              fingerprint: this.bundle.fingerprint,
              roleFingerprint: this.credential.fingerprint
            },
            this.now()
          )
        ) {
          this.close(1002, 'Wren authentication challenge mismatch')
          return
        }
        if (
          this.bundle.desktop &&
          (this.bundle.desktop.installationId !== message.desktop.installationId ||
            this.bundle.desktop.fingerprint !== message.desktop.fingerprint ||
            !samePublicKey(this.bundle.desktop.publicKey, message.desktop.publicKey))
        ) {
          this.fail('pinned-desktop-mismatch', 'The connected Wren identity changed')
          return
        }
        if (
          !(await verifyDesktopProof(
            message,
            'desktop-challenge',
            message.desktop.publicKey,
            this.cryptoApi.subtle
          ))
        ) {
          this.close(1002, 'Invalid Wren desktop proof')
          return
        }
        this.challenge = message
        if (!this.bundle.desktop) {
          if (this.channelRole !== 'control') {
            this.fail('invalid-state', 'Pair Wren using the Companion control connection first')
            return
          }
          this.onStatus({
            status: 'pairing',
            pairingCode: await pairingCode(message, this.cryptoApi.subtle)
          })
        }
        const signature = await this.cryptoApi.subtle.sign(
          { name: 'ECDSA', hash: 'SHA-256' },
          this.credential.privateKey,
          authPayload(message, 'client-response')
        )
        if (signature.byteLength !== 64)
          throw new Error('Browser returned an unsupported signature')
        if (this.state !== 'challenge') return
        this.state = 'response'
        this.setDeadline(CONSENT_TIMEOUT_MS)
        this.socket.send(
          JSON.stringify({
            type: 'frame-auth',
            version: AUTH_VERSION,
            step: 'response',
            peerKind: 'companion',
            channelRole: this.channelRole,
            challengeId: message.challengeId,
            signature: bytesToBase64Url(new Uint8Array(signature))
          })
        )
        return
      }

      if (
        !sameExchange(message, this.challenge) ||
        this.now() >= this.challenge.expiresAt ||
        !(await verifyDesktopProof(
          message,
          'desktop-ack',
          this.challenge.desktop.publicKey,
          this.cryptoApi.subtle
        ))
      ) {
        this.close(1002, 'Wren authentication acknowledgement mismatch')
        return
      }
      if (!this.bundle.desktop) {
        await this.credentialStore.commitAuthentication(this.bundle, {
          installationId: message.desktop.installationId,
          fingerprint: message.desktop.fingerprint,
          publicKey: this.challenge.desktop.publicKey,
          pinnedAt: this.now()
        })
      }
      if (this.state !== 'response') return
      this.state = 'authenticated'
      this.clearDeadline()
      this.readyState = OPEN
      this.onStatus({ status: 'authenticated' })
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
    this.onStatus({
      status: code === 'upgrade-required' ? 'upgrade-required' : 'error',
      code,
      message
    })
    this.close(1008, 'Wren authentication failed')
  }

  send(value) {
    if (this.readyState !== OPEN) throw new Error('Wren socket is not authenticated')
    this.socket.send(value)
  }

  close(code = 1000, reason = '') {
    if (this.readyState === CLOSED || this.state === 'closed') return
    if (this.state !== 'authenticated') this.credentialStore.cancelRotation(this.bundle)
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
    if (this.state !== 'authenticated') this.credentialStore.cancelRotation(this.bundle)
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
      this.fail('authentication-timeout', 'Wren authentication timed out')
    }, delay)
  }

  clearDeadline() {
    if (this.deadline !== undefined) this.clearTimer(this.deadline)
    this.deadline = undefined
  }
}

module.exports = { AuthenticatedSocket, CLOSED, CLOSING, CONNECTING, OPEN }
