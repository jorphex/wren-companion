const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

let popupLayout

const root = path.join(__dirname, '..')
const globalStyle = fs.readFileSync(path.join(root, 'src', 'style', 'index.css'), 'utf8')
const backgroundSource = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8')
const injectionSource = fs.readFileSync(path.join(root, 'src', 'inject.js'), 'utf8')
const documentActionsSource = fs.readFileSync(path.join(root, 'src', 'document-actions.js'), 'utf8')
const networkRefreshSource = fs.readFileSync(path.join(root, 'src', 'network-refresh.js'), 'utf8')
const settingsSource = fs.readFileSync(path.join(root, 'src', 'settings', 'index.js'), 'utf8')
const tabDocumentActionsSource = fs.readFileSync(
  path.join(root, 'src', 'tab-document-actions.mjs'),
  'utf8'
)
const webpackSource = fs.readFileSync(path.join(root, 'webpack.config.js'), 'utf8')

test('Companion shares Wren’s wallet canvas', () => {
  assert.match(globalStyle, /--wren-bg-canvas:\s*#070907;/u)
  assert.match(globalStyle, /body \{[\s\S]*background-color:\s*var\(--wren-bg-canvas\);/u)
  assert.match(globalStyle, /url\('\.\/wren-grain\.svg'\)/u)
  assert.match(globalStyle, /radial-gradient/u)
  assert.match(
    settingsSource,
    /const SettingsScroll = styled\.main`[\s\S]*background:\s*transparent;/u
  )
})

test('popup bootstrap sizing does not depend on its provisional viewport', () => {
  const bodyStyle = globalStyle
    .match(/(?:^|\n)body \{[\s\S]*?\n\}/gu)
    ?.find((block) => block.includes('width:'))
  const settingsScroll = settingsSource.match(
    /const SettingsScroll = styled\.main`([\s\S]*?)`/u
  )?.[1]

  assert.ok(bodyStyle, 'body style block is present')
  assert.match(bodyStyle, /width:\s*420px;/u)
  assert.doesNotMatch(bodyStyle, /\b(?:vw|vh)\b/u)

  assert.ok(settingsScroll, 'SettingsScroll style block is present')
  assert.match(settingsScroll, /max-height:\s*600px;/u)
  assert.doesNotMatch(settingsScroll, /\b(?:vw|vh)\b/u)
})

test('popup tabs are accepted only in isolated qualification builds', () => {
  assert.match(backgroundSource, /globalThis\.__WREN_QUALIFICATION_POPUP_TAB__ === true/u)
  assert.match(webpackSource, /process\.env\.WREN_QUALIFICATION_POPUP_TAB === '1'/u)
  assert.match(backgroundSource, /port\.sender\?\.id === chrome\.runtime\.id/u)
  assert.match(backgroundSource, /port\.sender\.url\.startsWith\(chrome\.runtime\.getURL\(''\)\)/u)
})

test('real-browser popup qualification covers every state at 100, 125, and 150 percent', async () => {
  popupLayout ||= await import('../scripts/qualification/popup-layout.mjs')

  assert.deepEqual(popupLayout.POPUP_ZOOM_FACTORS, [1, 1.25, 1.5])
  assert.deepEqual(popupLayout.POPUP_LAYOUT_STATES, [
    'pairing',
    'connected',
    'unsupported',
    'long-chain-list',
    'network-refresh-error',
    'identity-confirmation'
  ])

  for (const state of popupLayout.POPUP_LAYOUT_STATES) {
    for (const zoom of popupLayout.POPUP_ZOOM_FACTORS) {
      const expression = popupLayout.popupLayoutExpression(zoom, state)
      assert.match(expression, new RegExp(`const zoom = ${zoom}`, 'u'))
      assert.match(expression, new RegExp(`const state = "${state}"`, 'u'))
      assert.match(expression, /document\.documentElement\.style\.zoom/u)
      assert.match(expression, /scrollIntoView/u)
    }
  }
})

test('popup evidence rejects overflow, small targets, hidden focus, and unreachable controls', async () => {
  popupLayout ||= await import('../scripts/qualification/popup-layout.mjs')
  const passing = {
    state: 'connected',
    zoom: 1.5,
    bodyCssWidth: '420px',
    controlCount: 3,
    tabbableCount: 2,
    documentScrollWidth: 420,
    documentClientWidth: 420,
    mainScrollWidth: 420,
    mainClientWidth: 420,
    undersizedControls: [],
    undersizedText: [],
    focusFailures: [],
    lastControlReachable: true
  }

  assert.doesNotThrow(() => popupLayout.assertPopupLayout(passing))
  assert.throws(
    () => popupLayout.assertPopupLayout({ ...passing, mainScrollWidth: 422 }),
    /popup overflow/u
  )
  assert.throws(
    () =>
      popupLayout.assertPopupLayout({
        ...passing,
        undersizedControls: [{ label: 'Switch', width: 43, height: 44 }]
      }),
    /active target below 44px/u
  )
  assert.throws(
    () => popupLayout.assertPopupLayout({ ...passing, focusFailures: ['Reset pairing'] }),
    /could not be focused/u
  )
  assert.throws(
    () => popupLayout.assertPopupLayout({ ...passing, lastControlReachable: false }),
    /not scroll-reachable/u
  )
})

test('network and injection choices expose selection without toggle semantics', () => {
  assert.match(settingsSource, /role="radiogroup" aria-label="Networks"/u)
  assert.match(settingsSource, /role="radiogroup"\s+aria-label="Wallet identity"/u)
  assert.match(settingsSource, /role="radio"/u)
  assert.match(settingsSource, /aria-checked=/u)
  assert.doesNotMatch(settingsSource, /aria-pressed=/u)
  assert.match(settingsSource, /tabIndex=\{tabStop \? 0 : -1\}/u)
  assert.match(settingsSource, /onKeyDown=\{this\.moveRadioSelection\}/u)
  assert.match(settingsSource, /ArrowDown: 1/u)
  assert.match(settingsSource, /ArrowUp: -1/u)
  assert.match(settingsSource, /event\.key === 'Home'/u)
  assert.match(settingsSource, /event\.key === 'End'/u)
})

test('injection identity changes require an explicit reload acknowledgement', () => {
  assert.match(settingsSource, /Change wallet identity\?/u)
  assert.match(settingsSource, /may discard\s*unsaved work/u)
  assert.match(settingsSource, /Keep current identity/u)
  assert.match(settingsSource, /Switch to \{targetIdentity\}/u)
  assert.match(settingsSource, /this\.armIdentitySwitch/u)
  assert.match(settingsSource, /aria-modal="true"/u)
  assert.match(settingsSource, /aria-labelledby="identity-switch-title"/u)
  assert.match(settingsSource, /aria-describedby="identity-switch-description"/u)
  assert.match(settingsSource, /trapIdentityDialogFocus/u)
})

test('network switch feedback is driven by the background result rather than a timeout guess', () => {
  assert.match(settingsSource, /chainSwitchResult/u)
  assert.match(settingsSource, /result\.declined \? 'rejected' : 'failed'/u)
  assert.doesNotMatch(settingsSource, /setTimeout\([^)]*chainSwitch/su)
  assert.match(backgroundSource, /type: 'chainSwitchResult'/u)
  assert.match(backgroundSource, /switchError\?\.code === 4001/u)
  assert.match(settingsSource, /if \(!isSelectable \|\| selected\) return/u)
  assert.doesNotMatch(settingsSource, /currentChain === chainSwitch\.targetChain/u)
})

test('popup distinguishes tab confirmation and network refresh from real empty state', () => {
  assert.match(backgroundSource, /tabStatus: port\.frameTabStatus \|\| 'checking'/u)
  assert.match(backgroundSource, /refreshAvailableChains\(\)/u)
  assert.match(backgroundSource, /chainsStatus: 'loading'/u)
  assert.match(networkRefreshSource, /chainsStatus: 'ready'/u)
  assert.match(networkRefreshSource, /chainsStatus: 'error'/u)
  assert.match(backgroundSource, /chainsError: null/u)
  assert.match(backgroundSource, /tabSessionState\(pageSessions/u)
  assert.match(backgroundSource, /preferredTabSession\(pageSessions/u)
  assert.match(backgroundSource, /port\.frameTabId = tab\.id/u)
  assert.match(backgroundSource, /port\.frameOrigin = origin/u)
  assert.match(injectionSource, /if \(window\.top === window\) connect\(\)/u)
  const controlClose = backgroundSource.match(/onClose: \(\) => \{([\s\S]*?)\n {2}\}\n\}\)/u)?.[1]
  assert.ok(controlClose)
  assert.doesNotMatch(controlClose, /availableChains/u)
  assert.match(settingsSource, /this\.store\('tabStatus'\) === 'checking'/u)
  assert.match(settingsSource, /\['ready', 'connected'\]\.includes\(this\.store\('tabStatus'\)\)/u)
  assert.match(settingsSource, /this\.store\('chainsStatus'\) === 'loading'/u)
  assert.match(settingsSource, /this\.store\('chainsStatus'\) === 'error'/u)
  assert.match(settingsSource, /this\.networkRefreshWarning\(interactionLocked\)/u)
  assert.match(settingsSource, /identityStatusPanel/u)
  assert.match(settingsSource, /this\.tabNotConnected\(interactionLocked\)/u)
  assert.match(settingsSource, /this\.appearAsMMToggle\(interactionLocked\)/u)
})

test('identity reload writes the confirmed value only to the captured active document', () => {
  assert.match(settingsSource, /setLocalSetting\(\n\s*chrome,\n\s*this\.props\.tab,/u)
  assert.match(tabDocumentActionsSource, /activeTab\?\.id === tab\?\.id/u)
  assert.match(tabDocumentActionsSource, /sameOrigin\(activeTab\.url, document\.url\)/u)
  assert.match(tabDocumentActionsSource, /\{ documentId: document\.documentId \}/u)
  assert.match(tabDocumentActionsSource, /browserApi\.tabs\.sendMessage/u)
  assert.match(injectionSource, /createDocumentActionListener/u)
  assert.match(documentActionsSource, /storage\.setItem\(IDENTITY_STORAGE_KEY, serialized\)/u)
  assert.match(documentActionsSource, /sendResponse\([\s\S]*setTimer\(reload, 0\)/u)
  assert.match(settingsSource, /if \(changed\) window\.close\(\)/u)
  assert.doesNotMatch(tabDocumentActionsSource, /browserApi\.tabs\.reload/u)
  assert.doesNotMatch(settingsSource, /toggleLocalSetting/u)
})

test('tab refresh runs only in the captured document and is unavailable without its identity', () => {
  assert.match(tabDocumentActionsSource, /export async function reloadCapturedTab/u)
  assert.match(tabDocumentActionsSource, /\{ documentId: document\.documentId \}/u)
  assert.match(tabDocumentActionsSource, /sendCapturedDocumentAction/u)
  assert.match(
    settingsSource,
    /const canRefresh = Boolean\(this\.props\.tabDocument\?\.documentId\)/u
  )
  assert.match(settingsSource, /canRefresh \? 'Refresh this tab' : 'Refresh unavailable'/u)
  assert.doesNotMatch(tabDocumentActionsSource, /browserApi\.tabs\.reload/u)
})

test('uses a distinct warning role, readable accent focus, one styled ledger scrollbar, and truthful typography docs', () => {
  assert.match(globalStyle, /--wren-focus-on-accent:\s*#111513;/u)
  assert.match(globalStyle, /--wren-warning:\s*#ddb467;/u)
  assert.match(globalStyle, /--wren-warning-soft:\s*#281f12;/u)
  assert.match(settingsSource, /border-inline-start:\s*3px solid var\(--wren-warning\);/u)
  assert.match(settingsSource, /background:\s*var\(--wren-warning-soft\);/u)
  assert.match(settingsSource, /outline-color:\s*var\(--wren-focus-on-accent\);/u)
  assert.match(settingsSource, /const ChainLedger = styled\.div`[\s\S]*scrollbar-width:\s*thin;/u)
  assert.doesNotMatch(globalStyle, /::-webkit-scrollbar/u)
  assert.match(
    fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
    /Fira Code is not currently\s+bundled/u
  )
})

test('pending notices cannot expose a dead action', () => {
  assert.match(settingsSource, /const isInteractive = typeof onAction === 'function' && !disabled/u)
  assert.match(settingsSource, /disabled=\{!isInteractive\}/u)
})

test('terminal authentication recovery stays explicit and confirmable', () => {
  assert.match(settingsSource, /type: 'reconnectAuthentication'/u)
  assert.match(settingsSource, />\s*Reconnect\s*</u)
  assert.match(settingsSource, /Confirm reset and compare a new code/u)
  assert.match(settingsSource, /confirmation: 'reset-pairing'/u)
  assert.match(settingsSource, /type="button"/u)
})
