const EventEmitter = require('events')

const subscriptionEvents = new Set([
  'accountsChanged',
  'assetsChanged',
  'chainChanged',
  'chainsChanged',
  'networkChanged'
])

function providerError(error, fallbackCode = -32603) {
  const result = new Error(error?.message || 'Wren request failed')
  result.code = Number.isFinite(error?.code) ? error.code : fallbackCode
  if (error && Object.prototype.hasOwnProperty.call(error, 'data')) result.data = error.data
  return result
}

class FrameProvider extends EventEmitter {
  constructor(connection) {
    super()
    this.connection = connection
    this.nextId = 1
    this.pending = new Map()
    this.subscriptions = new Map()
    this.subscriptionPromises = new Map()
    this.connected = false
    this.connecting = false
    this.accounts = []

    for (const method of [
      'close',
      'doSend',
      'enable',
      'isConnected',
      'request',
      'send',
      'sendAsync',
      'sendBatch',
      'setChain',
      'subscribe',
      'unsubscribe',
      'waitForConnection'
    ]) {
      this[method] = this[method].bind(this)
    }

    connection.on('payload', (payload) => this.handlePayload(payload))
    connection.on('connect', () => this.handleConnect())
    connection.on('close', () => this.handleDisconnect())

    this.on('newListener', (event) => {
      if (event === 'connect' && !this.connected) this.connection.open?.()
      if (subscriptionEvents.has(event)) queueMicrotask(() => this.ensureSubscription(event))
    })
    this.on('removeListener', (event) => {
      if (subscriptionEvents.has(event)) queueMicrotask(() => this.removeSubscription(event))
    })
  }

