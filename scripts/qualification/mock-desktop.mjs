import { createHash, randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { createServer } from 'node:http'

const MAX_FRAME_BYTES = 1024 * 1024

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

function authPayload(challenge) {
  return new TextEncoder().encode(
    [
      'frame-extension-auth-v2',
      challenge.challengeId,
      challenge.clientNonce,
      challenge.serverNonce,
      challenge.browser,
      challenge.extensionId,
      challenge.installationId,
      challenge.fingerprint,
      String(challenge.expiresAt)
    ].join('\n')
  )
}

export class MockDesktop {
  constructor() {
    this.connections = new Set()
    this.authentications = []
    this.requests = []
    this.chainIds = new Map()
    this.server = createServer((request, response) => {
      response.writeHead(404).end()
    })
    this.server.on('upgrade', (request, socket) => this.upgrade(request, socket))
  }

  setChainId(origin, chainId) {
    this.chainIds.set(origin, chainId)
  }

  async listen() {
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', resolve)
    })
    this.port = this.server.address().port
    if (this.port === 1248) {
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
    const connection = { role, identity, state: 'hello' }
    const peer = new WebSocketPeer(
      socket,
      (text) => this.message(connection, text),
      () => this.connections.delete(connection)
    )
    connection.peer = peer
    this.connections.add(connection)
  }

  async message(connection, text) {
    let message
    try {
      message = JSON.parse(text)
    } catch {
      return connection.peer.close(1002)
    }
    if (connection.state === 'hello') return this.hello(connection, message)
    if (connection.state === 'proof') return this.proof(connection, message)
    if (connection.state !== 'authenticated') return connection.peer.close(1002)
    this.rpc(connection, message)
  }

  async hello(connection, message) {
    if (
      message?.type !== 'frame-auth' ||
      message.version !== 2 ||
      message.step !== 'hello' ||
      typeof message.clientNonce !== 'string' ||
      typeof message.installationId !== 'string' ||
      message.publicKey?.crv !== 'P-256'
    ) {
      return connection.peer.close(1002)
    }
    const fingerprint = createHash('sha256')
      .update(`${message.publicKey.x}.${message.publicKey.y}`)
      .digest('base64url')
    connection.publicKey = message.publicKey
    connection.challenge = {
      type: 'frame-auth',
      version: 2,
      step: 'challenge',
      challengeId: randomUUID(),
      clientNonce: message.clientNonce,
      serverNonce: randomBytes(32).toString('base64url'),
      browser: connection.identity.browser,
      extensionId: connection.identity.extensionId,
      installationId: message.installationId,
      fingerprint,
      expiresAt: Date.now() + 60_000
    }
    connection.state = 'proof'
    connection.peer.send(connection.challenge)
  }

  async proof(connection, message) {
    if (
      message?.type !== 'frame-auth' ||
      message.version !== 2 ||
      message.step !== 'proof' ||
      message.challengeId !== connection.challenge.challengeId ||
      typeof message.signature !== 'string'
    ) {
      return connection.peer.close(1002)
    }
    try {
      const key = await webcrypto.subtle.importKey(
        'jwk',
        connection.publicKey,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      )
      const valid = await webcrypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        Buffer.from(message.signature, 'base64url'),
        authPayload(connection.challenge)
      )
      if (!valid) return connection.peer.close(1008)
    } catch {
      return connection.peer.close(1008)
    }
    connection.state = 'authenticated'
    connection.fingerprint = connection.challenge.fingerprint
    this.authentications.push({
      role: connection.role,
      browser: connection.identity.browser,
      extensionId: connection.identity.extensionId,
      installationId: connection.challenge.installationId,
      fingerprint: connection.fingerprint
    })
    connection.peer.send({
      type: 'frame-auth',
      version: 2,
      step: 'authenticated',
      fingerprint: connection.fingerprint
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
    let result
    if (request.method === 'wallet_getEthereumChains') result = []
    else if (request.method === 'web3_clientVersion') result = 'Wren/qualification'
    else if (request.method === 'net_version') result = '1'
    else if (request.method === 'eth_chainId') {
      result = this.chainIds.get(request.__frameOrigin) || '0x1'
    } else if (request.method === 'eth_accounts' || request.method === 'eth_requestAccounts') {
      result = ['0x0000000000000000000000000000000000000001']
    } else if (request.method === 'eth_subscribe') result = `sub-${this.requests.length}`
    else if (request.method === 'eth_unsubscribe') result = true
    else result = null
    connection.peer.send({ jsonrpc: '2.0', id: request.id, result })
  }

  closePageConnections() {
    for (const connection of [...this.connections]) {
      if (connection.role === 'page' && connection.state === 'authenticated') {
        connection.peer.close(1012)
      }
    }
  }

  async close() {
    for (const connection of [...this.connections]) connection.peer.close()
    await new Promise((resolve) => this.server.close(resolve))
  }
}
