const { errorResponse, parseDesktopMessage, parsePageRequest } = require('./protocol')

const BOOTSTRAP_SOURCE = 'frame:bootstrap'
const MAX_RECONNECT_DELAY = 5000

let port
let pagePort
let stopped = false
let suspended = false
let reconnectDelay = 100
let reconnectTimer
let connectRequested = false

function randomChannelId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('')
}

function postToPage(message) {
  try {
    pagePort?.postMessage(message)
  } catch {
    stop()
  }
}

function stop() {
  stopped = true
  clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  const currentPort = port
  port = undefined
  currentPort?.disconnect()
  pagePort?.close()
  pagePort = undefined
}

function connect() {
  if (stopped || suspended || port) return

  try {
    const nextPort = chrome.runtime.connect({ name: 'frame_page' })
    port = nextPort
    reconnectDelay = 100

    nextPort.onMessage.addListener((message) => {
      if (nextPort !== port || !message || typeof message !== 'object') return
      if (message.type === 'transport' && typeof message.connected === 'boolean') {
        postToPage({ type: 'transport', connected: message.connected })
      } else if (message.type === 'fatal') {
        stopped = true
        port = undefined
        postToPage({ type: 'transport', connected: false })
        nextPort.disconnect()
      } else if (message.type === 'rpc') {
        const parsed = parseDesktopMessage(JSON.stringify(message.payload))
        if (parsed.success) postToPage({ type: 'rpc', payload: parsed.value })
      }
    })

    nextPort.onDisconnect.addListener(() => {
      if (nextPort !== port) return
      port = undefined
      postToPage({ type: 'transport', connected: false })
      scheduleReconnect()
    })
    if (connectRequested) nextPort.postMessage({ type: 'connect' })
  } catch {
    port = undefined
    scheduleReconnect()
  }
}

function scheduleReconnect() {
  if (stopped || reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = undefined
    connect()
  }, reconnectDelay)
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY)
}

function handlePageMessage(event) {
  const message = event.data
  if (!message || typeof message !== 'object' || Array.isArray(message)) return
  if (message.type === 'connect' && Object.keys(message).length === 1) {
    connectRequested = true
    if (port) {
      try {
        port.postMessage({ type: 'connect' })
      } catch {
        port = undefined
        scheduleReconnect()
      }
    } else {
      connect()
      if (!port) scheduleReconnect()
    }
    return
  }
  if (
    (message.type !== 'rpc' && message.type !== 'connection') ||
    Object.keys(message).length !== 2
  ) {
    return
  }

  const parsed = parsePageRequest(message.payload)
  if (!parsed.success) return postToPage({ type: 'rpc', payload: parsed.error })
  if (
    message.type === 'connection' &&
    parsed.value.method !== 'net_version' &&
    parsed.value.method !== 'eth_chainId'
  ) {
    return postToPage({
      type: 'rpc',
      payload: errorResponse(parsed.value.id, -32600, 'Unsupported connection method')
    })
  }
  if (!port) connect()
  if (!port) {
    postToPage({
      type: 'rpc',
      payload: errorResponse(parsed.value.id, 4900, 'Wren Companion unavailable')
    })
    return
  }

  try {
    port?.postMessage({ type: message.type, payload: parsed.value })
  } catch {
    port = undefined
    postToPage({
      type: 'rpc',
      payload: errorResponse(parsed.value.id, 4900, 'Wren Companion unavailable')
    })
    scheduleReconnect()
  }
}

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) {
    stop()
    return
  }
  suspended = event.persisted
  clearTimeout(reconnectTimer)
  reconnectTimer = undefined
  const currentPort = port
  port = undefined
  currentPort?.disconnect()
  postToPage({ type: 'transport', connected: false })
})

window.addEventListener('pageshow', (event) => {
  if (!event.persisted) return
  suspended = false
  connect()
})

const script = document.createElement('script')
const channel = new MessageChannel()
const channelId = randomChannelId()
pagePort = channel.port1
pagePort.onmessage = handlePageMessage
pagePort.onmessageerror = stop
pagePort.start()

script.type = 'text/javascript'
script.async = false
script.src = chrome.runtime.getURL('frame.js')
script.dataset.frameChannel = channelId
script.onload = () => {
  script.remove()
  window.postMessage({ source: BOOTSTRAP_SOURCE, channelId }, window.location.origin, [
    channel.port2
  ])
}
script.onerror = stop
;(document.head || document.documentElement).appendChild(script)
