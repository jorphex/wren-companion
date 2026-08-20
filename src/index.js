const { ControlClient } = require('./control-client')
const {
  canPerformAuthenticationAction,
  parseAuthenticationAction,
  shouldPauseAuthentication
} = require('./authentication-actions')
const { AuthenticatedSocket } = require('./authenticated-socket')
const { CredentialStore, IndexedDbCredentialStorage } = require('./credential-store')
const { PageSession, derivePageOwner } = require('./page-session')

const frameUrl = (role) =>
  `ws://127.0.0.1:${globalThis.__WREN_DESKTOP_PORT__}?identity=frame-extension&role=${encodeURIComponent(role)}`
const MAX_PAGE_SOCKETS = 32
const MAX_PAGE_SESSIONS = 256
const MAX_PAGE_SESSIONS_PER_TAB = 8
const MAX_GLOBAL_PENDING_REQUESTS = 512
const MAX_GLOBAL_PENDING_BYTES = 16 * 1024 * 1024
const MAX_TAB_PENDING_REQUESTS = 128
const MAX_TAB_PENDING_BYTES = 4 * 1024 * 1024
const pageSessions = new Set()
const settingsPorts = new Set()
const tabCapacity = new Map()
let openPageSockets = 0
let globalPendingRequests = 0
let globalPendingBytes = 0
let authenticationReady = false
let authRecoveryPending = false
let credentialRotation

const credentialStore = new CredentialStore({ storage: new IndexedDbCredentialStorage() })

const frameState = {
  connected: false,
  availableChains: [],
  chainsStatus: 'idle',
  authentication: { status: 'disconnected' }
}
let chainsRefreshPromise

function setIcon(path) {
  chrome.action.setIcon({ path }).catch(() => {})
}

function publishState() {
  for (const port of settingsPorts) {
    try {
      port.postMessage({
        type: 'state',
        ...frameState,
        currentChain: port.frameChainId || '',
        tabStatus: port.frameTabStatus || 'checking'
      })
    } catch {
      // The popup may close while state is being published.
    }
  }
}

function setPortChain(port, chainId, tabStatus = chainId ? 'connected' : 'disconnected') {
  port.frameChainId = chainId
  port.frameTabStatus = tabStatus
  try {
    port.postMessage({ type: 'state', ...frameState, currentChain: chainId, tabStatus })
  } catch {
    // The popup may close while a chain request is resolving.
  }
}

function setFrameState(update) {
  Object.assign(frameState, update)
  setIcon(frameState.connected ? 'icons/icon96good.png' : 'icons/icon96moon.png')
  publishState()
}

function createAuthenticatedSocket(role, onStatus = () => {}) {
  return new AuthenticatedSocket({
    socket: new WebSocket(frameUrl(role)),
    credentialStore,
    channelRole: role,
    onStatus
  })
}

function createPageSocket() {
  if (!authenticationReady) throw new Error('Companion authentication is not ready')
  if (openPageSockets >= MAX_PAGE_SOCKETS) throw new Error('Page socket capacity exceeded')
  const socket = createAuthenticatedSocket('page', handlePageAuthenticationStatus)
  openPageSockets += 1
  socket.addEventListener(
    'close',
    () => {
      openPageSockets = Math.max(0, openPageSockets - 1)
    },
    { once: true }
  )
  return socket
}

function resetPageTransports() {
  for (const session of pageSessions) session.resetTransport()
}

function setAuthenticationReady(ready) {
  authenticationReady = ready
  if (ready) {
    for (const session of pageSessions) session.resumeTransport()
  } else {
    resetPageTransports()
  }
}

function handleControlAuthenticationStatus(authentication) {
  if (authentication.status === 'disconnected' && frameState.authentication.status === 'error')
    return
  setFrameState({ authentication })
  if (shouldPauseAuthentication(authentication)) {
    setAuthenticationReady(false)
    queueMicrotask(() => control.pause())
  }
}

function handlePageAuthenticationStatus(authentication) {
  if (authentication.status !== 'error' || !authenticationReady || authRecoveryPending) return
  authRecoveryPending = true
  setAuthenticationReady(false)
  setFrameState({ connected: false, availableChains: [], chainsStatus: 'idle', authentication })
  queueMicrotask(() => {
    authRecoveryPending = false
    control.restart()
  })
}

function reservePageRequest(owner, bytes) {
  const tab = tabCapacity.get(owner.tabId) || { requests: 0, bytes: 0 }
  if (
    globalPendingRequests >= MAX_GLOBAL_PENDING_REQUESTS ||
    globalPendingBytes + bytes > MAX_GLOBAL_PENDING_BYTES ||
    tab.requests >= MAX_TAB_PENDING_REQUESTS ||
    tab.bytes + bytes > MAX_TAB_PENDING_BYTES
  ) {
    return false
  }
  globalPendingRequests += 1
  globalPendingBytes += bytes
  tabCapacity.set(owner.tabId, { requests: tab.requests + 1, bytes: tab.bytes + bytes })
  return true
}

