import React from 'react'
import Restore from 'react-restore'
import { createRoot } from 'react-dom/client'
import styled from 'styled-components'

import { Cluster, ClusterValue, ClusterRow, ClusterBoxMain } from './Cluster'
import { getChainColorToken } from './chain-identity.mjs'
import { parseAuthenticationState, toRpcChainId } from './protocol.mjs'

const APPEAR_AS_MM = '__frameAppearAsMM__'

const initialState = {
  frameConnected: false,
  authentication: { status: 'disconnected' },
  appearAsMM: false
}

const actions = {
  setChains: (u, chains) => {
    u('availableChains', () => chains)
  },
  setCurrentChain: (u, chain) => {
    u('currentChain', () => chain)
  },
  setFrameConnected: (u, connected) => {
    u('frameConnected', () => connected)
  },
  setAuthentication: (u, authentication) => {
    u('authentication', () => authentication)
  }
}

const store = Restore.create(initialState, actions)

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function executeScript(tabId, func, args) {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func,
      args
    })

    return result
  } catch (e) {
    // this can happen when trying to open the settings panel while on a tab that doesn't support
    // script injection, such as a chrome:// tab
    return []
  }
}

async function getLocalSetting(tabId, key) {
  const results = await executeScript(tabId, (key) => localStorage.getItem(key), [key])

  if (results && results.length > 0) {
    try {
      return JSON.parse(results[0].result || false)
    } catch (e) {
      return false
    }
  }

  return false
}

async function setLocalSetting(tabId, setting, val) {
  return executeScript(
    tabId,
    (key, val) => {
      localStorage.setItem(key, val)
      window.location.reload()
    },
    [setting, val]
  )
}

async function toggleLocalSetting(key) {
  const activeTab = await getActiveTab()

  if (activeTab) {
    const currentValue = await getLocalSetting(activeTab.id, key)
    setLocalSetting(activeTab.id, key, !currentValue)

    window.close()
  }
}

const SettingsScroll = styled.main`
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  max-height: min(600px, 100vh);
  background: var(--wren-bg-canvas);
`

const DesktopStatus = styled.span`
  min-width: 0;
  flex: 1 1 auto;
  color: ${(props) => (props.$connected ? 'var(--wren-success)' : 'var(--wren-text-secondary)')};
  font-size: 15px;
  font-weight: 620;
  text-align: left;
`

const LogoWrap = styled.div`
  width: 30px;
  height: 30px;
  display: flex;
  justify-content: center;
  align-items: center;
  flex: none;
  box-sizing: border-box;

  img {
    width: 16px;
    height: 16px;
  }
`

const DesktopStatusControl = styled.button`
  appearance: none;
  width: 100%;
  min-height: 58px;
  padding: 10px 14px;
  display: flex;
  gap: 10px;
  align-items: center;
  border: 0;
  color: var(--wren-text-secondary);
  background: transparent;
  box-sizing: border-box;
  cursor: ${(props) => (props.$connected ? 'pointer' : 'default')};
  transition: background-color var(--wren-motion-fast) var(--wren-ease);

  &:hover:not(:disabled) {
    background: var(--wren-surface-hover);
  }

  &:active:not(:disabled) {
    background: var(--wren-surface-active);
  }

  &:disabled {
    opacity: 1;
  }

  svg {
    width: 15px;
    height: 15px;
    flex: none;
    transform: scaleX(-1);
  }
`

const AppearDescription = styled.div`
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 9px;
  color: var(--wren-text-secondary);
  font-size: 13px;
  font-weight: 520;

  svg {
    width: 16px;
    height: 16px;
    flex: none;
  }
`

const IdentityRow = styled.div`
  display: flex;
  width: 100%;
  min-height: 56px;
  padding: 9px 14px;
  align-items: center;
  gap: 12px;
`

