const WREN_RDNS = 'io.github.jorphex.wren'

let provider
let account
let chainId
let pendingAction

const elements = {
  account: document.querySelector('#account'),
  chain: document.querySelector('#chain'),
  confirmation: document.querySelector('#transaction-confirmation'),
  connect: document.querySelector('[data-action="connect"]'),
  discovery: document.querySelector('#discovery'),
  discover: document.querySelector('[data-action="discover"]'),
  legacy: document.querySelector('#legacy'),
  log: document.querySelector('#log'),
  personal: document.querySelector('[data-action="personal"]'),
  refresh: document.querySelector('[data-action="refresh"]'),
  transaction: document.querySelector('[data-action="transaction"]'),
  transport: document.querySelector('#transport'),
  typed: document.querySelector('[data-action="typed"]')
}

const approvalActions = new Set(['connect', 'personal', 'typed', 'transaction'])
const actionButtons = {
  connect: 'Connect account',
  discover: 'Request EIP-6963 provider',
  personal: 'Sign fixed personal message',
  refresh: 'Refresh account and chain',
  transaction: 'Send zero-value self-transfer',
  typed: 'Sign fixed EIP-712 message'
}

function summarize(value) {
  if (typeof value === 'string') {
    if (/^0x[0-9a-f]{130}$/iu.test(value)) return `${value.slice(0, 18)}…${value.slice(-8)}`
    return value
  }
  return JSON.stringify(value)
}

function record(label, value, kind = 'info') {
  const line = document.createElement('span')
  line.dataset.kind = kind
  line.textContent = `${new Date().toLocaleTimeString()}  ${label}: ${summarize(value)}`
  elements.log.prepend(line)
}

function errorDetails(error) {
  return {
    code: Number.isFinite(error?.code) ? error.code : 'unknown',
    message: error?.message || String(error)
  }
}

function updateControls() {
  const connected = Boolean(provider && account)
  const locked = Boolean(pendingAction)
  elements.discover.disabled = locked
  elements.connect.disabled = locked
  elements.refresh.disabled = locked || !provider
  elements.personal.disabled = locked || !connected
  elements.typed.disabled = locked || !connected
  elements.transaction.disabled =
    locked ||
    !(
      connected &&
      globalThis.WrenQualificationTestnets.get(chainId) &&
      elements.confirmation.checked
    )
  elements.confirmation.disabled = locked
  for (const [action, label] of Object.entries(actionButtons)) {
    const button = elements[action]
    if (button) {
      button.textContent =
        pendingAction === action && approvalActions.has(action) ? 'Waiting for approval…' : label
      button.toggleAttribute('aria-busy', pendingAction === action)
      if (pendingAction === action) {
        button.setAttribute(
          'aria-label',
          'Waiting for Wren. Finish this request in Wren before trying again.'
        )
      } else {
        button.removeAttribute('aria-label')
      }
    }
  }
  elements.account.textContent = account || 'not connected'
  elements.chain.textContent = chainId || 'unknown'
}

async function refresh() {
  if (!provider) throw new Error('Wren provider has not been discovered')
  const [accounts, reportedChain] = await Promise.all([
    provider.request({ method: 'eth_accounts' }),
    provider.request({ method: 'eth_chainId' })
  ])
  account = Array.isArray(accounts) ? accounts[0] : undefined
  chainId = reportedChain
  updateControls()
  record('Session', { account: account || null, chainId })
}

