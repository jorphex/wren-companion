import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'

export class MarionetteClient {
  constructor(port) {
    this.port = port
    this.nextId = 0
    this.buffer = Buffer.alloc(0)
  }

  async open(timeout = 15_000) {
    const deadline = Date.now() + timeout
    let lastError
    while (Date.now() < deadline) {
      try {
        this.socket = await new Promise((resolve, reject) => {
          const socket = createConnection({ host: '127.0.0.1', port: this.port }, () =>
            resolve(socket)
          )
          socket.once('error', reject)
        })
        this.socket.on('data', (chunk) => {
          this.buffer = Buffer.concat([this.buffer, chunk])
          this.readPackets()
        })
        this.socket.on('error', () => {})
        this.socket.on('close', () => this.rejectWaiters(new Error('Marionette connection closed')))
        const hello = await this.packet()
        if (hello.applicationType !== 'gecko' || hello.marionetteProtocol < 3) {
          throw new Error('Firefox returned an unsupported Marionette greeting')
        }
        const session = await this.request('WebDriver:NewSession', {
          strictFileInteractability: true,
          webSocketUrl: true
        })
        this.sessionId = session.sessionId
        this.capabilities = session.capabilities
        return this
      } catch (error) {
        lastError = error
        this.socket?.destroy()
        await delay(100)
      }
    }
    throw new Error(`Marionette did not open: ${lastError?.message || this.port}`)
  }

  readPackets() {
    while (true) {
      const separator = this.buffer.indexOf(0x3a)
      if (separator < 0) return
      const prefix = this.buffer.subarray(0, separator).toString('ascii')
      if (!/^\d+$/u.test(prefix)) throw new Error('Invalid Marionette packet prefix')
      const length = Number(prefix)
      if (this.buffer.length < separator + 1 + length) return
      const body = this.buffer.subarray(separator + 1, separator + 1 + length).toString('utf8')
      this.buffer = this.buffer.subarray(separator + 1 + length)
      const value = JSON.parse(body)
      const waiter = this.waiters?.shift()
      if (waiter) {
        clearTimeout(waiter.timeout)
        waiter.resolve(value)
      } else (this.packets ||= []).push(value)
    }
  }

  rejectWaiters(error) {
    for (const waiter of this.waiters || []) {
      clearTimeout(waiter.timeout)
      waiter.reject(error)
    }
    this.waiters = []
  }

  packet(timeoutMs = 15_000) {
    if (this.packets?.length) return Promise.resolve(this.packets.shift())
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject }
      waiter.timeout = setTimeout(() => {
        const index = this.waiters?.indexOf(waiter) ?? -1
        if (index >= 0) this.waiters.splice(index, 1)
        reject(new Error('Marionette response timed out'))
      }, timeoutMs)
      ;(this.waiters ||= []).push(waiter)
    })
  }

  async request(method, params = {}) {
    const id = ++this.nextId
    const value = JSON.stringify([0, id, method, params])
    this.socket.write(`${Buffer.byteLength(value)}:${value}`)
    while (true) {
      const response = await this.packet()
      if (response[0] !== 1 || response[1] !== id) continue
      if (response[2]) {
        throw new Error(`${method}: ${response[2].message || JSON.stringify(response[2])}`)
      }
      return response[3]
    }
  }

  async close() {
    if (this.sessionId) await this.request('WebDriver:DeleteSession').catch(() => {})
    this.sessionId = undefined
    this.socket?.destroy()
    this.rejectWaiters(new Error('Marionette client closed'))
  }
}