const IdentityChoices = styled.div`
  display: flex;
  flex: none;
  padding: 2px;
  gap: 2px;
  border: 1px solid var(--wren-border-subtle);
  border-radius: var(--wren-radius-sm);
  background: var(--wren-surface-inset);
`

const IdentityButton = styled.button`
  appearance: none;
  min-width: 72px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid ${(props) => (props.$selected ? 'var(--wren-accent-primary)' : 'transparent')};
  border-radius: 3px;
  color: ${(props) => (props.$selected ? 'var(--wren-text-primary)' : 'var(--wren-text-tertiary)')};
  background: ${(props) => (props.$selected ? 'var(--wren-accent-primary-soft)' : 'transparent')};
  box-shadow: ${(props) => (props.$selected ? 'var(--wren-control-shadow)' : 'none')};
  cursor: pointer;
  font-size: 12px;
  font-weight: 580;
  transition:
    color var(--wren-motion-fast) var(--wren-ease),
    background-color var(--wren-motion-fast) var(--wren-ease),
    border-color var(--wren-motion-fast) var(--wren-ease);

  &:hover {
    color: var(--wren-text-primary);
    background: var(--wren-surface-hover);
  }
`

const PairingPanel = styled.div`
  width: 100%;
  padding: 20px;
  text-align: center;
`

const PairingTitle = styled.h2`
  margin: 0;
  color: var(--wren-text-primary);
  font-size: 16px;
  font-weight: 650;
  font-variation-settings:
    'CASL' 0.28,
    'CRSV' 0;
`

const PairingCode = styled.div`
  margin: 14px auto 10px;
  padding: 8px 12px 9px;
  border: 1px solid var(--wren-border-default);
  border-radius: var(--wren-radius-sm);
  color: var(--wren-accent-hover);
  background: var(--wren-surface-inset);
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.38);
  font-family: var(--wren-font-mono);
  font-size: 28px;
  font-weight: 580;
  letter-spacing: 0.18em;
`

const PairingDetail = styled.div`
  color: var(--wren-text-secondary);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
`

const PairingButton = styled.button`
  appearance: none;
  background: ${(props) => (props.$confirm ? 'var(--wren-danger-soft)' : 'transparent')};
  background-image: ${(props) => (props.$confirm ? 'var(--wren-control-texture)' : 'none')};
  border: 1px solid ${(props) => (props.$confirm ? 'var(--wren-danger)' : 'transparent')};
  border-radius: var(--wren-radius-sm);
  box-shadow: ${(props) => (props.$confirm ? 'var(--wren-control-shadow)' : 'none')};
  color: ${(props) => (props.$confirm ? 'var(--wren-danger)' : 'var(--wren-text-secondary)')};
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 580;
  min-height: 34px;
  padding: 0 14px;
  margin: 8px 14px;
  width: ${(props) => (props.$confirm ? 'calc(100% - 28px)' : 'auto')};

  &:hover {
    color: ${(props) => (props.$confirm ? 'var(--wren-danger)' : 'var(--wren-text-primary)')};
    border-color: ${(props) =>
      props.$confirm ? 'var(--wren-danger)' : 'var(--wren-border-subtle)'};
    background-color: var(--wren-surface-hover);
    box-shadow: ${(props) => (props.$confirm ? 'var(--wren-control-shadow)' : 'var(--wren-control-shadow-hover)')};
  }

  &:active {
    transform: translateY(1px);
    background-color: var(--wren-surface-active);
    box-shadow: var(--wren-control-shadow-pressed);
  }
`

const CannotConnectSub = styled.div`
  padding: ${(props) => (props.$standalone ? '22px 24px 24px' : '0 24px 24px')};
  color: var(--wren-text-secondary);
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
`

const UnsupportedTab = styled.div`
  padding: 24px 24px 8px;
  color: var(--wren-text-primary);
  font-size: 16px;
  font-weight: 620;
  text-align: center;
`

const UnsupportedOrigin = styled.div`
  max-width: 100%;
  padding-top: 8px;
  color: var(--wren-accent-hover);
  font-family: var(--wren-font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
`

