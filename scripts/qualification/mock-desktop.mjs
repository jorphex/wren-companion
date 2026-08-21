import { createHash, randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { createServer } from 'node:http'

const MAX_FRAME_BYTES = 1024 * 1024
const AUTH_PROTOCOL = 'wren-companion-auth'
export const QUALIFICATION_AUTH_VERSION = 3
const AUTH_DOMAIN = 'wren-companion-auth-v3\0'
const CHANNEL_ROLES = new Set(['control', 'page'])
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

function exactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isBase64Url(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(value)) return false
  const decoded = Buffer.from(value, 'base64url')
  return decoded.length === bytes && decoded.toString('base64url') === value
}

function isPublicKey(value) {
  return (
    exactKeys(value, ['kty', 'crv', 'x', 'y', 'ext', 'key_ops']) &&
    value.kty === 'EC' &&
    value.crv === 'P-256' &&
    isBase64Url(value.x, 32) &&
    isBase64Url(value.y, 32) &&
    value.ext === true &&
    Array.isArray(value.key_ops) &&
    value.key_ops.length === 1 &&
    value.key_ops[0] === 'verify'
  )
}

async function sha256Base64Url(value) {
  const digest = await webcrypto.subtle.digest(
    'SHA-256',
    typeof value === 'string' ? new TextEncoder().encode(value) : value
  )
  return Buffer.from(digest).toString('base64url')
}

async function keyFingerprint(publicKey) {
  return sha256Base64Url(`${publicKey.x}.${publicKey.y}`)
}

async function bundleFingerprint(publicKeys) {
  return sha256Base64Url(
    `wren-companion-key-bundle-v3\0${await keyFingerprint(publicKeys.control)}.${await keyFingerprint(publicKeys.page)}`
  )
}

function transcriptObject(challenge, role) {
  return {
    protocol: AUTH_PROTOCOL,
    version: QUALIFICATION_AUTH_VERSION,
    peerKind: 'companion',
    role,
    channelRole: challenge.channelRole,
    desktop: {
      installationId: challenge.desktop.installationId,
      fingerprint: challenge.desktop.fingerprint
    },
    client: {
      installationId: challenge.client.installationId,
      fingerprint: challenge.client.fingerprint,
      roleFingerprint: challenge.client.roleFingerprint
    },
    challengeId: challenge.challengeId,
    desktopNonce: challenge.desktopNonce,
    clientNonce: challenge.clientNonce,
    expiresAt: challenge.expiresAt
  }
}

function authPayload(challenge, role) {
  return new TextEncoder().encode(
    `${AUTH_DOMAIN}${JSON.stringify(transcriptObject(challenge, role))}`
  )
}

async function generateDesktopIdentity() {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
    'sign',
    'verify'
  ])
  const exported = await webcrypto.subtle.exportKey('jwk', pair.publicKey)
  const publicKey = {
    kty: exported.kty,
    crv: exported.crv,
    x: exported.x,
    y: exported.y,
    ext: true,
    key_ops: ['verify']
  }
  if (!isPublicKey(publicKey)) throw new Error('Unable to create qualification desktop identity')
  return {
    installationId: randomUUID(),
    fingerprint: await keyFingerprint(publicKey),
    privateKey: pair.privateKey,
    publicKey
  }
}

function frame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  const header = body.length < 126 ? Buffer.from([0x80 | opcode, body.length]) : Buffer.alloc(4)
  if (body.length >= 126) {
    header[0] = 0x80 | opcode
    header[1] = 126
    header.writeUInt16BE(body.length, 2)
  }
  return Buffer.concat([header, body])
}

class WebSocketPeer {
  constructor(socket, onText, onClose) {
    this.socket = socket
    this.onText = onText
    this.onClose = onClose
    this.buffer = Buffer.alloc(0)
    this.closed = false
    socket.on('data', (chunk) => this.read(chunk))
    socket.on('close', () => this.finish())
    socket.on('error', () => this.finish())
  }

