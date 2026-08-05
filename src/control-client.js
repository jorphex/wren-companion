const { parseDesktopMessage } = require('./protocol')
const { clearTimer: clearBrowserTimer, setTimer: setBrowserTimer } = require('./timers')

const CONTROL_METHODS = new Set(['frame_summon', 'wallet_getEthereumChains', 'web3_clientVersion'])
const DEFAULT_RECONNECT_DELAYS = [250, 500, 1000, 2000, 5000, 10000]
const WEB_SOCKET_OPEN = 1

class ControlClient {
  constructor({
    createSocket,
    onOpen = () => {},
    onClose = () => {},
    setTimer = setBrowserTimer,
    clearTimer = clearBrowserTimer,
    requestTimeout = 5 * 60 * 1000,
    reconnectDelays = DEFAULT_RECONNECT_DELAYS
  }) {
    this.createSocket = createSocket
    this.onOpen = onOpen
    this.onClose = onClose
    this.setTimer = setTimer
    this.clearTimer = clearTimer
    this.requestTimeout = requestTimeout
    this.reconnectDelays = reconnectDelays
    this.pending = new Map()
    this.nextId = 1
    this.reconnectAttempt = 0
    this.disposed = false
  }

  connect() {
    if (this.disposed || this.paused || this.socket) return
    let socket
    try {
      socket = this.createSocket()
    } catch {
      return this.scheduleReconnect()
    }
    this.socket = socket
    socket.addEventListener('open', () => this.handleOpen(socket))
    socket.addEventListener('message', (event) => this.handleMessage(socket, event.data))
    socket.addEventListener('close', () => this.handleClose(socket))
    socket.addEventListener('error', () => {})
  }

  handleOpen(socket) {
    if (socket !== this.socket || this.disposed) return
    this.reconnectAttempt = 0
    this.onOpen(this)
  }

  handleMessage(socket, data) {
    if (socket !== this.socket || this.disposed) return
    const parsed = parseDesktopMessage(data)
    if (!parsed.success || parsed.value.method === 'eth_subscription') {
      socket.close(1002, 'Invalid Wren control response')
      return
    }

    const payload = parsed.value
    const pending = this.pending.get(payload.id)
    if (!pending) {
      socket.close(1002, 'Unexpected Wren control response')
      return
    }
    this.pending.delete(payload.id)
    this.clearTimer(pending.timer)
    if (payload.error)
      pending.reject(Object.assign(new Error(payload.error.message), payload.error))
    else pending.resolve(payload.result)
  }

  handleClose(socket) {
    if (socket !== this.socket) return
    this.socket = undefined
    this.rejectPending(4900, 'Wren disconnected')
    this.onClose()
    this.scheduleReconnect()
  }

  scheduleReconnect() {
    if (this.disposed || this.paused || this.reconnectTimer) return
    const index = Math.min(this.reconnectAttempt++, this.reconnectDelays.length - 1)
    this.reconnectTimer = this.setTimer(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, this.reconnectDelays[index])
  }

  request(method, params = [], timeout = this.requestTimeout, closeOnTimeout = false) {
    if (!CONTROL_METHODS.has(method) || !Array.isArray(params)) {
      return Promise.reject(
        Object.assign(new Error('Unsupported control request'), { code: -32600 })
      )
    }
    if (this.socket?.readyState !== WEB_SOCKET_OPEN) {
      return Promise.reject(Object.assign(new Error('Wren disconnected'), { code: 4900 }))
    }
    if (this.pending.size >= 16) {
      return Promise.reject(Object.assign(new Error('Too many control requests'), { code: -32005 }))
    }

    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const socket = this.socket
      const timer = this.setTimer(() => {
        this.pending.delete(id)
        reject(Object.assign(new Error('Wren control request timed out'), { code: -32002 }))
        if (closeOnTimeout && this.socket === socket) {
          try {
            socket.close(1011, 'Wren keepalive timed out')
          } catch {
            this.handleClose(socket)
          }
        }
      }, timeout)
      this.pending.set(id, { resolve, reject, timer })
      try {
        socket.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }))
      } catch {
        this.pending.delete(id)
        this.clearTimer(timer)
        reject(Object.assign(new Error('Wren disconnected'), { code: 4900 }))
        try {
          socket.close(1011, 'Wren request failed')
        } catch {
          this.handleClose(socket)
        }
      }
    })
  }

  ping() {
    if (this.paused) return
    if (!this.socket) this.connect()
    else if (this.socket.readyState === WEB_SOCKET_OPEN)
      this.request('web3_clientVersion', [], 25 * 1000, true).catch(() => {})
  }

  rejectPending(code, message) {
    for (const pending of this.pending.values()) {
      this.clearTimer(pending.timer)
      pending.reject(Object.assign(new Error(message), { code }))
    }
    this.pending.clear()
  }

  restart() {
    if (this.disposed) return
    this.pause()
    this.paused = false
    this.reconnectAttempt = 0
    this.connect()
  }

  pause() {
    if (this.disposed) return
    this.paused = true
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.rejectPending(4900, 'Wren control connection reset')
    const socket = this.socket
    this.socket = undefined
    if (socket) {
      this.onClose()
      try {
        socket.close(1000, 'Control connection reset')
      } catch {
        // The browser can reject closing a socket that failed during construction.
      }
    }
  }

  dispose() {
    if (this.disposed) return
    this.disposed = true
    if (this.reconnectTimer) this.clearTimer(this.reconnectTimer)
    this.rejectPending(4900, 'Wren control client closed')
    const socket = this.socket
    this.socket = undefined
    socket?.close(1000, 'Control client closed')
  }
}

module.exports = { ControlClient }