function releasePageRequest(owner, bytes) {
  globalPendingRequests = Math.max(0, globalPendingRequests - 1)
  globalPendingBytes = Math.max(0, globalPendingBytes - bytes)
  const tab = tabCapacity.get(owner.tabId)
  if (!tab) return
  const next = {
    requests: Math.max(0, tab.requests - 1),
    bytes: Math.max(0, tab.bytes - bytes)
  }
  if (next.requests === 0) tabCapacity.delete(owner.tabId)
  else tabCapacity.set(owner.tabId, next)
}

function rejectPagePort(port) {
  try {
    port.postMessage({ type: 'fatal' })
  } catch {
    port.disconnect()
    return
  }
  setTimeout(() => port.disconnect(), 100)
}

function topSessionForTab(tabId) {
  return [...pageSessions].find(
    (session) => !session.closed && session.owner.tabId === tabId && session.owner.frameId === 0
  )
}

async function activeTopSession(port) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!Number.isInteger(tab?.id) || typeof tab.url !== 'string') return
  let origin
  try {
    origin = new URL(tab.url).origin
  } catch {
    return
  }
  const session = topSessionForTab(tab.id)
  if (!session || session.owner.origin !== origin) return
  port.frameTabId = tab.id
  port.frameOrigin = origin
  return session
}

function publishSessionState(session) {
  for (const port of settingsPorts) {
    if (port.frameTabId !== session.owner.tabId || port.frameOrigin !== session.owner.origin)
      continue
    setPortChain(
      port,
      session.currentChain || port.frameChainId || '',
      session.pageConnectionConfirmed ? 'connected' : 'disconnected'
    )
  }
}

const control = new ControlClient({
  createSocket: () => createAuthenticatedSocket('control', handleControlAuthenticationStatus),
  onOpen: (client) => {
    setAuthenticationReady(true)
    setFrameState({ connected: true, chainsStatus: 'loading' })
    refreshAvailableChains(client)
  },
  onClose: () => {
    setAuthenticationReady(false)
    for (const port of settingsPorts) {
      port.frameChainId = ''
      port.frameTabStatus = 'checking'
    }
    setFrameState({ connected: false, availableChains: [], chainsStatus: 'idle' })
  }
})
control.connect()

function refreshAvailableChains(client = control) {
  if (chainsRefreshPromise) return chainsRefreshPromise
  if (!frameState.availableChains.length) setFrameState({ chainsStatus: 'loading' })
  chainsRefreshPromise = client
    .request('wallet_getEthereumChains')
    .then((chains) =>
      setFrameState({
        availableChains: Array.isArray(chains) ? chains : [],
        chainsStatus: 'ready'
      })
    )
    .catch(() => {
      if (frameState.connected) setFrameState({ chainsStatus: 'error' })
    })
    .finally(() => {
      chainsRefreshPromise = undefined
    })
  return chainsRefreshPromise
}

async function initializeSettingsPort(port) {
  settingsPorts.add(port)
  port.frameTabStatus = 'checking'
  publishState()
  try {
    const chains = refreshAvailableChains()
    const session = await activeTopSession(port)
    if (!session) return setPortChain(port, '', 'disconnected')
    const chainId = await session.requestControl('eth_chainId', [], true)
    setPortChain(
      port,
      typeof chainId === 'string' ? chainId : session.currentChain,
      session.pageConnectionConfirmed ? 'connected' : 'disconnected'
    )
    await chains
  } catch {
    // The active tab can disappear or its document transport can close while
    // the popup is opening.
    setPortChain(port, '', 'disconnected')
  }
}