  read(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk])
    while (this.buffer.length >= 2) {
      const first = this.buffer[0]
      const second = this.buffer[1]
      const opcode = first & 0x0f
      if ((first & 0x80) === 0 || (second & 0x80) === 0) return this.close(1002)
      let length = second & 0x7f
      let offset = 2
      if (length === 126) {
        if (this.buffer.length < 4) return
        length = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (length === 127) {
        if (this.buffer.length < 10) return
        const large = this.buffer.readBigUInt64BE(2)
        if (large > BigInt(MAX_FRAME_BYTES)) return this.close(1009)
        length = Number(large)
        offset = 10
      }
      if (length > MAX_FRAME_BYTES) return this.close(1009)
      if (this.buffer.length < offset + 4 + length) return
      const mask = this.buffer.subarray(offset, offset + 4)
      const payload = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + length))
      this.buffer = this.buffer.subarray(offset + 4 + length)
      for (let index = 0; index < payload.length; index += 1) payload[index] ^= mask[index % 4]
      if (opcode === 0x8) return this.close(1000)
      if (opcode === 0x9) {
        this.socket.write(frame(0xa, payload))
      } else if (opcode === 0x1) {
        this.onText(payload.toString('utf8'))
      } else {
        return this.close(1003)
      }
    }
  }

  send(value) {
    if (!this.closed) this.socket.write(frame(0x1, JSON.stringify(value)))
  }

  close(code = 1000) {
    if (this.closed) return
    const payload = Buffer.alloc(2)
    payload.writeUInt16BE(code)
    this.socket.end(frame(0x8, payload))
    this.finish()
  }

  finish() {
    if (this.closed) return
    this.closed = true
    this.onClose()
  }
}

function extensionIdentity(origin) {
  try {
    const url = new URL(origin)
    if (url.protocol === 'chrome-extension:' && /^[a-p]{32}$/u.test(url.hostname)) {
      return { browser: 'chrome', extensionId: url.hostname }
    }
    if (url.protocol === 'moz-extension:' && url.hostname) {
      return { browser: 'firefox', extensionId: url.hostname }
    }
  } catch {
    return undefined
  }
}

export class MockDesktop {
  constructor({
    availableChains = [],
    holdAuthentication = false,
    port = 0,
    allowProductionPort = false
  } = {}) {
    this.connections = new Set()
    this.authentications = []
    this.requests = []
    this.chainIds = new Map()
    this.authorizedOrigins = new Set()
    this.availableChains = availableChains
    this.holdAuthentication = holdAuthentication
    this.portPreference = port
    this.allowProductionPort = allowProductionPort
    this.pendingAuthentications = new Set()
    this.pairings = new Map()
    this.authenticationFrames = []
    this.server = createServer((request, response) => {
      response.writeHead(404).end()
    })
    this.server.on('upgrade', (request, socket) => this.upgrade(request, socket))
  }

  setChainId(origin, chainId) {
    this.chainIds.set(origin, chainId)
  }

  identity(browser, role = 'control') {
    return [...this.connections].find(
      (connection) => connection.identity.browser === browser && connection.role === role
    )?.identity
  }

  releaseAuthentication() {
    this.holdAuthentication = false
    for (const connection of [...this.pendingAuthentications]) {
      this.pendingAuthentications.delete(connection)
      this.authenticate(connection).catch(() => connection.peer.close(1011))
    }
  }

