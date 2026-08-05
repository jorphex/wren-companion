const EventEmitter = require('events')

const { MAX_MESSAGE_BYTES, parseDesktopMessage, serializedSize } = require('./protocol')

const MAX_QUEUED_MESSAGES = 64
const MAX_QUEUED_BYTES = 512 * 1024

class PageConnection extends EventEmitter {
  constructor() {
    super()
    this.connected = false
    this.queue = []
    this.queuedBytes = 0
  }

  attach(port) {
    if (this.port || !port || typeof port.postMessage !== 'function') return false
    this.port = port
    port.onmessage = (event) => this.handleMessage(event.data)
    port.onmessageerror = () => this.close()
    port.start?.()

    const queue = this.queue
    this.queue = []
    this.queuedBytes = 0
    try {
      for (const message of queue) port.postMessage(message.value)
    } catch {
      this.close()
      return false
    }
    return true
  }

  handleMessage(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) return
    if (
      message.type === 'transport' &&
      Object.keys(message).length === 2 &&
      typeof message.connected === 'boolean'
    ) {
      if (message.connected && !this.connected) {
        this.connected = true
        this.emit('connect')
      } else if (!message.connected) {
        this.connected = false
        this.emit('close')
      }
      return
    }

    if (message.type !== 'rpc' || Object.keys(message).length !== 2) return
    let serialized
    try {
      serialized = JSON.stringify(message.payload)
    } catch {
      return
    }
    const parsed = parseDesktopMessage(serialized)
    if (parsed.success) this.emit('payload', parsed.value)
  }

  post(message) {
    const bytes = serializedSize(message)
    if (bytes > MAX_MESSAGE_BYTES) throw new Error('Wren page message exceeds transport limit')
    if (this.port) {
      this.port.postMessage(message)
      return
    }
    if (this.queue.length >= MAX_QUEUED_MESSAGES || this.queuedBytes + bytes > MAX_QUEUED_BYTES) {
      throw new Error('Wren page connection queue exceeded')
    }
    this.queue.push({ value: message, bytes })
    this.queuedBytes += bytes
  }

  send(payload, connectionMessage = false) {
    this.post({ type: connectionMessage ? 'connection' : 'rpc', payload })
  }

  open() {
    this.post({ type: 'connect' })
  }

  close() {
    const wasConnected = this.connected
    this.connected = false
    this.queue = []
    this.queuedBytes = 0
    const port = this.port
    this.port = undefined
    if (port) {
      port.onmessage = null
      port.onmessageerror = null
      port.close()
    }
    if (wasConnected || this.listenerCount('close')) this.emit('close')
  }
}

module.exports = { PageConnection }