  request(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return Promise.reject(providerError({ code: -32600, message: 'Invalid request' }))
    }
    return this.doSend(payload.method, payload.params, payload.chainId)
  }

  doSend(method, params = [], chainId = this.manualChainId, connectionMessage = false) {
    if (typeof method !== 'string' || !method.length) {
      return Promise.reject(providerError({ code: -32600, message: 'Invalid method' }))
    }
    if (!Array.isArray(params) && (typeof params !== 'object' || params === null)) {
      return Promise.reject(providerError({ code: -32602, message: 'Invalid params' }))
    }
    if (!connectionMessage && !this.connected) {
      return this.waitForConnection().then(() =>
        this.doSend(method, params, chainId, connectionMessage)
      )
    }

    const id = this.nextId++
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      params,
      ...(chainId !== undefined && { chainId })
    }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject })
      try {
        this.connection.send(payload, connectionMessage)
      } catch (error) {
        this.pending.delete(id)
        reject(providerError(error, 4900))
      }
    })
  }

  waitForConnection() {
    if (this.connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer)
        this.off('connect', connected)
        this.off('_frameTransportClose', disconnected)
      }
      const connected = () => {
        cleanup()
        resolve()
      }
      const disconnected = () => {
        cleanup()
        reject(providerError({ code: 4900, message: 'Wren disconnected' }))
      }
      const timer = setTimeout(() => {
        cleanup()
        reject(providerError({ code: 4900, message: 'Wren connection timed out' }))
      }, 5000)
      this.once('connect', connected)
      this.once('_frameTransportClose', disconnected)
    })
  }

  handlePayload(payload) {
    if (payload && (typeof payload.id === 'string' || typeof payload.id === 'number')) {
      const pending = this.pending.get(payload.id)
      if (!pending) return
      this.pending.delete(payload.id)
      if (payload.error) return pending.reject(providerError(payload.error))

      if (pending.method === 'eth_accounts' || pending.method === 'eth_requestAccounts') {
        this.accounts = Array.isArray(payload.result) ? payload.result : []
        this.selectedAddress = this.accounts[0]
        this.coinbase = this.accounts[0]
      } else if (pending.method === 'eth_chainId' && typeof payload.result === 'string') {
        this.providerChainId = payload.result
      } else if (pending.method === 'net_version') {
        this.networkVersion = payload.result
      }

      pending.resolve(payload.result)
      return
    }

    if (payload?.method !== 'eth_subscription' || !payload.params) return
    const event = this.subscriptions.get(payload.params.subscription)
    const result = payload.params.result
    if (event) {
      if (event === 'accountsChanged') {
        this.accounts = Array.isArray(result) ? result : []
        this.selectedAddress = this.accounts[0]
        this.coinbase = this.accounts[0]
      } else if (event === 'chainChanged') {
        this.providerChainId = result
      } else if (event === 'networkChanged') {
        this.networkVersion = result
      }
      if (event !== 'chainChanged' || !this.manualChainId) this.emit(event, result)
    }
    this.emit('message', { type: 'eth_subscription', data: payload.params })
    this.emit('data', payload)
  }

  async handleConnect() {
    if (this.connected || this.connecting) return
    this.connecting = true
    try {
      const [networkVersion, chainId] = await Promise.all([
        this.doSend('net_version', [], undefined, true),
        this.doSend('eth_chainId', [], undefined, true)
      ])
      this.networkVersion = networkVersion
      this.providerChainId = chainId
      this.connected = true
      this.emit('connect', { chainId: this.chainId })
      for (const event of subscriptionEvents) this.ensureSubscription(event)
    } catch {
      if (this.connection.connected) {
        clearTimeout(this.connectRetryTimer)
        this.connectRetryTimer = setTimeout(() => this.handleConnect(), 4000)
      }
    } finally {
      this.connecting = false
    }
  }

  handleDisconnect() {
    const wasConnected = this.connected
    const shouldEmit = wasConnected || this.pending.size > 0
    this.connected = false
    this.connecting = false
    clearTimeout(this.connectRetryTimer)
    this.connectRetryTimer = undefined
    this.subscriptions.clear()
    this.subscriptionPromises.clear()
    this.emit('_frameTransportClose')
    const error = providerError({ code: 4900, message: 'Wren disconnected' })
    for (const { reject } of this.pending.values()) reject(error)
    this.pending.clear()
    if (!shouldEmit) return
    this.emit('disconnect', error)
    this.emit('close', error)
  }

  ensureSubscription(event) {
    if (!subscriptionEvents.has(event) || this.listenerCount(event) === 0) return
    if ([...this.subscriptions.values()].includes(event) || this.subscriptionPromises.has(event)) {
      return
    }

    const promise = this.doSend('eth_subscribe', [event])
      .then((id) => {
        if (typeof id !== 'string') throw providerError({ message: 'Invalid subscription id' })
        this.subscriptions.set(id, event)
        if (this.listenerCount(event) === 0) return this.removeSubscription(event)
      })
      .catch(() => {})
      .finally(() => this.subscriptionPromises.delete(event))
    this.subscriptionPromises.set(event, promise)
  }

  removeSubscription(event) {
    if (this.listenerCount(event) > 0) return
    const entry = [...this.subscriptions.entries()].find(([, type]) => type === event)
    if (!entry) return
    const [id] = entry
    this.subscriptions.delete(id)
    this.doSend('eth_unsubscribe', [id]).catch(() => {})
  }

  async enable() {
    const accounts = await this.doSend('eth_accounts')
    if (Array.isArray(accounts) && accounts.length) {
      this.emit('enable')
      return accounts
    }
    throw providerError({ code: 4001, message: 'User denied account access' })
  }

  sendBatch(requests) {
    if (!Array.isArray(requests)) {
      return Promise.reject(providerError({ code: -32600, message: 'Invalid batch request' }))
    }
    return Promise.all(requests.map((payload) => this.request(payload)))
  }

  async subscribe(type, method, params = []) {
    const id = await this.doSend(type, [method, ...params])
    if (typeof id === 'string') this.subscriptions.set(id, id)
    return id
  }

  async unsubscribe(type, id) {
    const success = await this.doSend(type, [id])
    if (success) {
      this.subscriptions.delete(id)
      this.removeAllListeners(id)
    }
    return success
  }

  send(methodOrPayload, callbackOrParams) {
    if (typeof methodOrPayload === 'string')
      return this.doSend(methodOrPayload, callbackOrParams || [])
    if (typeof callbackOrParams === 'function')
      return this.sendAsync(methodOrPayload, callbackOrParams)
    return this.request(methodOrPayload)
  }

  sendAsync(payload, callback) {
    if (typeof callback !== 'function') return
    if (Array.isArray(payload)) {
      Promise.all(payload.map((item) => this.request(item)))
        .then((results) =>
          callback(
            null,
            results.map((result, index) => ({
              id: payload[index].id,
              jsonrpc: '2.0',
              result
            }))
          )
        )
        .catch((error) => callback(error))
      return
    }

    this.request(payload)
      .then((result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }))
      .catch((error) => callback(error))
  }

  isConnected() {
    return this.connected
  }

  get chainId() {
    return this.manualChainId || this.providerChainId
  }

  setChain(chainId) {
    const next = typeof chainId === 'number' ? `0x${chainId.toString(16)}` : chainId
    const previous = this.chainId
    this.manualChainId = next
    if (this.chainId !== previous) this.emit('chainChanged', this.chainId)
  }

  close() {
    this.connection.close()
    this.handleDisconnect()
  }
}

module.exports = FrameProvider
module.exports.providerError = providerError