async function handleSettingsMessage(port, message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return
  const keys = Object.keys(message)
  const authenticationAction = parseAuthenticationAction(message)
  if (authenticationAction === 'reconnect') {
    if (canPerformAuthenticationAction(authenticationAction, frameState.authentication)) {
      control.restart()
    }
    return
  }
  if (message.type === 'summon') {
    if (keys.length !== 1) return
    await control.request('frame_summon').catch(() => {})
    return
  }
  if (message.type === 'refresh') {
    if (keys.length !== 1) return
    if (port.frameRefreshPromise) return port.frameRefreshPromise
    port.frameRefreshPromise = (async () => {
      const chains = refreshAvailableChains()
      const session = await activeTopSession(port)
      if (!session) {
        await chains
        return setPortChain(port, '', 'disconnected')
      }
      const chainId = await session.requestControl('eth_chainId', [], true).catch(() => '')
      setPortChain(
        port,
        typeof chainId === 'string' ? chainId : session.currentChain,
        session.pageConnectionConfirmed ? 'connected' : 'disconnected'
      )
      await chains
    })().finally(() => {
      port.frameRefreshPromise = undefined
    })
    return port.frameRefreshPromise
  }
  if (authenticationAction === 'reset-pairing') {
    if (
      credentialRotation ||
      !canPerformAuthenticationAction(authenticationAction, frameState.authentication)
    ) {
      return
    }
    credentialRotation = (async () => {
      setAuthenticationReady(false)
      control.pause()
      setFrameState({
        connected: false,
        availableChains: [],
        chainsStatus: 'idle',
        authentication: { status: 'rotating' }
      })
      try {
        await credentialStore.rotate()
        control.restart()
      } catch (error) {
        control.restart()
        setFrameState({
          authentication: {
            status: 'error',
            code: 'credential-error',
            message: error instanceof Error ? error.message : 'Unable to rotate pairing key'
          }
        })
      }
    })().finally(() => {
      credentialRotation = undefined
    })
    return credentialRotation
  }
  if (
    message.type === 'switchChain' &&
    keys.length === 3 &&
    typeof message.chainId === 'string' &&
    typeof message.requestId === 'string' &&
    /^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(message.chainId)
  ) {
    const session = await activeTopSession(port)
    if (!session) {
      try {
        port.postMessage({
          type: 'chainSwitchResult',
          requestId: message.requestId,
          switched: false,
          declined: false
        })
      } catch {
        settingsPorts.delete(port)
      }
      return
    }
    let switchError
    await session
      .requestControl('wallet_switchEthereumChain', [{ chainId: message.chainId }])
      .catch((error) => {
        switchError = error
      })
    const chainId = await session.requestControl('eth_chainId', [], true).catch(() => '')
    setPortChain(port, typeof chainId === 'string' ? chainId : '')
    try {
      port.postMessage({
        type: 'chainSwitchResult',
        requestId: message.requestId,
        switched:
          typeof chainId === 'string' && chainId.toLowerCase() === message.chainId.toLowerCase(),
        declined: switchError?.code === 4001
      })
    } catch {
      settingsPorts.delete(port)
    }
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'frame_page') {
    const owner = derivePageOwner(port.sender)
    if (!owner) return rejectPagePort(port)
    for (const existing of pageSessions) {
      if (existing.owner.tabId === owner.tabId && existing.owner.frameId === owner.frameId) {
        existing.safePost({ type: 'fatal' })
        existing.close()
        setTimeout(() => existing.port.disconnect(), 100)
      }
    }
    const tabSessionCount = [...pageSessions].filter(
      (session) => !session.closed && session.owner.tabId === owner.tabId
    ).length
    if (pageSessions.size >= MAX_PAGE_SESSIONS || tabSessionCount >= MAX_PAGE_SESSIONS_PER_TAB) {
      return rejectPagePort(port)
    }
    const session = new PageSession({
      port,
      owner,
      createSocket: createPageSocket,
      socketReady: () => authenticationReady,
      reserveRequest: (bytes) => reservePageRequest(owner, bytes),
      releaseRequest: (bytes) => releasePageRequest(owner, bytes),
      onStateChange: (changedSession) => {
        if (changedSession.closed) pageSessions.delete(changedSession)
        publishSessionState(changedSession)
      }
    })
    pageSessions.add(session)
    return
  }

  const ownSettingsPage =
    port.name === 'frame_settings' &&
    port.sender?.id === chrome.runtime.id &&
    (!port.sender.tab || globalThis.__WREN_QUALIFICATION_POPUP_TAB__ === true) &&
    typeof port.sender.url === 'string' &&
    port.sender.url.startsWith(chrome.runtime.getURL(''))
  if (!ownSettingsPage) return port.disconnect()

  initializeSettingsPort(port)
  port.onMessage.addListener((message) => handleSettingsMessage(port, message))
  port.onDisconnect.addListener(() => settingsPorts.delete(port))
})

const CLIENT_STATUS_ALARM_KEY = 'check-client-status'
chrome.alarms.create(CLIENT_STATUS_ALARM_KEY, { delayInMinutes: 1, periodInMinutes: 1 })
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CLIENT_STATUS_ALARM_KEY) {
    control.ping()
    if (frameState.connected) refreshAvailableChains()
  }
})
setInterval(() => {
  control.ping()
  if (frameState.connected) refreshAvailableChains()
}, 20 * 1000)

setIcon('icons/icon96moon.png')
chrome.action.setPopup({ popup: 'settings.html' })
