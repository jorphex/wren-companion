import { setTimeout as delay } from 'node:timers/promises'

export async function waitForJson(url, timeout = 15_000) {
  const deadline = Date.now() + timeout
  let lastError
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return response.json()
    } catch (error) {
      lastError = error
    }
    await delay(100)
  }
  throw new Error(`Browser debugging endpoint did not open: ${lastError?.message || url}`)
}

export class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url)
    this.pending = new Map()
    this.nextId = 1
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true })
      this.socket.addEventListener('error', reject, { once: true })
    })
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (!message.id) return
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timeout)
      if (message.error) pending.reject(new Error(message.error.message))
      else pending.resolve(message.result)
    })
    return this
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP command timed out: ${method}`))
      }, 15_000)
      this.pending.set(id, { resolve, reject, timeout })
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }))
    })
  }

  async page(url) {
    const { targetId } = await this.send('Target.createTarget', { url: 'about:blank' })
    const page = await this.attach(targetId)
    await this.send('Page.navigate', { url }, page.sessionId)
    return page
  }

  async attach(targetId) {
    const { sessionId } = await this.send('Target.attachToTarget', { targetId, flatten: true })
    await this.send('Page.enable', {}, sessionId)
    await this.send('Runtime.enable', {}, sessionId)
    return new CdpPage(this, sessionId, targetId)
  }

  close() {
    this.socket.close()
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('CDP client closed'))
    }
    this.pending.clear()
  }
}

class CdpPage {
  constructor(client, sessionId, targetId) {
    this.client = client
    this.sessionId = sessionId
    this.targetId = targetId
  }

  async evaluate(expression, awaitPromise = true) {
    const result = await this.client.send(
      'Runtime.evaluate',
      { expression, awaitPromise, returnByValue: true },
      this.sessionId
    )
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
    return result.result.value
  }

  async waitFor(expression, timeout = 15_000) {
    const deadline = Date.now() + timeout
    while (Date.now() < deadline) {
      if (await this.evaluate(`Boolean(${expression})`)) return
      await delay(100)
    }
    throw new Error(`Browser condition timed out: ${expression}`)
  }

  async close() {
    await this.client.send('Target.closeTarget', { targetId: this.targetId })
  }
}
