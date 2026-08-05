const { PageConnection } = require('./page-connection')
const FrameProvider = require('./provider')
const { createProviderInfo } = require('./provider-info')
const { installLegacyProvider } = require('./legacy-provider')

const BOOTSTRAP_SOURCE = 'frame:bootstrap'

function installWeb3Shim(provider, appearAsMetaMask) {
  if (window.web3) return
  const identifier = appearAsMetaMask ? '__isMetaMaskShim__' : '__isFrameShim__'
  const shim = { currentProvider: provider }
  Object.defineProperty(shim, identifier, { value: true, enumerable: true })
  Object.defineProperty(window, 'web3', {
    value: shim,
    enumerable: false,
    configurable: true,
    writable: true
  })
}

let appearAsMetaMask = false
try {
  appearAsMetaMask = JSON.parse(window.localStorage.getItem('__frameAppearAsMM__')) === true
} catch {
  // Storage access can be blocked by the page's privacy policy.
}

const channelId = document.currentScript?.dataset.frameChannel
document.currentScript?.removeAttribute('data-frame-channel')
const connection = new PageConnection()

function bootstrap(event) {
  if (
    event.source !== window ||
    !channelId ||
    event.data?.source !== BOOTSTRAP_SOURCE ||
    event.data.channelId !== channelId ||
    !event.ports ||
    event.ports.length !== 1
  ) {
    return
  }
  if (connection.attach(event.ports[0])) window.removeEventListener('message', bootstrap)
}

window.addEventListener('message', bootstrap)

const provider = new FrameProvider(connection)
if (appearAsMetaMask) {
  provider.isMetaMask = true
  provider._metamask = Object.freeze({ isUnlocked: async () => true })
} else {
  provider.isFrame = true
  provider.isWren = true
}
provider.setMaxListeners(100)

const info = createProviderInfo()
const detail = Object.freeze({ info, provider })
const announce = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', { detail }))

window.addEventListener('eip6963:requestProvider', announce)
announce()
installLegacyProvider(window, provider)
installWeb3Shim(provider, appearAsMetaMask)
