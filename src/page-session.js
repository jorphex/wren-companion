const {
  MAX_MESSAGE_BYTES,
  errorResponse,
  parseDesktopMessage,
  parsePageRequest,
  serializedSize,
  validId
} = require('./protocol')
const { clearTimer: clearBrowserTimer, setTimer: setBrowserTimer } = require('./timers')

const MAX_PENDING_REQUESTS = 64
const MAX_QUEUED_REQUESTS = 64
const MAX_QUEUED_BYTES = 512 * 1024
const MAX_SOCKET_BUFFERED_BYTES = 2 * 1024 * 1024
const MAX_CONTROL_REQUESTS = 4
const CONTROL_REQUEST_TIMEOUT_MS = 5 * 60 * 1000
const REQUEST_RATE_LIMIT = 300
const REQUEST_RATE_WINDOW_MS = 10 * 1000
const RECONNECT_DELAYS = [250, 500, 1000, 2000, 5000]
const WEB_SOCKET_OPEN = 1

function derivePageOwner(sender) {
  if (!sender || !sender.tab || !Number.isInteger(sender.tab.id) || sender.tab.id < 0) return
  if (!Number.isInteger(sender.frameId) || sender.frameId < 0) return
  if (typeof sender.url !== 'string' || sender.url.length > 4096) return

  let url
  try {
    url = new URL(sender.url)
  } catch {
    return
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return

  let origin = url.origin
  if (sender.origin !== undefined) {
    if (typeof sender.origin !== 'string' || sender.origin.length > 2048) return
    let senderOrigin
    try {
      senderOrigin = new URL(sender.origin)
    } catch {
      return
    }
    if (
      (senderOrigin.protocol !== 'http:' && senderOrigin.protocol !== 'https:') ||
      senderOrigin.origin !== url.origin
    ) {
      return
    }
    origin = senderOrigin.origin
  }

  const documentId =
    typeof sender.documentId === 'string' && sender.documentId.length <= 256
      ? sender.documentId
      : undefined

  return Object.freeze({
    tabId: sender.tab.id,
    frameId: sender.frameId,
    origin,
    ...(documentId && { documentId })
  })
}

class PageSession {
  constructor({
    port,
    owner,
    createSocket,
    onStateChange = () => {},
    socketReady = () => true,
    reserveRequest = () => true,
    releaseRequest = () => {},
    randomId = () => crypto.randomUUID(),
    now = Date.now,
    setTimer = setBrowserTimer,
    clearTimer = clearBrowserTimer
  }) {
    this.port = port
    this.owner = owner
    this.createSocket = createSocket
    this.onStateChange = onStateChange
    this.socketReady = socketReady
    this.reserveRequest = reserveRequest
    this.releaseRequest = releaseRequest
    this.randomId = randomId
    this.now = now
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.pending = new Map()
    this.queue = []
    this.queuedBytes = 0
    this.pageIds = new Set()
    this.requestTimes = []
    this.reconnectAttempt = 0
    this.everUsed = false
    this.closed = false
    this.connected = false
    this.pageConnectionConfirmed = false
    this.currentChain = ''

    this.handlePortMessage = this.handlePortMessage.bind(this)
    this.handlePortDisconnect = this.handlePortDisconnect.bind(this)
    port.onMessage.addListener(this.handlePortMessage)
    port.onDisconnect.addListener(this.handlePortDisconnect)
  }

  handlePortMessage(message) {
    if (
      this.closed ||
      !message ||
      typeof message !== 'object' ||
      Array.isArray(message) ||
      Object.keys(message).some((key) => key !== 'type' && key !== 'payload')
    ) {
      return
    }

    if (message.type === 'connect' && Object.keys(message).length === 1) {
      this.everUsed = true
      this.ensureSocket()
      return
    }
    if (message.type !== 'rpc' && message.type !== 'connection') return

    const parsed = parsePageRequest(message.payload)
    if (!parsed.success) return this.postRpc(parsed.error)

    const request = parsed.value
    const connectionMessage = message.type === 'connection'
    if (connectionMessage && request.method !== 'net_version' && request.method !== 'eth_chainId') {
      return this.postRpc(errorResponse(request.id, -32600, 'Unsupported connection method'))
    }
    if (!this.allowRequest()) {
      return this.postRpc(errorResponse(request.id, -32005, 'Request rate limit exceeded'))
    }
    if (this.pageIds.size >= MAX_PENDING_REQUESTS) {
      return this.postRpc(errorResponse(request.id, -32005, 'Too many pending requests'))
    }
    if (this.pageIds.has(request.id)) {
      return this.postRpc(errorResponse(request.id, -32600, 'Duplicate request id'))
    }

    this.pageIds.add(request.id)
    const transportId = `frame-page:${this.randomId()}`
    this.sendRequest(
      { ...request, id: transportId },
      {
        type: 'page',
        pageId: request.id,
        method: request.method,
        connectionMessage
      },
      connectionMessage
    )
  }

  allowRequest() {
    const now = this.now()
    const cutoff = now - REQUEST_RATE_WINDOW_MS
    while (this.requestTimes.length && this.requestTimes[0] <= cutoff) this.requestTimes.shift()
    if (this.requestTimes.length >= REQUEST_RATE_LIMIT) return false
    this.requestTimes.push(now)
    return true
  }

  requestControl(method, params = [], connectionMessage = false) {
    if (this.closed) return Promise.reject(new Error('Page session closed'))
    const activeControls = [...this.pending.values()].filter(
      ({ type }) => type === 'control'
    ).length
    if (activeControls >= MAX_CONTROL_REQUESTS) {
      return Promise.reject(Object.assign(new Error('Too many control requests'), { code: -32005 }))
    }

    const id = `frame-control:${this.randomId()}`
    const request = { jsonrpc: '2.0', id, method, params }

    return new Promise((resolve, reject) => {
      const timer = this.setTimer(() => {
        const pending = this.pending.get(id)
        if (!pending) return
        this.pending.delete(id)
        this.removeQueued(id)
        this.releaseEntry(pending)
        reject(Object.assign(new Error('Wren control request timed out'), { code: -32002 }))
      }, CONTROL_REQUEST_TIMEOUT_MS)
      this.sendRequest(
        request,
        { type: 'control', method, resolve, reject, timer },
        connectionMessage
      )
    })
  }

  sendRequest(request, pending, connectionMessage = false) {
    const load = {
      ...request,
      __frameOrigin: this.owner.origin,
      ...(connectionMessage && { __extensionConnecting: true })
    }
    const serialized = JSON.stringify(load)
    const bytes = new TextEncoder().encode(serialized).byteLength

    if (bytes > MAX_MESSAGE_BYTES) {
      return this.rejectEntry(request.id, pending, -32600, 'Request exceeds transport limit')
    }
    if (this.pending.size >= MAX_PENDING_REQUESTS + MAX_CONTROL_REQUESTS) {
      return this.rejectEntry(request.id, pending, -32005, 'Too many pending requests')
    }
    if (this.pending.has(request.id)) {
      return this.rejectEntry(request.id, pending, -32600, 'Duplicate transport request id')
    }
    if (!this.reserveRequest(bytes)) {
      return this.rejectEntry(request.id, pending, -32005, 'Extension request capacity exceeded')
    }

    this.pending.set(request.id, { ...pending, bytes })
    this.everUsed = true

    if (this.socket?.readyState === WEB_SOCKET_OPEN) {
      if (!this.sendSocket(this.socket, serialized, bytes)) {
        this.closeSocket(this.socket, 1013, 'Wren request buffer exceeded')
      }
      return
    }

    if (this.queue.length >= MAX_QUEUED_REQUESTS || this.queuedBytes + bytes > MAX_QUEUED_BYTES) {
      this.pending.delete(request.id)
      this.releaseEntry({ ...pending, bytes })
      return this.rejectEntry(request.id, pending, -32005, 'Connection queue limit exceeded')
    }

    this.queue.push({ id: request.id, serialized, bytes })
    this.queuedBytes += bytes
    this.ensureSocket()
  }

  ensureSocket() {
    if (this.closed || this.socket) return
    this.clearReconnectTimer()
    if (!this.socketReady()) return

    let socket
    try {
      socket = this.createSocket(this)
    } catch {
      this.rejectPending(-32005, 'Wren connection capacity exceeded')
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    socket.addEventListener('open', () => this.handleSocketOpen(socket))
    socket.addEventListener('message', (event) => this.handleSocketMessage(socket, event))
    socket.addEventListener('close', () => this.handleSocketClose(socket))
    socket.addEventListener('error', () => {})
  }

  handleSocketOpen(socket) {
    if (this.closed || socket !== this.socket) return
    this.reconnectAttempt = 0
    this.setConnected(true)

    const queue = this.queue
    this.queue = []
    this.queuedBytes = 0
    for (const item of queue) {
      if (this.pending.has(item.id) && !this.sendSocket(socket, item.serialized, item.bytes)) {
        this.closeSocket(socket, 1013, 'Wren request buffer exceeded')
        break
      }
    }
  }

  sendSocket(socket, serialized, bytes) {
    if ((socket.bufferedAmount || 0) + bytes > MAX_SOCKET_BUFFERED_BYTES) return false
    try {
      socket.send(serialized)
      return true
    } catch {
      return false
    }
  }

  closeSocket(socket, code, reason) {
    try {
      socket.close(code, reason)
    } catch {
      this.handleSocketClose(socket)
    }
  }

  handleSocketMessage(socket, event) {
    if (this.closed || socket !== this.socket) return
    const parsed = parseDesktopMessage(event.data)
    if (!parsed.success) {
      this.closeSocket(socket, 1002, 'Invalid Wren response')
      return
    }

    const payload = parsed.value
    if (validId(payload.id)) {
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      this.releaseEntry(pending)

      if (pending.type === 'control') {
        this.clearTimer(pending.timer)
        if (payload.error)
          pending.reject(Object.assign(new Error(payload.error.message), payload.error))
        else {
          this.recordCurrentChain(pending.method, payload.result)
          pending.resolve(payload.result)
        }
      } else {
        if (!payload.error) this.confirmPageActivity(pending.method, payload.result)
        this.pageIds.delete(pending.pageId)
        this.postRpc({ ...payload, id: pending.pageId })
      }
      return
    }

    this.safePost({ type: 'rpc', payload })
  }

  handleSocketClose(socket) {
    if (socket !== this.socket) return
    this.socket = undefined
    this.setConnected(false)
    this.rejectPending(4900, 'Wren disconnected')
    if (!this.closed && this.everUsed) this.scheduleReconnect()
  }

  resumeTransport() {
    if (this.closed || !this.everUsed) return
    this.reconnectAttempt = 0
    this.clearReconnectTimer()
    this.ensureSocket()
  }

  resetTransport() {
    if (this.closed) return
    this.clearReconnectTimer()
    const socket = this.socket
    this.socket = undefined
    this.setConnected(false)
    this.rejectPending(4900, 'Wren disconnected')
    if (socket) this.closeSocket(socket, 1000, 'Companion authentication reset')
  }

  scheduleReconnect() {
    if (this.closed || this.reconnectTimer || !this.everUsed) return
    const index = Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
    this.reconnectAttempt += 1
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = undefined
      this.ensureSocket()
    }, RECONNECT_DELAYS[index])
  }

  clearReconnectTimer() {
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer)
    this.reconnectTimer = undefined
  }

  removeQueued(id) {
    const index = this.queue.findIndex((item) => item.id === id)
    if (index < 0) return
    const [item] = this.queue.splice(index, 1)
    this.queuedBytes = Math.max(0, this.queuedBytes - item.bytes)
  }

  rejectEntry(id, pending, code, message) {
    if (pending.type === 'control') {
      this.clearTimer(pending.timer)
      pending.reject(Object.assign(new Error(message), { code }))
    } else {
      this.pageIds.delete(pending.pageId)
      this.postRpc(errorResponse(pending.pageId ?? id, code, message))
    }
  }

  releaseEntry(pending) {
    if (pending.bytes) this.releaseRequest(pending.bytes)
  }

  rejectPending(code, message) {
    const pending = [...this.pending.entries()]
    this.pending.clear()
    this.pageIds.clear()
    this.queue = []
    this.queuedBytes = 0
    for (const [id, entry] of pending) {
      this.releaseEntry(entry)
      this.rejectEntry(id, entry, code, message)
    }
  }

  postRpc(payload) {
    if (serializedSize(payload) <= MAX_MESSAGE_BYTES) this.safePost({ type: 'rpc', payload })
  }

  safePost(message) {
    if (this.closed) return
    try {
      this.port.postMessage(message)
    } catch {
      this.close()
    }
  }

  setConnected(connected) {
    if (this.connected === connected) return
    this.connected = connected
    if (!connected) {
      this.pageConnectionConfirmed = false
      this.currentChain = ''
    }
    this.safePost({ type: 'transport', connected })
    this.onStateChange(this, connected)
  }

  recordCurrentChain(method, result) {
    if (method !== 'eth_chainId' || typeof result !== 'string' || this.currentChain === result)
      return
    this.currentChain = result
    this.onStateChange(this, this.connected)
  }

  confirmPageActivity(method, result) {
    const previousChain = this.currentChain
    if (method === 'eth_chainId' && typeof result === 'string') this.currentChain = result
    if (this.pageConnectionConfirmed && previousChain === this.currentChain) return
    this.pageConnectionConfirmed = true
    this.onStateChange(this, this.connected)
  }

  handlePortDisconnect() {
    this.close()
  }

  close() {
    if (this.closed) return
    this.closed = true
    this.clearReconnectTimer()
    this.rejectPending(4900, 'Wren disconnected')
    this.port.onMessage.removeListener(this.handlePortMessage)
    this.port.onDisconnect.removeListener(this.handlePortDisconnect)
    if (this.socket) {
      const socket = this.socket
      this.socket = undefined
      try {
        socket.close(1000, 'Page disconnected')
      } catch {
        // The browser can reject closing a socket that failed during construction.
      }
    }
    this.connected = false
    this.pageConnectionConfirmed = false
    this.currentChain = ''
    this.onStateChange(this, false)
  }
}

module.exports = {
  MAX_PENDING_REQUESTS,
  MAX_QUEUED_BYTES,
  MAX_QUEUED_REQUESTS,
  PageSession,
  derivePageOwner
}