const Download = styled.a`
  color: var(--wren-text-inverse);
  min-height: 42px;
  margin: 0 14px 14px;
  width: calc(100% - 28px);
  border: 1px solid var(--wren-accent-hover);
  border-radius: var(--wren-radius-sm);
  background: var(--wren-accent);
  background-image: var(--wren-control-texture);
  box-shadow: var(--wren-control-shadow);
  font-weight: 650;
  display: flex;
  justify-content: center;
  align-items: center;
  cursor: pointer;
  font-size: 14px;

  * {
    pointer-events: none;
  }

  &:visited {
    color: var(--wren-text-inverse);
  }

  &:hover {
    background-color: var(--wren-accent-hover);
  }

  &:active {
    transform: translateY(1px);
    background-color: var(--wren-accent-active);
  }
`

const CurrentOriginTitle = styled.div`
  position: relative;
  display: flex;
  justify-content: flex-start;
  gap: 9px;
  min-width: 0;
  align-items: center;
  min-height: 50px;
  padding: 9px 14px;
  color: var(--wren-text-secondary);
  font-family: var(--wren-font-mono);
  font-size: 12px;
  font-weight: 450;

  svg {
    width: 15px;
    height: 15px;
    flex: none;
    color: var(--wren-text-muted);
  }

  > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`

const ChainButtonIcon = styled.div`
  width: 10px;
  height: 10px;
  flex: none;
  background: var(${(props) => props.$colorToken});
  border-radius: 50%;
  box-sizing: border-box;
  border: 1px solid color-mix(in srgb, var(${(props) => props.$colorToken}) 74%, white 26%);
`

const ChainLedger = styled.div`
  max-height: ${(props) => (props.$scrollable ? '225px' : 'none')};
  overflow-x: hidden;
  overflow-y: ${(props) => (props.$scrollable ? 'auto' : 'visible')};
  overscroll-behavior: contain;
  scrollbar-gutter: ${(props) => (props.$scrollable ? 'stable' : 'auto')};
`

const ChainButtonLabel = styled.div`
  display: flex;
  justify-content: flex-start;
  align-items: center;
  flex-grow: 1;
  font-size: 14px;
  font-weight: 540;
  min-height: 40px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`

const ChainButtonControl = styled.button`
  appearance: none;
  display: flex;
  min-width: 0;
  width: 100%;
  padding: 0 14px;
  align-items: center;
  gap: 10px;
  border: 0;
  color: ${(props) => (props.$selected ? 'var(--wren-text-primary)' : 'var(--wren-text-secondary)')};
  background: ${(props) => (props.$selected ? 'var(--wren-ledger-selected)' : 'transparent')};
  cursor: pointer;
  text-align: left;
  transition: background-color var(--wren-motion-fast) var(--wren-ease);

  &:hover:not(:disabled) {
    color: var(--wren-text-primary);
    background: var(--wren-surface-hover);
  }

  &:active:not(:disabled) {
    background: var(--wren-surface-active);
  }

  &:disabled {
    color: var(--wren-text-muted);
    cursor: default;
    opacity: 0.62;
  }
`

