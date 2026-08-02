const FRAME_RDNS = 'sh.frame'
const SEPOLIA_CHAIN_ID = '0xaa36a7'

let provider
let account
let chainId

const elements = {
  account: document.querySelector('#account'),
  chain: document.querySelector('#chain'),
  confirmation: document.querySelector('#transaction-confirmation'),
  discovery: document.querySelector('#discovery'),
  legacy: document.querySelector('#legacy'),
  log: document.querySelector('#log'),
  personal: document.querySelector('[data-action="personal"]'),
  transaction: document.querySelector('[data-action="transaction"]'),
  transport: document.querySelector('#transport'),
  typed: document.querySelector('[data-action="typed"]')
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
  elements.personal.disabled = !connected
  elements.typed.disabled = !connected
  elements.transaction.disabled = !(
    connected &&
    chainId?.toLowerCase() === SEPOLIA_CHAIN_ID &&
    elements.confirmation.checked
  )
  elements.account.textContent = account || 'not connected'
  elements.chain.textContent = chainId || 'unknown'
}

async function refresh() {
  if (!provider) throw new Error('Frame provider has not been discovered')
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
  if (provider || detail?.info?.rdns !== FRAME_RDNS || !detail.provider) return
  provider = detail.provider
  elements.discovery.textContent = `${detail.info.name} (${detail.info.uuid})`
  elements.transport.textContent = provider.isConnected?.() ? 'connected' : 'awaiting Frame'
  elements.legacy.textContent =
    window.ethereum === provider
      ? 'Frame owns window.ethereum'
      : window.ethereum
        ? 'another provider retained'
        : 'not installed'

  provider.on?.('connect', (event) => {
    elements.transport.textContent = 'connected'
    record('connect event', event)
  })
  provider.on?.('disconnect', (error) => {
    elements.transport.textContent = 'disconnected'
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
  if (!provider) throw new Error('Frame provider has not been discovered')

  if (action === 'connect') {
    const accounts = await provider.request({ method: 'eth_requestAccounts' })
    account = Array.isArray(accounts) ? accounts[0] : undefined
    await refresh()
    record('Connection approved', accounts)
    return
  }
  if (action === 'refresh') return refresh()
  if (!account) throw new Error('Connect a disposable account first')

  if (action === 'personal') {
    const message = `Frame release qualification\nOrigin: ${location.origin}\nChain: ${chainId}`
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
      domain: { name: 'Frame qualification', version: '1', chainId },
      message: { account, statement: 'I am testing a disposable Frame release candidate.' },
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
    if (chainId?.toLowerCase() !== SEPOLIA_CHAIN_ID || !elements.confirmation.checked) {
      throw new Error('Sepolia and explicit disposable-account confirmation are required')
    }
    const hash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: account, value: '0x0', data: '0x' }]
    })
    elements.confirmation.checked = false
    updateControls()
    record('Sepolia transaction submitted', hash, 'success')
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
    elements.discovery.textContent = 'Frame not announced'
    record('Discovery', 'No sh.frame provider announced', 'error')
  }
}, 1500)