function attachProvider(detail) {
  if (provider || detail?.info?.rdns !== WREN_RDNS || !detail.provider) return
  provider = detail.provider
  elements.discovery.textContent = `${detail.info.name} (${detail.info.uuid})`
  elements.transport.textContent = provider.isConnected?.() ? 'connected' : 'awaiting Wren'
  elements.legacy.textContent =
    window.ethereum === provider
      ? 'Wren owns window.ethereum'
      : window.ethereum
        ? 'another provider retained'
        : 'not installed'

  provider.on?.('connect', (event) => {
    elements.transport.textContent = 'connected'
    record('connect event', event)
  })
  provider.on?.('disconnect', (error) => {
    elements.transport.textContent = 'disconnected'
    pendingAction = undefined
    updateControls()
    record('disconnect event', errorDetails(error), 'error')
  })
  provider.on?.('accountsChanged', (accounts) => {
    account = Array.isArray(accounts) ? accounts[0] : undefined
    updateControls()
    record('accountsChanged event', accounts)
  })
  provider.on?.('chainChanged', (nextChainId) => {
    chainId = nextChainId
    elements.confirmation.checked = false
    updateControls()
    record('chainChanged event', nextChainId)
  })
  refresh().catch((error) => record('Initial session', errorDetails(error), 'error'))
}

window.addEventListener('eip6963:announceProvider', (event) => attachProvider(event.detail))

async function run(action) {
  if (action === 'discover') {
    window.dispatchEvent(new Event('eip6963:requestProvider'))
    record('EIP-6963', 'provider request dispatched')
    return
  }
  if (action === 'clear') {
    elements.log.replaceChildren()
    return
  }
  if (pendingAction) return
  if (!provider) throw new Error('Wren provider has not been discovered')

  if (action === 'refresh') {
    pendingAction = action
    updateControls()
    try {
      await refresh()
    } finally {
      pendingAction = undefined
      updateControls()
    }
    return
  }
  if (!account && action !== 'connect') throw new Error('Connect a disposable account first')

  if (approvalActions.has(action)) {
    pendingAction = action
    updateControls()
  }

  try {
    if (action === 'connect') {
      const accounts = await provider.request({ method: 'eth_requestAccounts' })
      account = Array.isArray(accounts) ? accounts[0] : undefined
      await refresh()
      record('Connection approved', accounts)
      return
    }
    if (action === 'personal') {
      const message = `Wren release qualification\nOrigin: ${location.origin}\nChain: ${chainId}`
      const encoded = `0x${[...new TextEncoder().encode(message)]
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join('')}`
      const signature = await provider.request({
        method: 'personal_sign',
        params: [encoded, account]
      })
      record('Personal signature returned', signature, 'success')
      return
    }
    if (action === 'typed') {
      const typedData = {
        domain: { name: 'Wren qualification', version: '1', chainId },
        message: { account, statement: 'I am testing a disposable Wren release candidate.' },
        primaryType: 'Qualification',
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' }
          ],
          Qualification: [
            { name: 'account', type: 'address' },
            { name: 'statement', type: 'string' }
          ]
        }
      }
      const signature = await provider.request({
        method: 'eth_signTypedData_v4',
        params: [account, JSON.stringify(typedData)]
      })
      record('EIP-712 signature returned', signature, 'success')
      return
    }
    if (action === 'transaction') {
      const testnet = globalThis.WrenQualificationTestnets.get(chainId)
      if (!testnet || !elements.confirmation.checked) {
        throw new Error(
          'An approved testnet and explicit disposable-account confirmation are required'
        )
      }
      const hash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{ from: account, to: account, value: '0x0', data: '0x' }]
      })
      elements.confirmation.checked = false
      record(`${testnet.name} transaction submitted`, hash, 'success')
    }
  } finally {
    pendingAction = undefined
    updateControls()
  }
}

document.addEventListener('click', (event) => {
  const action = event.target.closest('button')?.dataset.action
  if (!action) return
  run(action).catch((error) => record(action, errorDetails(error), 'error'))
})
elements.confirmation.addEventListener('change', updateControls)

window.dispatchEvent(new Event('eip6963:requestProvider'))
setTimeout(() => {
  if (!provider) {
    elements.discovery.textContent = 'Wren not announced'
    record('Discovery', 'No Wren provider announced', 'error')
  }
}, 1500)