  async listen() {
    this.desktopIdentity = await generateDesktopIdentity()
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(this.portPreference, '127.0.0.1', resolve)
    })
    this.port = this.server.address().port
    if (this.port === 1248 && !this.allowProductionPort) {
      await this.close()
      throw new Error("The isolated desktop selected Wren's live port")
    }
    return this.port
  }

  upgrade(request, socket) {
    const address = socket.remoteAddress
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const identity = extensionIdentity(request.headers.origin)
    const role = url.searchParams.get('role')
    if (
      !['127.0.0.1', '::ffff:127.0.0.1'].includes(address) ||
      url.searchParams.get('identity') !== 'frame-extension' ||
      !['control', 'page'].includes(role) ||
      !identity ||
      request.headers.upgrade?.toLowerCase() !== 'websocket' ||
      typeof request.headers['sec-websocket-key'] !== 'string'
    ) {
      socket.destroy()
      return
    }
    const accept = createHash('sha1')
      .update(`${request.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
      .digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    )
    const connection = { role, identity, state: 'hello', subscriptions: new Map() }
    const peer = new WebSocketPeer(
      socket,
      (text) => this.message(connection, text),
      () => {
        this.connections.delete(connection)
        this.pendingAuthentications.delete(connection)
      }
    )
    connection.peer = peer
    this.connections.add(connection)
  }

  async message(connection, text) {
    if (connection.processing) return connection.peer.close(1002)
    let message
    try {
      message = JSON.parse(text)
    } catch {
      return connection.peer.close(1002)
    }
    connection.processing = true
    try {
      if (connection.state === 'hello') return await this.hello(connection, message)
      if (connection.state === 'proof') return await this.proof(connection, message)
      if (connection.state !== 'authenticated') return connection.peer.close(1002)
      this.rpc(connection, message)
    } finally {
      connection.processing = false
    }
  }

  async hello(connection, message) {
    if (
      !exactKeys(message, [
        'type',
        'version',
        'step',
        'peerKind',
        'channelRole',
        'clientNonce',
        'client'
      ]) ||
      message.type !== 'frame-auth' ||
      message.version !== QUALIFICATION_AUTH_VERSION ||
      message.step !== 'hello' ||
      message.peerKind !== 'companion' ||
      !CHANNEL_ROLES.has(message.channelRole) ||
      message.channelRole !== connection.role ||
      !isBase64Url(message.clientNonce, 32) ||
      !exactKeys(message.client, [
        'installationId',
        'fingerprint',
        'roleFingerprint',
        'publicKeys'
      ]) ||
      !UUID_V4.test(message.client.installationId) ||
      !isBase64Url(message.client.fingerprint, 32) ||
      !isBase64Url(message.client.roleFingerprint, 32) ||
      !exactKeys(message.client.publicKeys, ['control', 'page']) ||
      !isPublicKey(message.client.publicKeys.control) ||
      !isPublicKey(message.client.publicKeys.page)
    ) {
      return connection.peer.close(1002)
    }
    const controlFingerprint = await keyFingerprint(message.client.publicKeys.control)
    const pageFingerprint = await keyFingerprint(message.client.publicKeys.page)
    if (
      controlFingerprint === pageFingerprint ||
      message.client.roleFingerprint !==
        (message.channelRole === 'control' ? controlFingerprint : pageFingerprint) ||
      message.client.fingerprint !== (await bundleFingerprint(message.client.publicKeys))
    ) {
      return connection.peer.close(1002)
    }
    connection.client = message.client
    connection.rolePublicKey = message.client.publicKeys[connection.role]
    connection.challenge = {
      type: 'frame-auth',
      version: QUALIFICATION_AUTH_VERSION,
      step: 'challenge',
      peerKind: 'companion',
      channelRole: connection.role,
      challengeId: randomUUID(),
      desktopNonce: randomBytes(32).toString('base64url'),
      clientNonce: message.clientNonce,
      expiresAt: Date.now() + 60_000,
      desktop: {
        installationId: this.desktopIdentity.installationId,
        fingerprint: this.desktopIdentity.fingerprint,
        publicKey: this.desktopIdentity.publicKey
      },
      client: {
        installationId: message.client.installationId,
        fingerprint: message.client.fingerprint,
        roleFingerprint: message.client.roleFingerprint
      }
    }
    const signature = await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.desktopIdentity.privateKey,
      authPayload(connection.challenge, 'desktop-challenge')
    )
    connection.challenge.signature = Buffer.from(signature).toString('base64url')
    connection.state = 'proof'
    this.authenticationFrames.push({
      direction: 'desktop-to-companion',
      role: connection.role,
      step: 'challenge',
      version: QUALIFICATION_AUTH_VERSION,
      signed: true
    })
    connection.peer.send(connection.challenge)
  }

  async proof(connection, message) {
    if (
      !exactKeys(message, [
        'type',
        'version',
        'step',
        'peerKind',
        'channelRole',
        'challengeId',
        'signature'
      ]) ||
      message.type !== 'frame-auth' ||
      message.version !== QUALIFICATION_AUTH_VERSION ||
      message.step !== 'response' ||
      message.peerKind !== 'companion' ||
      message.channelRole !== connection.role ||
      message.challengeId !== connection.challenge.challengeId ||
      !isBase64Url(message.signature, 64) ||
      Date.now() >= connection.challenge.expiresAt
    ) {
      return connection.peer.close(1002)
    }
    try {
      const key = await webcrypto.subtle.importKey(
        'jwk',
        connection.rolePublicKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      )
      const valid = await webcrypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        Buffer.from(message.signature, 'base64url'),
        authPayload(connection.challenge, 'client-response')
      )
      if (!valid) return connection.peer.close(1008)
    } catch {
      return connection.peer.close(1008)
    }
    this.authenticationFrames.push({
      direction: 'companion-to-desktop',
      role: connection.role,
      step: 'response',
      version: QUALIFICATION_AUTH_VERSION,
      signed: true
    })
    const pairing = this.pairings.get(this.pairingKey(connection))
    if (connection.role === 'page' && pairing !== connection.client.fingerprint) {
      connection.peer.send({
        type: 'frame-auth',
        version: QUALIFICATION_AUTH_VERSION,
        step: 'error',
        code: 'invalid-state',
        message: 'Pair Wren using the Companion control connection first'
      })
      return connection.peer.close(1008)
    }
    if (this.holdAuthentication) {
      connection.state = 'waiting-consent'
      this.pendingAuthentications.add(connection)
      return
    }
    await this.authenticate(connection)
  }

  pairingKey(connection) {
    return `${connection.identity.browser}:${connection.identity.extensionId}:${connection.client.installationId}`
  }

  async authenticate(connection) {
    if (connection.peer.closed) return
    connection.state = 'authenticating'
    const acknowledgement = {
      type: 'frame-auth',
      version: QUALIFICATION_AUTH_VERSION,
      step: 'authenticated',
      peerKind: 'companion',
      channelRole: connection.role,
      challengeId: connection.challenge.challengeId,
      desktopNonce: connection.challenge.desktopNonce,
      clientNonce: connection.challenge.clientNonce,
      expiresAt: connection.challenge.expiresAt,
      desktop: {
        installationId: this.desktopIdentity.installationId,
        fingerprint: this.desktopIdentity.fingerprint
      },
      client: connection.challenge.client
    }
    const signature = await webcrypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.desktopIdentity.privateKey,
      authPayload(acknowledgement, 'desktop-ack')
    )
    acknowledgement.signature = Buffer.from(signature).toString('base64url')
    if (connection.role === 'control') {
      this.pairings.set(this.pairingKey(connection), connection.client.fingerprint)
    }
    this.authenticationFrames.push({
      direction: 'desktop-to-companion',
      role: connection.role,
      step: 'authenticated',
      version: QUALIFICATION_AUTH_VERSION,
      signed: true
    })
    connection.peer.send(acknowledgement)
    connection.state = 'authenticated'
    this.authentications.push({
      protocolVersion: QUALIFICATION_AUTH_VERSION,
      role: connection.role,
      browser: connection.identity.browser,
      extensionId: connection.identity.extensionId,
      installationId: connection.client.installationId,
      fingerprint: connection.client.fingerprint,
      roleFingerprint: connection.client.roleFingerprint,
      desktopFingerprint: this.desktopIdentity.fingerprint
    })
  }

  rpc(connection, request) {
    if (
      request?.jsonrpc !== '2.0' ||
      (typeof request.id !== 'string' && typeof request.id !== 'number') ||
      typeof request.method !== 'string'
    ) {
      return connection.peer.close(1002)
    }
    this.requests.push({
      role: connection.role,
      method: request.method,
      origin: request.__frameOrigin,
      connecting: request.__extensionConnecting === true
    })
    if (connection.role === 'control' && request.__frameOrigin !== undefined) {
      return connection.peer.close(1008)
    }
    if (connection.role === 'page') {
      try {
        const origin = new URL(request.__frameOrigin)
        if (
          !['http:', 'https:'].includes(origin.protocol) ||
          origin.origin !== request.__frameOrigin
        ) {
          return connection.peer.close(1008)
        }
      } catch {
        return connection.peer.close(1008)
      }
    }
    const sendResult = (result) => connection.peer.send({ jsonrpc: '2.0', id: request.id, result })
    let result
    if (request.method === 'wallet_getEthereumChains') result = this.availableChains
    else if (request.method === 'web3_clientVersion') result = 'Wren/qualification'
    else if (request.method === 'net_version') result = '1'
    else if (request.method === 'eth_chainId') {
      result = this.chainIds.get(request.__frameOrigin) || '0x1'
    } else if (request.method === 'eth_accounts') {
      result = this.authorizedOrigins.has(request.__frameOrigin)
        ? ['0x0000000000000000000000000000000000000001']
        : []
    } else if (request.method === 'eth_requestAccounts') {
      result = ['0x0000000000000000000000000000000000000001']
      this.authorizedOrigins.add(request.__frameOrigin)
      if (connection.identity.browser === 'chrome') {
        this.sendAccountNotifications(request.__frameOrigin, result)
      }
      sendResult(result)
      if (connection.identity.browser === 'firefox') {
        this.sendAccountNotifications(request.__frameOrigin, result)
      }
      return
    } else if (request.method === 'eth_subscribe') {
      result = `sub-${this.requests.length}`
      connection.subscriptions.set(result, {
        event: request.params?.[0],
        origin: request.__frameOrigin
      })
    } else if (request.method === 'eth_unsubscribe') {
      result = connection.subscriptions.delete(request.params?.[0])
    } else result = null
    sendResult(result)
  }

  sendAccountNotifications(origin, accounts) {
    for (const connection of this.connections) {
      if (connection.role !== 'page' || connection.state !== 'authenticated') continue
      for (const [subscription, entry] of connection.subscriptions) {
        if (entry.event !== 'accountsChanged' || entry.origin !== origin) continue
        connection.peer.send({
          jsonrpc: '2.0',
          method: 'eth_subscription',
          params: { subscription, result: accounts }
        })
      }
    }
  }

  closePageConnections() {
    for (const connection of [...this.connections]) {
      if (connection.role === 'page' && connection.state === 'authenticated') {
        connection.peer.close(1012)
      }
    }
  }

  async replaceDesktopIdentity() {
    this.desktopIdentity = await generateDesktopIdentity()
    this.pairings.clear()
    for (const connection of [...this.connections]) connection.peer.close(1012)
    return this.desktopIdentity.fingerprint
  }

  async close() {
    for (const connection of [...this.connections]) connection.peer.close()
    await new Promise((resolve) => this.server.close(resolve))
  }
}