const originDomainRegex = /^(?<protocol>.+:(?:\/\/)?)(?<origin>[^#/]*)/

function parseOrigin(url = '') {
  const m = url.match(originDomainRegex)

  if (!m) {
    console.warn('Could not parse active-tab origin')
    return url
  }

  return m.groups || { origin: url, protocol: '' }
}

const chainConnected = ({ connected }) => connected === undefined || connected

const isInjectedUrl = (url = '') => url.startsWith('http://') || url.startsWith('https://')

const ChainButton = ({ chain, selected }) => {
  const { chainId, name } = chain
  const isSelectable = chainConnected(chain)
  const colorToken = getChainColorToken(chainId, chain.isTestnet === true)
  return (
    <ChainButtonControl
      type="button"
      $selected={selected}
      disabled={!isSelectable}
      aria-pressed={selected}
      title={name}
      onClick={() => {
        if (isSelectable) {
          const targetChain = toRpcChainId(chainId)
          if (targetChain) postFrameMessage({ type: 'switchChain', chainId: targetChain })
        }
      }}
    >
      <ChainButtonIcon $colorToken={colorToken} />
      <ChainButtonLabel>{name}</ChainButtonLabel>
    </ChainButtonControl>
  )
}

// const isFirefox = Boolean(window?.browser && browser?.runtime)

class _Settings extends React.Component {
  state = { confirmCredentialRotation: false }

  authenticationPanel() {
    const authentication = this.store('authentication') || { status: 'disconnected' }

    if (authentication.status === 'pairing') {
      return (
        <ClusterBoxMain>
          <Cluster>
            <ClusterRow>
              <ClusterValue>
                <PairingPanel role="status" aria-live="polite">
                  <PairingTitle>Pair this Companion</PairingTitle>
                  <PairingCode>{authentication.pairingCode}</PairingCode>
                  <PairingDetail>
                    Approve only when this code matches Wren on desktop.
                  </PairingDetail>
                </PairingPanel>
              </ClusterValue>
            </ClusterRow>
          </Cluster>
        </ClusterBoxMain>
      )
    }

    if (authentication.status === 'error') {
      return (
        <ClusterBoxMain>
          <Cluster>
            <ClusterRow>
              <ClusterValue>
                <PairingPanel>
                  <PairingTitle>Companion Authentication Failed</PairingTitle>
                  <PairingDetail>{authentication.message}</PairingDetail>
                </PairingPanel>
              </ClusterValue>
            </ClusterRow>
          </Cluster>
        </ClusterBoxMain>
      )
    }

    if (authentication.status === 'preparing' || authentication.status === 'authenticating') {
      return (
        <ClusterBoxMain>
          <Cluster>
            <ClusterRow>
              <ClusterValue>
                <PairingPanel>
                  <PairingTitle>Authenticating Companion</PairingTitle>
                  <PairingDetail>
                    Proving this Companion installation to Wren desktop.
                  </PairingDetail>
                </PairingPanel>
              </ClusterValue>
            </ClusterRow>
          </Cluster>
        </ClusterBoxMain>
      )
    }

    if (authentication.status === 'rotating') {
      return (
        <ClusterBoxMain>
          <Cluster>
            <ClusterRow>
              <ClusterValue>
                <PairingPanel>
                  <PairingTitle>Resetting Pairing</PairingTitle>
                  <PairingDetail>A new installation key is being created.</PairingDetail>
                </PairingPanel>
              </ClusterValue>
            </ClusterRow>
          </Cluster>
        </ClusterBoxMain>
      )
    }

    if (authentication.status !== 'authenticated') return null

    const confirm = this.state.confirmCredentialRotation
    return (
      <ClusterBoxMain>
        <Cluster>
          <ClusterRow>
            <ClusterValue pointerEvents>
              <PairingButton
                $confirm={confirm}
                onClick={() => {
                  if (!confirm) return this.setState({ confirmCredentialRotation: true })
                  this.setState({ confirmCredentialRotation: false })
                  postFrameMessage({ type: 'rotateCredential' })
                }}
              >
                {confirm ? 'Reset pairing? This creates a new installation key.' : 'Reset pairing'}
              </PairingButton>
            </ClusterValue>
          </ClusterRow>
        </Cluster>
      </ClusterBoxMain>
    )
  }

  notConnected() {
    return (
      <Cluster>
        <ClusterRow>
          <ClusterValue>
            <div>
              <CannotConnectSub $standalone>
                Wren is unavailable. Start the desktop app to continue.
              </CannotConnectSub>
            </div>
          </ClusterValue>
        </ClusterRow>
        <ClusterRow>
          <ClusterValue pointerEvents>
            <Download
              href="https://github.com/jorphex/wren/releases"
              target="_blank"
              rel="noreferrer"
            >
              Download Wren
            </Download>
          </ClusterValue>
        </ClusterRow>
      </Cluster>
    )
  }

  unsupportedTab(origin) {
    return (
      <Cluster>
        <ClusterRow>
          <ClusterValue>
            <div>
              <UnsupportedTab>This browser tab is not available to Wren.</UnsupportedTab>
              <CannotConnectSub>
                <UnsupportedOrigin title={origin}>{origin}</UnsupportedOrigin>
              </CannotConnectSub>
            </div>
          </ClusterValue>
        </ClusterRow>
      </Cluster>
    )
  }

  desktopStatus() {
    const isConnected = this.store('frameConnected')

    return (
      <DesktopStatusControl
        type="button"
        $connected={isConnected}
        disabled={!isConnected}
        aria-live="polite"
        onClick={() => postFrameMessage({ type: 'summon' })}
      >
        <LogoWrap>
          <img
            alt=""
            aria-hidden="true"
            src={isConnected ? '../icons/icon16good.png' : '../icons/icon16moon.png'}
          />
        </LogoWrap>
        <DesktopStatus $connected={isConnected}>
          {isConnected ? 'Desktop connected' : 'Desktop unavailable'}
        </DesktopStatus>
        {isConnected ? (
          <span aria-hidden="true">
            <svg viewBox="0 0 512 512">
              <path
                fill="currentColor"
                d="M416 32h-64c-17.67 0-32 14.33-32 32s14.33 32 32 32h64c17.67 0 32 14.33 32 32v256c0 17.67-14.33 32-32 32h-64c-17.67 0-32 14.33-32 32s14.33 32 32 32h64c53.02 0 96-42.98 96-96V128C512 74.98 469 32 416 32zM342.6 233.4l-128-128c-12.51-12.51-32.76-12.49-45.25 0c-12.5 12.5-12.5 32.75 0 45.25L242.8 224H32C14.31 224 0 238.3 0 256s14.31 32 32 32h210.8l-73.38 73.38c-12.5 12.5-12.5 32.75 0 45.25s32.75 12.5 45.25 0l128-128C355.1 266.1 355.1 245.9 342.6 233.4z"
              />
            </svg>
          </span>
        ) : null}
      </DesktopStatusControl>
    )
  }

  appearAsMMToggle() {
    const mmAppear = this.props.mmAppear

    return (
      <ClusterRow>
        <IdentityRow>
          <AppearDescription>
            <span>{mmAppear ? 'Injecting as MetaMask' : 'Injecting as Wren'}</span>
          </AppearDescription>
          <IdentityChoices role="group" aria-label="Injecting as">
            <IdentityButton
              type="button"
              $selected={!mmAppear}
              aria-pressed={!mmAppear}
              onClick={() => {
                if (mmAppear) toggleLocalSetting(APPEAR_AS_MM)
              }}
            >
              Wren
            </IdentityButton>
            <IdentityButton
              type="button"
              $selected={mmAppear}
              aria-pressed={mmAppear}
              onClick={() => {
                if (!mmAppear) toggleLocalSetting(APPEAR_AS_MM)
              }}
            >
              MetaMask
            </IdentityButton>
          </IdentityChoices>
        </IdentityRow>
      </ClusterRow>
    )
  }

  chainSelect() {
    const chains = this.store('availableChains') || []
    const currentChain = this.store('currentChain')

    return (
      <ChainLedger $scrollable={chains.length > 6}>
        {chains.map((chain) => (
          <ClusterRow key={chain.chainId}>
            <ChainButton chain={chain} selected={chain.chainId === parseInt(currentChain, 16)} />
          </ClusterRow>
        ))}
      </ChainLedger>
    )
  }

  currentChain() {
    try {
      const availableChains = this.store('availableChains')
      const currentChain = this.store('currentChain')
      const currentChainDetails = availableChains.find(
        ({ chainId }) => toRpcChainId(chainId) === currentChain
      )
      if (currentChainDetails && currentChainDetails.name) {
        return currentChainDetails.name
      } else {
        const chainInt = parseInt(currentChain, 16)
        if (isNaN(chainInt)) {
          return '?'
        } else {
          return chainInt
        }
      }
    } catch (e) {
      return '?'
    }
  }

  renderMainPanel() {
    const isConnected = this.store('frameConnected')
    const {
      tab: { url },
      isSupportedTab
    } = this.props
    const { protocol, origin } = parseOrigin(url)

    if (!isConnected) {
      return <ClusterBoxMain>{this.notConnected()}</ClusterBoxMain>
    }

    if (!isSupportedTab) {
      return <ClusterBoxMain>{this.unsupportedTab(protocol + origin)}</ClusterBoxMain>
    }

    return (
      <>
        <ClusterBoxMain>
          <CurrentOriginTitle title={origin}>
            <svg viewBox="0 0 512 512">
              <path
                fill="currentColor"
                d="M448 32C483.3 32 512 60.65 512 96V416C512 451.3 483.3 480 448 480H64C28.65 480 0 451.3 0 416V96C0 60.65 28.65 32 64 32H448zM96 96C78.33 96 64 110.3 64 128C64 145.7 78.33 160 96 160H416C433.7 160 448 145.7 448 128C448 110.3 433.7 96 416 96H96z"
              />
            </svg>
            <span>{origin}</span>
          </CurrentOriginTitle>
          <Cluster>
            {this.store('availableChains').length ? <>{this.chainSelect()}</> : null}
            {this.appearAsMMToggle()}
          </Cluster>
        </ClusterBoxMain>
      </>
    )
  }

  render() {
    const authentication = this.store('authentication') || { status: 'disconnected' }
    const isAuthenticated = authentication.status === 'authenticated'

    return (
      <>
        <SettingsScroll>
          <ClusterBoxMain>{this.desktopStatus()}</ClusterBoxMain>
          {!isAuthenticated ? this.authenticationPanel() : null}
          {this.renderMainPanel()}
          {isAuthenticated ? this.authenticationPanel() : null}
        </SettingsScroll>
      </>
    )
  }
}

const Settings = Restore.connect(_Settings, store)

const frameConnect = chrome.runtime.connect({ name: 'frame_settings' })
let framePortConnected = true
let refreshTimer

const disconnectFramePort = () => {
  if (!framePortConnected) return
  framePortConnected = false
  clearInterval(refreshTimer)
  store.setFrameConnected(false)
  store.setAuthentication({ status: 'disconnected' })
}

const postFrameMessage = (message) => {
  if (!framePortConnected) return false

  try {
    frameConnect.postMessage(message)
    return true
  } catch {
    disconnectFramePort()
    return false
  }
}

refreshTimer = setInterval(() => postFrameMessage({ type: 'refresh' }), 5000)
frameConnect.onDisconnect.addListener(disconnectFramePort)
window.addEventListener('unload', () => clearInterval(refreshTimer), { once: true })

frameConnect.onMessage.addListener((state) => {
  if (state.type !== 'state') return
  store.setFrameConnected(state.connected)
  store.setAuthentication(parseAuthenticationState(state.authentication))
  store.setChains(state.availableChains)
  store.setCurrentChain(state.currentChain)
})

async function getInitialSettings(tabId) {
  return getLocalSetting(tabId, APPEAR_AS_MM)
}

document.addEventListener('DOMContentLoaded', async function () {
  const activeTab = await getActiveTab()
  const isInjectedTab = isInjectedUrl(activeTab?.url)

  const mmAppear = isInjectedTab ? await getInitialSettings(activeTab.id) : false

  const root = document.getElementById('root')

  createRoot(root).render(
    <Settings tab={activeTab} isSupportedTab={isInjectedTab} mmAppear={mmAppear} />
  )
})
