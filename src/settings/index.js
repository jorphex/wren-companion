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
  desktopStatus: 'checking',
  chainSwitchResult: null,
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
  setDesktopStatus: (u, status) => {
    u('desktopStatus', () => status)
  },
  setChainSwitchResult: (u, result) => {
    u('chainSwitchResult', () => result)
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

async function executeScript(tabId, func, args, documentId) {
  try {
    const result = await chrome.scripting.executeScript({
      target: {
        tabId,
        ...(documentId ? { documentIds: [documentId] } : {})
      },
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

async function getLocalSetting(tab) {
  const results = await executeScript(
    tab.id,
    (key) => ({ value: localStorage.getItem(key), url: window.location.href }),
    [APPEAR_AS_MM]
  )
  const result = results?.[0]

  if (!result || result.result?.url !== tab.url) return { value: false }

  try {
    return {
      value: JSON.parse(result.result.value || false),
      documentId: result.documentId,
      url: result.result.url
    }
  } catch {
    return { value: false }
  }
}

async function setLocalSetting(tab, document, setting, value) {
  const activeTab = await getActiveTab()
  if (activeTab?.id !== tab.id || !isInjectedUrl(activeTab.url) || activeTab.url !== document.url) {
    return false
  }

  const results = await executeScript(
    tab.id,
    (key, value, expectedUrl) => {
      if (window.location.href !== expectedUrl) return false
      localStorage.setItem(key, JSON.stringify(value))
      window.location.reload()
      return true
    },
    [setting, value, document.url],
    document.documentId
  )

  return results?.[0]?.result === true
}

const SettingsScroll = styled.main`
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  box-sizing: border-box;
  max-height: 600px;
  background: var(--wren-bg-canvas);

  > * {
    flex: none;
  }
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
  flex-wrap: wrap;
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

const IdentityFeedback = styled.div`
  flex: 1 0 100%;
  order: 3;
`

const IdentityButton = styled.button`
  appearance: none;
  min-width: 72px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid ${(props) => (props.$selected ? 'var(--wren-accent-primary)' : 'transparent')};
  border-radius: 3px;
  color: ${(props) => (props.$selected ? 'var(--wren-text-primary)' : 'var(--wren-text-tertiary)')};
  background: ${(props) => (props.$selected ? 'var(--wren-accent-primary-soft)' : 'transparent')};
  box-shadow: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 580;
  transition:
    color var(--wren-motion-fast) var(--wren-ease),
    background-color var(--wren-motion-fast) var(--wren-ease),
    border-color var(--wren-motion-fast) var(--wren-ease);

  &:hover {
    color: var(--wren-text-primary);
    background: ${(props) =>
      props.$selected ? 'var(--wren-accent-primary-soft)' : 'var(--wren-surface-hover)'};
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

const StateNotice = styled.div`
  padding: 22px 24px 24px;
  color: var(--wren-text-secondary);
  font-size: 14px;
  line-height: 1.5;
  text-align: center;
`

const StateNoticeTitle = styled.div`
  color: var(--wren-text-primary);
  font-size: 16px;
  font-weight: 620;
`

const StateNoticeBody = styled.div`
  margin-top: 8px;
`

const StateNoticeAction = styled.button`
  appearance: none;
  min-height: 44px;
  margin-top: 16px;
  padding: 0 14px;
  border: 1px solid var(--wren-accent-hover);
  border-radius: var(--wren-radius-sm);
  color: var(--wren-text-inverse);
  background: var(--wren-accent);
  background-image: var(--wren-control-texture);
  box-shadow: var(--wren-control-shadow);
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 650;

  &:hover {
    background-color: var(--wren-accent-hover);
  }

  &:active {
    transform: translateY(1px);
    background-color: var(--wren-accent-active);
  }

  &:disabled {
    border-color: var(--wren-border-subtle);
    color: var(--wren-text-muted);
    background: var(--wren-bg-elevated);
    background-image: none;
    box-shadow: none;
    cursor: default;
  }
`

const StateNoticeStatus = styled.div`
  margin-top: 10px;
  color: var(--wren-text-tertiary);
  font-size: 12px;
  font-weight: 560;
`

const StateNoticeActions = styled.div`
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;

  button {
    min-height: 44px;
  }
`

const StateNoticeSecondaryAction = styled(StateNoticeAction)`
  margin-top: 0;
  border-color: var(--wren-border-default);
  color: var(--wren-text-primary);
  background: var(--wren-bg-elevated);
  background-image: none;
  box-shadow: none;

  &:hover {
    background: var(--wren-surface-hover);
  }
`

const StateNoticePrimaryAction = styled(StateNoticeAction)`
  margin-top: 0;
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
  min-height: 44px;
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
  min-height: 44px;
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

const MainPanel = styled(ClusterBoxMain)`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  /* Preserve origin (50px), one chain row (40px), and identity control (56px + divider). */
  min-height: ${(props) => {
    if (props.$chainCount > 0) return '147px'
    if (props.$chainCount === 0) return '106px'
    return '0'
  }};

  > * {
    flex: none;
  }
`

const ChainCluster = styled(Cluster)`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;

  > * {
    flex: none;
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
  flex: 0 1 auto;
  min-height: 40px;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
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
  min-height: 44px;
  gap: 10px;
  border: 0;
  color: ${(props) => (props.$selected ? 'var(--wren-text-primary)' : 'var(--wren-text-secondary)')};
  background: ${(props) => (props.$selected ? 'var(--wren-ledger-selected)' : 'transparent')};
  cursor: pointer;
  text-align: left;
  transition: background-color var(--wren-motion-fast) var(--wren-ease);
  scroll-margin-block: 4px;

  &:hover:not(:disabled) {
    color: var(--wren-text-primary);
    background: ${(props) =>
      props.$selected ? 'var(--wren-ledger-selected)' : 'var(--wren-surface-hover)'};
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

const ChainButton = ({ chain, selected, pending, tabStop, onSwitch }) => {
  const controlRef = React.useRef(null)
  const { chainId, name } = chain
  const isSelectable = chainConnected(chain) && !pending
  const colorToken = getChainColorToken(chainId, chain.isTestnet === true)

  React.useEffect(() => {
    if (selected) controlRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <ChainButtonControl
      ref={controlRef}
      type="button"
      $selected={selected}
      disabled={!isSelectable}
      role="radio"
      aria-checked={selected}
      tabIndex={tabStop ? 0 : -1}
      data-chain-id={toRpcChainId(chainId)}
      data-chain-selectable={isSelectable ? 'true' : undefined}
      title={name}
      onClick={() => {
        if (!isSelectable || selected) return
        const targetChain = toRpcChainId(chainId)
        if (targetChain) onSwitch(targetChain)
      }}
    >
      <ChainButtonIcon $colorToken={colorToken} />
      <ChainButtonLabel>{name}</ChainButtonLabel>
    </ChainButtonControl>
  )
}

// const isFirefox = Boolean(window?.browser && browser?.runtime)

class _Settings extends React.Component {
  state = {
    chainSwitch: { status: 'idle' },
    confirmCredentialRotation: false,
    identitySwitch: { status: 'idle' }
  }

  chainSwitchRequest = 0
  identityCancelRef = React.createRef()
  identityCurrentRef = React.createRef()
  identityDialogRef = React.createRef()

  componentDidUpdate() {
    const chainSwitch = this.state.chainSwitch
    if (chainSwitch.status !== 'pending') return

    const result = this.store('chainSwitchResult')
    if (result?.requestId === chainSwitch.requestId) {
      this.setState({
        chainSwitch: result.switched
          ? { status: 'idle' }
          : {
              status: result.declined ? 'rejected' : 'failed',
              previousChain: chainSwitch.previousChain,
              targetChain: chainSwitch.targetChain
            }
      })
      return
    }
  }

  requestChainSwitch = (targetChain) => {
    if (this.state.chainSwitch.status === 'pending') return

    const previousChain = this.store('currentChain')
    const requestId = `popup-${Date.now()}-${(this.chainSwitchRequest += 1)}`
    this.setState({
      chainSwitch: { status: 'pending', previousChain, requestId, targetChain }
    })

    if (!postFrameMessage({ type: 'switchChain', chainId: targetChain, requestId })) {
      this.setState({ chainSwitch: { status: 'failed', previousChain, targetChain } })
    }
  }

  focusAvailableNetwork = () => {
    document.querySelector('[data-chain-selectable="true"]')?.focus()
  }

  armIdentitySwitch = (nextValue) => {
    if (this.state.identitySwitch.status === 'pending') return
    this.setState({ identitySwitch: { status: 'confirm', target: nextValue } }, () => {
      this.identityCancelRef.current?.focus()
    })
  }

  cancelIdentitySwitch = () => {
    this.setState({ identitySwitch: { status: 'idle' } }, () => {
      this.identityCurrentRef.current?.focus()
    })
  }

  identitySwitch = async (nextValue) => {
    if (this.state.identitySwitch.status === 'pending') return
    this.setState({ identitySwitch: { status: 'pending', target: nextValue } })
    const changed = await setLocalSetting(
      this.props.tab,
      this.props.tabDocument,
      APPEAR_AS_MM,
      nextValue
    ).catch(() => false)
    if (changed) window.close()
    else this.setState({ identitySwitch: { status: 'failed', target: nextValue } })
  }

  moveRadioSelection = (event) => {
    const keys = {
      ArrowDown: 1,
      ArrowRight: 1,
      ArrowUp: -1,
      ArrowLeft: -1
    }
    const controls = [...event.currentTarget.querySelectorAll('[role="radio"]:not(:disabled)')]
    const current = event.target.closest('[role="radio"]')
    if (!current || !controls.includes(current)) return

    let nextIndex
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = controls.length - 1
    else if (keys[event.key]) {
      nextIndex = (controls.indexOf(current) + keys[event.key] + controls.length) % controls.length
    } else {
      return
    }

    event.preventDefault()
    const next = controls[nextIndex]
    if (next === current) return
    next.focus()
    next.click()
  }

  trapIdentityDialogFocus = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      this.cancelIdentitySwitch()
      return
    }
    if (event.key !== 'Tab') return

    const controls = [
      ...(this.identityDialogRef.current?.querySelectorAll('button:not(:disabled)') || [])
    ]
    if (!controls.length) return
    const currentIndex = controls.indexOf(document.activeElement)
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? controls.length - 1
        : currentIndex - 1
      : currentIndex === controls.length - 1
        ? 0
        : currentIndex + 1
    event.preventDefault()
    controls[nextIndex].focus()
  }

  statusNotice(title, body, action, status, onAction, disabled = false) {
    const isInteractive = typeof onAction === 'function' && !disabled
    return (
      <StateNotice role="status" aria-live="polite">
        <StateNoticeTitle>{title}</StateNoticeTitle>
        <StateNoticeBody>{body}</StateNoticeBody>
        {action ? (
          <StateNoticeAction type="button" disabled={!isInteractive} onClick={onAction}>
            {action}
          </StateNoticeAction>
        ) : null}
        {status ? <StateNoticeStatus>{status}</StateNoticeStatus> : null}
      </StateNotice>
    )
  }

  authenticationPanel(interactionLocked = false) {
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
                  <StateNoticeStatus>Waiting for approval</StateNoticeStatus>
                </PairingPanel>
              </ClusterValue>
            </ClusterRow>
          </Cluster>
        </ClusterBoxMain>
      )
    }

    if (authentication.status === 'upgrade-required') {
      return (
        <Cluster>
          <ClusterRow>
            <ClusterBoxMain>
              <PairingPanel role="alert">
                <PairingTitle>Update Wren</PairingTitle>
                <PairingDetail>
                  This Companion version needs a newer Wren desktop to verify its identity. Update
                  Wren, then reconnect.
                </PairingDetail>
              </PairingPanel>
            </ClusterBoxMain>
          </ClusterRow>
        </Cluster>
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
                  <PairingTitle>Connecting securely</PairingTitle>
                  <PairingDetail>Wren is verifying this Companion.</PairingDetail>
                  <StateNoticeStatus>Connecting</StateNoticeStatus>
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
                disabled={interactionLocked}
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

  checking() {
    return (
      <MainPanel>
        {this.statusNotice(
          'Connecting to Wren',
          'Looking for the Wren desktop app.',
          undefined,
          'Checking'
        )}
      </MainPanel>
    )
  }

  tabNotConnected(interactionLocked) {
    return this.statusNotice(
      'Refresh this tab',
      'This tab has not confirmed its Wren Companion connection yet.',
      'Refresh this tab',
      'Tab not connected',
      async () => {
        const activeTab = await getActiveTab()
        if (
          activeTab?.id === this.props.tab.id &&
          activeTab.url === this.props.tabDocument.url &&
          isInjectedUrl(activeTab.url)
        ) {
          chrome.tabs.reload(this.props.tab.id)
        }
      },
      interactionLocked
    )
  }

  networkUnavailable(interactionLocked) {
    const chainSwitch = this.state.chainSwitch
    if (chainSwitch.status === 'pending') {
      const target = this.store('availableChains')?.find(
        ({ chainId }) => toRpcChainId(chainId) === chainSwitch.targetChain
      )
      return this.statusNotice(
        'Switching network',
        `Waiting for Wren to switch this tab to ${target?.name || 'the selected network'}.`,
        'Switching…',
        'Pending'
      )
    }
    if (chainSwitch.status === 'rejected') {
      return this.statusNotice(
        'Network switch declined',
        'Wren kept the current network.',
        'Try again',
        'Declined',
        () => this.setState({ chainSwitch: { status: 'idle' } }),
        interactionLocked
      )
    }
    if (chainSwitch.status === 'failed') {
      return this.statusNotice(
        'Network unavailable',
        'Wren cannot use this network right now.',
        'Choose another network',
        'Unavailable',
        () => {
          this.setState({ chainSwitch: { status: 'idle' } }, this.focusAvailableNetwork)
        },
        interactionLocked
      )
    }
    return this.statusNotice(
      'Network unavailable',
      'Wren cannot use this network right now.',
      'Choose another network',
      'Unavailable',
      this.focusAvailableNetwork,
      interactionLocked
    )
  }

  noNetworks(interactionLocked) {
    return this.statusNotice(
      'No networks available',
      'Wren has no available networks for this tab.',
      'Open network settings',
      'Unavailable',
      () => postFrameMessage({ type: 'summon' }),
      interactionLocked
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

  desktopStatus(interactionLocked = false) {
    const desktopStatus = this.store('desktopStatus') || 'unavailable'
    const isConnected = desktopStatus === 'connected'
    const isChecking = desktopStatus === 'checking' || desktopStatus === 'connecting'

    return (
      <DesktopStatusControl
        type="button"
        $connected={isConnected}
        disabled={!isConnected || interactionLocked}
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
          {isConnected
            ? 'Desktop connected'
            : isChecking
              ? 'Connecting to Wren'
              : 'Desktop unavailable'}
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

  appearAsMMToggle(interactionLocked) {
    const mmAppear = this.props.mmAppear
    const identitySwitch = this.state.identitySwitch
    const targetIdentity = identitySwitch.target ? 'MetaMask' : 'Wren'

    return (
      <ClusterRow>
        <IdentityRow>
          <AppearDescription>
            <span>{mmAppear ? 'Injecting as MetaMask' : 'Injecting as Wren'}</span>
          </AppearDescription>
          <IdentityChoices
            role="radiogroup"
            aria-label="Wallet identity"
            onKeyDown={this.moveRadioSelection}
          >
            <IdentityButton
              type="button"
              $selected={!mmAppear}
              role="radio"
              aria-checked={!mmAppear}
              disabled={interactionLocked}
              tabIndex={!mmAppear ? 0 : -1}
              ref={!mmAppear ? this.identityCurrentRef : undefined}
              onClick={() => {
                if (mmAppear) this.armIdentitySwitch(false)
              }}
            >
              Wren
            </IdentityButton>
            <IdentityButton
              type="button"
              $selected={mmAppear}
              role="radio"
              aria-checked={mmAppear}
              disabled={interactionLocked}
              tabIndex={mmAppear ? 0 : -1}
              ref={mmAppear ? this.identityCurrentRef : undefined}
              onClick={() => {
                if (!mmAppear) this.armIdentitySwitch(true)
              }}
            >
              MetaMask
            </IdentityButton>
          </IdentityChoices>
          {identitySwitch.status === 'confirm' ? (
            <IdentityFeedback>
              <StateNotice
                ref={this.identityDialogRef}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="identity-switch-title"
                aria-describedby="identity-switch-description"
                onKeyDown={this.trapIdentityDialogFocus}
              >
                <StateNoticeTitle id="identity-switch-title">
                  Change wallet identity?
                </StateNoticeTitle>
                <StateNoticeBody id="identity-switch-description">
                  Switching to {targetIdentity} reloads this tab, closes this popup, and may discard
                  unsaved work. After reloading, this tab will use {targetIdentity} as its wallet.
                </StateNoticeBody>
                <StateNoticeActions>
                  <StateNoticeSecondaryAction
                    type="button"
                    ref={this.identityCancelRef}
                    onClick={this.cancelIdentitySwitch}
                  >
                    Keep current identity
                  </StateNoticeSecondaryAction>
                  <StateNoticePrimaryAction
                    type="button"
                    onClick={() => this.identitySwitch(identitySwitch.target)}
                  >
                    Switch to {targetIdentity}
                  </StateNoticePrimaryAction>
                </StateNoticeActions>
              </StateNotice>
            </IdentityFeedback>
          ) : identitySwitch.status === 'pending' ? (
            <IdentityFeedback>
              {this.statusNotice(
                'Switching wallet',
                `Refreshing this tab with ${targetIdentity}.`,
                'Switching…',
                'Pending'
              )}
            </IdentityFeedback>
          ) : identitySwitch.status === 'failed' ? (
            <IdentityFeedback>
              <StateNotice role="alert" aria-live="assertive">
                <StateNoticeTitle>Wallet unchanged</StateNoticeTitle>
                <StateNoticeBody>This tab could not switch to {targetIdentity}.</StateNoticeBody>
                <StateNoticeAction
                  type="button"
                  onClick={() => this.identitySwitch(identitySwitch.target)}
                >
                  Try again
                </StateNoticeAction>
                <StateNoticeStatus>Failed</StateNoticeStatus>
              </StateNotice>
            </IdentityFeedback>
          ) : null}
        </IdentityRow>
      </ClusterRow>
    )
  }

  chainSelect(interactionLocked) {
    const chains = this.store('availableChains') || []
    const currentChain = this.store('currentChain')
    const selectedChain = chains.find(
      (chain) => toRpcChainId(chain.chainId) === currentChain && chainConnected(chain)
    )
    const tabStopChain =
      selectedChain || chains.find((chain) => chainConnected(chain) && !interactionLocked)

    return (
      <ChainLedger role="radiogroup" aria-label="Networks" onKeyDown={this.moveRadioSelection}>
        {chains.map((chain) => (
          <ClusterRow key={chain.chainId}>
            <ChainButton
              chain={chain}
              selected={chain.chainId === parseInt(currentChain, 16)}
              pending={this.state.chainSwitch.status === 'pending' || interactionLocked}
              tabStop={chain.chainId === tabStopChain?.chainId}
              onSwitch={this.requestChainSwitch}
            />
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

  renderMainPanel(interactionLocked) {
    const desktopStatus = this.store('desktopStatus') || 'unavailable'
    const isConnected = desktopStatus === 'connected'
    const availableChains = this.store('availableChains') || []
    const {
      tab: { url },
      isSupportedTab
    } = this.props
    const { protocol, origin } = parseOrigin(url)

    if (desktopStatus === 'checking') {
      return this.checking()
    }

    if (desktopStatus === 'connecting') {
      return <MainPanel />
    }

    if (!isConnected) {
      return <MainPanel>{this.notConnected()}</MainPanel>
    }

    if (!isSupportedTab) {
      return <MainPanel>{this.unsupportedTab(protocol + origin)}</MainPanel>
    }

    if (!this.store('currentChain')) {
      return <MainPanel>{this.tabNotConnected(interactionLocked)}</MainPanel>
    }

    if (!availableChains.length) {
      return <MainPanel>{this.noNetworks(interactionLocked)}</MainPanel>
    }

    const currentChainDetails = availableChains.find(
      ({ chainId }) => toRpcChainId(chainId) === this.store('currentChain')
    )

    return (
      <MainPanel $chainCount={availableChains.length}>
        <CurrentOriginTitle title={origin}>
          <svg viewBox="0 0 512 512">
            <path
              fill="currentColor"
              d="M448 32C483.3 32 512 60.65 512 96V416C512 451.3 483.3 480 448 480H64C28.65 480 0 451.3 0 416V96C0 60.65 28.65 32 64 32H448zM96 96C78.33 96 64 110.3 64 128C64 145.7 78.33 160 96 160H416C433.7 160 448 145.7 448 128C448 110.3 433.7 96 416 96H96z"
            />
          </svg>
          <span>{origin}</span>
        </CurrentOriginTitle>
        <ChainCluster>
          {this.state.chainSwitch.status === 'pending' ||
          this.state.chainSwitch.status === 'rejected' ||
          this.state.chainSwitch.status === 'failed'
            ? this.networkUnavailable(interactionLocked)
            : !currentChainDetails || !chainConnected(currentChainDetails)
              ? this.networkUnavailable(interactionLocked)
              : null}
          {availableChains.length ? this.chainSelect(interactionLocked) : null}
          {this.appearAsMMToggle(interactionLocked)}
        </ChainCluster>
      </MainPanel>
    )
  }

  render() {
    const authentication = this.store('authentication') || { status: 'disconnected' }
    const isAuthenticated = authentication.status === 'authenticated'
    const interactionLocked =
      ['confirm', 'pending'].includes(this.state.identitySwitch.status) ||
      this.state.chainSwitch.status === 'pending'

    return (
      <>
        <SettingsScroll>
          <ClusterBoxMain>{this.desktopStatus(interactionLocked)}</ClusterBoxMain>
          {!isAuthenticated ? this.authenticationPanel(interactionLocked) : null}
          {this.renderMainPanel(interactionLocked)}
          {isAuthenticated ? this.authenticationPanel(interactionLocked) : null}
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
  store.setDesktopStatus('unavailable')
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
  if (state.type === 'chainSwitchResult') {
    store.setChainSwitchResult(state)
    return
  }
  if (state.type !== 'state') return
  const authentication = parseAuthenticationState(state.authentication)
  const desktopStatus = state.connected
    ? 'connected'
    : ['preparing', 'authenticating', 'pairing', 'rotating'].includes(authentication.status)
      ? 'connecting'
      : 'unavailable'
  store.setFrameConnected(state.connected)
  store.setDesktopStatus(desktopStatus)
  store.setAuthentication(authentication)
  store.setChains(state.availableChains)
  store.setCurrentChain(state.currentChain)
})

async function getInitialSettings(tab) {
  return getLocalSetting(tab)
}

document.addEventListener('DOMContentLoaded', async function () {
  const activeTab = await getActiveTab()
  const isInjectedTab = isInjectedUrl(activeTab?.url)

  const tabDocument = isInjectedTab ? await getInitialSettings(activeTab) : { value: false }
  const mmAppear = tabDocument.value

  const root = document.getElementById('root')

  createRoot(root).render(
    <Settings
      tab={activeTab}
      tabDocument={tabDocument}
      isSupportedTab={isInjectedTab}
      mmAppear={mmAppear}
    />
  )
})
