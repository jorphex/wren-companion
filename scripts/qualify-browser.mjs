import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { lstat, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { createServer as createTcpServer } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { createFirefoxManifest } from './browser-manifests.mjs'
import { CdpClient, waitForJson } from './qualification/cdp.mjs'
import { MarionetteClient } from './qualification/marionette.mjs'
import { MockDesktop, QUALIFICATION_AUTH_VERSION } from './qualification/mock-desktop.mjs'
import {
  assertPopupLayout,
  POPUP_ZOOM_FACTORS,
  popupLayoutExpression
} from './qualification/popup-layout.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const qualificationFailureDirectory = path.join(projectRoot, 'artifacts', 'qualification-failures')
const qualificationExportDirectory = process.env.WREN_COMPANION_QUALIFICATION_EXPORT
  ? path.resolve(process.env.WREN_COMPANION_QUALIFICATION_EXPORT)
  : undefined
const storeDappUrl = process.env.WREN_COMPANION_STORE_DAPP_URL
if (storeDappUrl) {
  assert.ok(qualificationExportDirectory, 'Store dapp capture requires a qualification export')
  const parsedStoreDappUrl = new URL(storeDappUrl)
  assert.equal(parsedStoreDappUrl.protocol, 'https:', 'Store dapp capture must use HTTPS')
  assert.equal(
    parsedStoreDappUrl.hostname,
    'app.uniswap.org',
    'Store dapp capture is restricted to the reviewed Uniswap example'
  )
}
const availableChains = Array.from({ length: 18 }, (_, index) => ({
  chainId: index + 1,
  name:
    index === 0
      ? 'Ethereum'
      : `Qualification network ${String(index + 1).padStart(2, '0')} with a long readable name`,
  connected: true,
  isTestnet: index > 0
}))
const storeCaptureChains = [
  { chainId: 1, name: 'Ethereum', connected: true, isTestnet: false },
  { chainId: 10, name: 'Optimism', connected: true, isTestnet: false },
  { chainId: 8453, name: 'Base', connected: true, isTestnet: false },
  { chainId: 42161, name: 'Arbitrum One', connected: true, isTestnet: false }
]
const browserArgument = process.argv.find((argument) => argument.startsWith('--browser='))
const requestedBrowser = browserArgument?.split('=')[1] || 'all'
const defaultWaitTimeout = process.env.CI ? 45_000 : 20_000
if (!['all', 'chrome', 'firefox'].includes(requestedBrowser)) {
  throw new Error('--browser must be all, chrome, or firefox')
}

function executable(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync('sh', ['-c', `command -v "$1"`, 'sh', candidate], {
      encoding: 'utf8'
    })
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  throw new Error(`No supported browser found: ${candidates.join(', ')}`)
}

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: { ...process.env, ...environment },
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    throw new Error([`${command} failed`, result.stdout, result.stderr].filter(Boolean).join('\n'))
  }
}

async function waitFor(check, label, timeout = defaultWaitTimeout) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (await check()) return
    await delay(100)
  }
  throw new Error(`Timed out waiting for ${label}`)
}

async function availablePort() {
  const server = createTcpServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  return port
}

class QualificationSite {
  constructor(kind) {
    this.kind = kind
    this.reports = []
    this.server = createServer((request, response) => this.handle(request, response))
  }

  async listen() {
    await new Promise((resolve, reject) => {
      this.server.once('error', reject)
      this.server.listen(0, '127.0.0.1', resolve)
    })
    this.port = this.server.address().port
    const hostname = qualificationExportDirectory
      ? `${this.kind === 'top' ? 'dapp' : 'frame'}.wren-demo.local`
      : '127.0.0.1'
    this.origin = `http://${hostname}:${this.port}`
  }

  html(frameOrigin, activateProvider = true) {
    const isTop = this.kind === 'top'
    return `<!doctype html>
<html><head><meta charset="utf-8"><title>${this.kind}</title>
<script>
globalThis.__wren = { announcements: [], results: [] };
function report(value) {
  globalThis.__wren.results.push(value);
  fetch('/report', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
}
window.addEventListener('eip6963:announceProvider', async (event) => {
  if (event.detail?.info?.rdns !== 'io.github.jorphex.wren') return;
  const info = event.detail.info;
  globalThis.__wren.announcements.push({ name: info.name, rdns: info.rdns, uuid: info.uuid });
  globalThis.__wren.provider = event.detail.provider;
  if (!${JSON.stringify(activateProvider)}) {
    report({ kind: '${this.kind}', type: 'announced', info: { name: info.name, rdns: info.rdns } });
    return;
  }
  try {
    const chainId = await event.detail.provider.request({ method: 'eth_chainId' });
    report({ kind: '${this.kind}', type: 'ready', chainId, info: { name: info.name, rdns: info.rdns } });
  } catch (error) {
    report({ kind: '${this.kind}', type: 'error', message: error?.message || String(error) });
  }
});
window.addEventListener('message', async (event) => {
  if (event.data !== 'wren:chain') return;
  const chainId = await globalThis.__wren.provider.request({ method: 'eth_chainId' });
  event.source.postMessage({ type: 'wren:chain', chainId, origin: location.origin }, '*');
});
window.dispatchEvent(new Event('eip6963:requestProvider'));
</script></head><body>${isTop ? `<iframe src="${frameOrigin}/"></iframe>` : 'frame'}</body></html>`
  }

  async handle(request, response) {
    if (request.method === 'POST' && request.url === '/report') {
      const chunks = []
      for await (const chunk of request) chunks.push(chunk)
      try {
        this.reports.push(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        response.writeHead(204).end()
      } catch {
        response.writeHead(400).end()
      }
      return
    }
    if (request.method !== 'GET' || !request.url?.startsWith('/')) {
      response.writeHead(404).end()
      return
    }
    const url = new URL(request.url, this.origin)
    const html = this.html(this.frameOrigin, url.searchParams.get('idle') !== '1')
    response.writeHead(200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    })
    response.end(html)
  }

  close() {
    return new Promise((resolve) => this.server.close(resolve))
  }
}

async function buildExtension(directory, desktopPort, browser) {
  run(
    path.join(projectRoot, 'node_modules', '.bin', 'webpack'),
    ['--config', 'webpack.config.js'],
    {
      WREN_BUILD_DIRECTORY: directory,
      WREN_DESKTOP_PORT: String(desktopPort),
      WREN_QUALIFICATION_POPUP_TAB: '1'
    }
  )
  run(process.execPath, [path.join(projectRoot, 'src', 'copy-static.js')], {
    WREN_BUILD_DIRECTORY: directory,
    WREN_DESKTOP_PORT: String(desktopPort)
  })
  if (browser === 'firefox') {
    const manifestPath = path.join(directory, 'manifest.json')
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    await writeFile(manifestPath, `${JSON.stringify(createFirefoxManifest(manifest), null, 2)}\n`)
  }
  const index = await readFile(path.join(directory, 'index.js'), 'utf8')
  const manifest = await readFile(path.join(directory, 'manifest.json'), 'utf8')
  assert.match(index, new RegExp(`127\\.0\\.0\\.1:${desktopPort}`, 'u'))
  assert.match(manifest, new RegExp(`127\\.0\\.0\\.1:${desktopPort}`, 'u'))
  assert.doesNotMatch(index, /127\.0\.0\.1:1248/u)
  assert.doesNotMatch(manifest, /127\.0\.0\.1:1248/u)
  assert.match(index, /wren-companion-auth-v3/u)
  assert.doesNotMatch(index, /frame-extension-auth-v2/u)
}

function assertProtocol3Authentication(desktop, browser, fingerprint) {
  const authentications = desktop.authentications.filter(
    (authentication) =>
      authentication.browser === browser &&
      (fingerprint === undefined || authentication.fingerprint === fingerprint)
  )
  assert.ok(authentications.some(({ role }) => role === 'control'))
  assert.ok(authentications.some(({ role }) => role === 'page'))
  assert.ok(
    authentications.every(
      ({ protocolVersion, desktopFingerprint }) =>
        protocolVersion === 3 && desktopFingerprint === desktop.desktopIdentity.fingerprint
    )
  )
  const control = authentications.find(({ role }) => role === 'control')
  const page = authentications.find(({ role }) => role === 'page')
  assert.equal(control.installationId, page.installationId)
  assert.equal(control.fingerprint, page.fingerprint)
  assert.notEqual(control.roleFingerprint, page.roleFingerprint)
  assert.ok(
    desktop.authenticationFrames.every(({ version, signed }) => version === 3 && signed === true)
  )
  for (const role of ['control', 'page']) {
    for (const step of ['challenge', 'response', 'authenticated']) {
      assert.ok(
        desktop.authenticationFrames.some(
          (authenticationFrame) =>
            authenticationFrame.role === role && authenticationFrame.step === step
        )
      )
    }
  }
}

async function readChromePort(profile) {
  const file = path.join(profile, 'DevToolsActivePort')
  await waitFor(async () => {
    try {
      return Boolean(await readFile(file, 'utf8'))
    } catch {
      return false
    }
  }, 'Chrome DevTools port')
  return Number((await readFile(file, 'utf8')).split('\n')[0])
}

async function stopBrowser(child) {
  if (!child || child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(3000).then(() => child.kill('SIGKILL'))
  ])
}

async function writeFailureScreenshot(browser, state, zoom, image) {
  await mkdir(qualificationFailureDirectory, { recursive: true })
  const filename = `${browser}-${state}-${String(zoom).replace('.', '_')}.png`
  await writeFile(path.join(qualificationFailureDirectory, filename), Buffer.from(image, 'base64'))
  return path.join(qualificationFailureDirectory, filename)
}

async function writeQualificationScreenshot(browser, state, image) {
  if (!qualificationExportDirectory) return
  const stats = await lstat(qualificationExportDirectory)
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    (process.platform !== 'win32' && (stats.mode & 0o777) !== 0o700)
  ) {
    throw new Error('Companion qualification export must be a private mode-0700 directory')
  }
  const target = path.join(qualificationExportDirectory, `${browser}-${state}.png`)
  await writeFile(target, Buffer.from(image, 'base64'), { mode: 0o600 })
}

async function writeQualificationPairingCode(browser, pairingCode) {
  if (!qualificationExportDirectory) return
  assert.match(pairingCode, /^\d{6}$/u, 'qualification pairing code')
  const target = path.join(qualificationExportDirectory, `${browser}-pairing-code.txt`)
  await writeFile(target, `${pairingCode}\n`, { mode: 0o600 })
}

async function captureChromeQualificationScreenshot(settings, state) {
  if (!qualificationExportDirectory) return
  await settings.evaluate(`(() => {
    document.documentElement.style.zoom = '1';
    document.scrollingElement.scrollTop = 0;
    document.scrollingElement.scrollLeft = 0;
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  })()`)
  await delay(100)
  const clip = await settings.evaluate(`(() => {
    const rect = document.body.getBoundingClientRect();
    return { x: 0, y: 0, width: Math.ceil(rect.width), height: Math.ceil(rect.height), scale: 1 };
  })()`)
  const screenshot = await settings.client.send(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: true, fromSurface: true, clip },
    settings.sessionId
  )
  await writeQualificationScreenshot('chrome', state, screenshot.data)
}

async function qualifyChromePopupLayout(settings, state) {
  const reports = []
  for (const zoom of POPUP_ZOOM_FACTORS) {
    const report = await settings.evaluate(popupLayoutExpression(zoom, state))
    try {
      assertPopupLayout(report)
    } catch (error) {
      const screenshot = await settings.client.send(
        'Page.captureScreenshot',
        { format: 'png', captureBeyondViewport: true },
        settings.sessionId
      )
      const evidence = await writeFailureScreenshot('chrome', state, zoom, screenshot.data)
      throw new Error(`${error.message}\nChrome popup screenshot: ${evidence}`)
    }
    reports.push(report)
  }
  return reports
}

async function firefoxEvaluate(marionette, expression) {
  const result = await marionette.request('WebDriver:ExecuteScript', {
    script: `return (${expression});`,
    args: [],
    newSandbox: false,
    sandbox: 'default'
  })
  return result.value === undefined ? result : result.value
}

async function firefoxWaitFor(marionette, expression, label) {
  try {
    await waitFor(
      () => firefoxEvaluate(marionette, `Boolean(${expression})`),
      label,
      Math.max(defaultWaitTimeout, 30_000)
    )
  } catch (error) {
    const state = await firefoxEvaluate(
      marionette,
      `({ href: location.href, text: document.body?.textContent?.trim().replace(/\\s+/g, ' ').slice(0, 1000) })`
    ).catch(() => undefined)
    throw new Error(`${error.message}; page=${JSON.stringify(state)}`)
  }
}

async function firefoxNavigateExtension(marionette, url) {
  await marionette.request('Marionette:SetContext', { value: 'chrome' })
  try {
    await marionette.request('WebDriver:ExecuteScript', {
      script: `
        const window = Services.wm.getMostRecentWindow('navigator:browser');
        window.gBrowser.loadURI(Services.io.newURI(arguments[0]), {
          triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
        });
        return true;
      `,
      args: [url],
      newSandbox: false,
      sandbox: 'system'
    })
  } finally {
    await marionette.request('Marionette:SetContext', { value: 'content' })
  }
  await firefoxWaitFor(
    marionette,
    `location.href === ${JSON.stringify(url)}`,
    'Firefox extension page'
  )
}

async function firefoxChromeEvaluate(marionette, script, args = []) {
  await marionette.request('Marionette:SetContext', { value: 'chrome' })
  try {
    const result = await marionette.request('WebDriver:ExecuteScript', {
      script,
      args,
      newSandbox: false,
      sandbox: 'system'
    })
    return result.value === undefined ? result : result.value
  } finally {
    await marionette.request('Marionette:SetContext', { value: 'content' })
  }
}

async function firefoxReloadExtensionInBackground(marionette, url) {
  const loaded = await firefoxChromeEvaluate(
    marionette,
    `
      const window = Services.wm.getMostRecentWindow('navigator:browser');
      const browser = [...window.gBrowser.browsers].find(
        (candidate) => candidate !== window.gBrowser.selectedBrowser && candidate.currentURI.spec === arguments[0]
      );
      if (!browser) return false;
      browser.loadURI(Services.io.newURI(arguments[0]), {
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
      });
      return true;
    `,
    [url]
  )
  assert.equal(loaded, true, 'Firefox extension qualification tab is available in background')
}

async function qualifyFirefoxPopupLayout(marionette, state) {
  const reports = []
  for (const zoom of POPUP_ZOOM_FACTORS) {
    const serialized = await firefoxEvaluate(
      marionette,
      `JSON.stringify(${popupLayoutExpression(zoom, state)})`
    )
    const report = JSON.parse(serialized)
    try {
      assertPopupLayout(report)
    } catch (error) {
      const screenshot = await marionette.request('WebDriver:TakeScreenshot', {
        id: null,
        full: true,
        scroll: false
      })
      const evidence = await writeFailureScreenshot('firefox', state, zoom, screenshot.value)
      throw new Error(`${error.message}\nFirefox popup screenshot: ${evidence}`)
    }
    reports.push(report)
  }
  return reports
}

async function chromeExtensionWorker(cdp, desktop) {
  let worker
  await waitFor(async () => {
    const identity = desktop.identity('chrome')
    if (!identity) return false
    const targets = await cdp.send('Target.getTargets')
    worker = targets.targetInfos.find(
      ({ type, url }) =>
        type === 'service_worker' && url.startsWith(`chrome-extension://${identity.extensionId}/`)
    )
    return worker
  }, 'Companion service worker')
  return worker
}

async function openChromePopup(cdp, workerSession, extensionId, label) {
  await cdp.send(
    'Runtime.evaluate',
    { expression: 'chrome.action.openPopup()', awaitPromise: true },
    workerSession
  )
  let popupTarget
  try {
    await waitFor(async () => {
      const targets = await cdp.send('Target.getTargets')
      popupTarget = targets.targetInfos.find(({ url }) =>
        url.startsWith(`chrome-extension://${extensionId}/settings.html`)
      )
      return popupTarget
    }, `Companion action popup (${label})`)
  } catch (error) {
    const targets = await cdp.send('Target.getTargets')
    throw new Error(
      `${error.message}; targets=${targets.targetInfos
        .map(({ type, url }) => `${type}:${url}`)
        .join(', ')}`
    )
  }
  return cdp.attach(popupTarget.targetId)
}

async function qualifyChrome(root, extension, desktop, top, frame) {
  const profile = path.join(root, 'chrome-profile')
  await mkdir(profile)
  const chrome = executable(['chrome', 'google-chrome', 'google-chrome-stable', 'chromium'])
  const child = spawn(
    chrome,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-features=OptimizationHints,Translate',
      '--disable-sync',
      '--metrics-recording-only',
      '--no-first-run',
      ...(qualificationExportDirectory
        ? [
            '--force-device-scale-factor=1',
            '--window-size=1280,800',
            '--host-resolver-rules=MAP dapp.wren-demo.local 127.0.0.1, MAP frame.wren-demo.local 127.0.0.1',
            ...(storeDappUrl ? ['--disable-http2', '--disable-quic'] : ['--no-proxy-server'])
          ]
        : []),
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      `--disable-extensions-except=${extension}`,
      `--load-extension=${extension}`,
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  let cdp
  try {
    const port = await readChromePort(profile)
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`)
    cdp = await new CdpClient(version.webSocketDebuggerUrl).open()
    const page = await cdp.page(`${top.origin}/`)
    const worker = await chromeExtensionWorker(cdp, desktop)
    const extensionId = new URL(worker.url).hostname
    let workerTarget = await cdp.send('Target.attachToTarget', {
      targetId: worker.targetId,
      flatten: true
    })
    let settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'pairing')
    await settings.waitFor(`document.body.textContent.includes('Pair this Companion')`)
    await qualifyChromePopupLayout(settings, 'pairing')
    if (qualificationExportDirectory) {
      const pairingCode = await settings.evaluate(`document.body.textContent.replace(/\\D/gu, '')`)
      await captureChromeQualificationScreenshot(settings, 'pairing')
      await writeQualificationPairingCode('chrome', pairingCode)
    }
    await settings.close()

    desktop.releaseAuthentication()
    await waitFor(
      () =>
        top.reports.some(({ type }) => type === 'ready') &&
        frame.reports.some(({ type }) => type === 'ready'),
      'top-frame provider reports'
    )
    assert.deepEqual(
      top.reports.find(({ type }) => type === 'ready'),
      {
        kind: 'top',
        type: 'ready',
        chainId: '0x1',
        info: { name: 'Wren', rdns: 'io.github.jorphex.wren' }
      }
    )
    assert.equal(frame.reports.find(({ type }) => type === 'ready')?.chainId, '0x2')
    await waitFor(
      () =>
        desktop.requests.some(({ origin }) => origin === top.origin) &&
        desktop.requests.some(({ origin }) => origin === frame.origin),
      'trusted top and child origins'
    )
    assert.equal(
      desktop.requests.some(({ role, origin }) => role === 'control' && origin !== undefined),
      false
    )
    assert.ok(
      desktop.requests
        .filter(({ role }) => role === 'page')
        .every(({ origin }) => origin === top.origin || origin === frame.origin)
    )
    const initialFingerprint = desktop.authentications.find(
      ({ role, browser }) => role === 'control' && browser === 'chrome'
    )?.fingerprint
    assert.ok(initialFingerprint)
    assertProtocol3Authentication(desktop, 'chrome', initialFingerprint)

    const pageAuthentications = () =>
      desktop.authentications.filter(({ role, browser }) => role === 'page' && browser === 'chrome')
        .length
    const beforeReconnect = pageAuthentications()
    desktop.closePageConnections()
    await waitFor(() => pageAuthentications() >= beforeReconnect + 2, 'page transport reconnect')
    const chainId = await page.evaluate(
      `globalThis.__wren.provider.request({ method: 'eth_chainId' })`
    )
    assert.equal(chainId, '0x1')

    const authenticatedExtensionId = desktop.authentications.find(
      ({ role, browser }) => role === 'control' && browser === 'chrome'
    )?.extensionId
    assert.equal(authenticatedExtensionId, extensionId)
    assert.match(extensionId, /^[a-p]{32}$/u)
    settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'connected')
    const buttonExpression = `[...document.querySelectorAll('button')].find((button) => button.textContent.trim().startsWith('Reset pairing'))`
    await settings.waitFor(buttonExpression)
    await settings.waitFor(`document.querySelectorAll('[data-chain-id]').length === 18`)
    await qualifyChromePopupLayout(settings, 'connected')
    await settings.evaluate(
      `document.querySelector('[data-chain-id="0x12"]').scrollIntoView({ block: 'nearest' })`
    )
    await qualifyChromePopupLayout(settings, 'long-chain-list')
    await settings.close()
    await cdp.send('Page.navigate', { url: `${top.origin}/?idle=1` }, page.sessionId)
    await page.waitFor(
      `location.search === '?idle=1' && globalThis.__wren?.announcements.length > 0`
    )
    settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'idle connected tab')
    await settings.waitFor(
      `document.querySelectorAll('[data-chain-id]').length === 18 && [...document.querySelectorAll('[role="radio"]')].some((control) => control.textContent.trim() === 'MetaMask')`
    )
    assert.equal(
      await settings.evaluate(`document.body.textContent.includes('Refresh this tab')`),
      false
    )
    const controlAuthenticationsBeforeRestart = desktop.authentications.filter(
      ({ role, browser }) => role === 'control' && browser === 'chrome'
    ).length
    desktop.availableChains = {}
    await settings.close()
    await cdp.send('ServiceWorker.enable', {}, page.sessionId)
    await cdp.send('ServiceWorker.stopAllWorkers', {}, page.sessionId)
    await waitFor(
      () =>
        desktop.authentications.filter(
          ({ role, browser }) => role === 'control' && browser === 'chrome'
        ).length > controlAuthenticationsBeforeRestart,
      'Companion service-worker restart'
    )
    await cdp.send('Page.reload', {}, page.sessionId)
    await page.waitFor(`document.readyState === 'complete'`)
    const restartedWorker = await chromeExtensionWorker(cdp, desktop)
    workerTarget = await cdp.send('Target.attachToTarget', {
      targetId: restartedWorker.targetId,
      flatten: true
    })
    await cdp.send('Target.activateTarget', { targetId: page.targetId })
    settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'cached networks')
    await settings.waitFor(
      `document.body.textContent.includes('Wren could not refresh its available networks.') && document.querySelectorAll('[data-chain-id]').length === 18`,
      15_000
    )
    await qualifyChromePopupLayout(settings, 'network-refresh-error')
    desktop.availableChains = availableChains
    await settings.evaluate(
      `[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Try again').click()`
    )
    await settings.waitFor(
      `!document.body.textContent.includes('Wren could not refresh its available networks.')`
    )
    await settings.evaluate(
      `[...document.querySelectorAll('[role="radio"]')].find((control) => control.textContent.trim() === 'MetaMask').click()`
    )
    await settings.waitFor(`document.querySelector('[role="alertdialog"]')`)
    await qualifyChromePopupLayout(settings, 'identity-confirmation')
    await settings.evaluate(
      `[...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Switch to MetaMask').click()`
    )
    await page.waitFor(
      `document.readyState === 'complete' && JSON.parse(localStorage.getItem('__frameAppearAsMM__')) === true`,
      30_000
    )
    await cdp.send('Target.activateTarget', { targetId: page.targetId })
    settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'switched identity')
    await settings.waitFor(
      `document.body.textContent.includes('Injecting as MetaMask') && !document.body.textContent.includes('Refresh this tab')`
    )
    if (qualificationExportDirectory) {
      await settings.close()
      desktop.availableChains = storeCaptureChains
      if (storeDappUrl) {
        await cdp.send('Page.navigate', { url: storeDappUrl }, page.sessionId)
        await page.waitFor(`location.hostname === 'app.uniswap.org'`, 45_000)
        await page.evaluate(`new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('Wren provider announcement timed out')), 10000);
          const onProvider = async (event) => {
            if (event.detail?.info?.rdns !== 'io.github.jorphex.wren') return;
            window.removeEventListener('eip6963:announceProvider', onProvider);
            clearTimeout(timeout);
            try {
              resolve(await event.detail.provider.request({ method: 'eth_chainId' }));
            } catch (error) {
              reject(error);
            }
          };
          window.addEventListener('eip6963:announceProvider', onProvider);
          window.dispatchEvent(new Event('eip6963:requestProvider'));
        })`)
        await waitFor(
          () => desktop.requests.some(({ origin }) => origin === new URL(storeDappUrl).origin),
          'store dapp provider request',
          45_000
        )
        await delay(4_000)
      }
      await cdp.send(
        'Runtime.evaluate',
        {
          expression: `chrome.alarms.create('check-client-status', { when: Date.now() + 50 })`
        },
        workerTarget.sessionId
      )
      await delay(250)
      settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'store capture')
      await settings.waitFor(`document.querySelectorAll('[data-chain-id]').length === 4`)
      await captureChromeQualificationScreenshot(settings, 'connected')
      await settings.close()
      desktop.availableChains = availableChains
      await cdp.send(
        'Runtime.evaluate',
        {
          expression: `chrome.alarms.create('check-client-status', { when: Date.now() + 50 })`
        },
        workerTarget.sessionId
      )
      await delay(250)
      settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'credential reset')
      await settings.waitFor(`document.querySelectorAll('[data-chain-id]').length === 18`)
    }
    const oldFingerprints = new Set(
      desktop.authentications
        .filter(({ browser }) => browser === 'chrome')
        .map(({ fingerprint }) => fingerprint)
    )
    const installationId = desktop.authentications.find(
      ({ role, browser }) => role === 'control' && browser === 'chrome'
    ).installationId
    await settings.evaluate(`${buttonExpression}.click()`)
    await settings.waitFor(
      `${buttonExpression}.textContent.includes('creates a new installation key')`
    )
    await settings.evaluate(`${buttonExpression}.click()`)
    await waitFor(
      () =>
        desktop.authentications.some(
          ({ browser, fingerprint }) => browser === 'chrome' && !oldFingerprints.has(fingerprint)
        ),
      'credential reset'
    )
    const rotatedFingerprint = desktop.authentications.find(
      ({ browser, fingerprint }) => browser === 'chrome' && !oldFingerprints.has(fingerprint)
    )?.fingerprint
    assert.ok(rotatedFingerprint)
    await waitFor(
      () =>
        desktop.authentications.some(
          ({ browser, fingerprint, role }) =>
            browser === 'chrome' && fingerprint === rotatedFingerprint && role === 'control'
        ) &&
        desktop.authentications.some(
          ({ browser, fingerprint, role }) =>
            browser === 'chrome' && fingerprint === rotatedFingerprint && role === 'page'
        ),
      'rotated control and page credentials'
    )
    assert.ok(
      desktop.authentications.some(
        (authentication) =>
          authentication.browser === 'chrome' &&
          authentication.installationId === installationId &&
          !oldFingerprints.has(authentication.fingerprint)
      )
    )
    assertProtocol3Authentication(desktop, 'chrome', rotatedFingerprint)

    const preRecoveryFingerprints = new Set(
      desktop.authentications
        .filter(({ browser }) => browser === 'chrome')
        .map(({ fingerprint }) => fingerprint)
    )
    const replacementDesktopFingerprint = await desktop.replaceDesktopIdentity()
    await settings.waitFor(`document.body.textContent.includes('Wren identity changed')`)
    await settings.evaluate(`${buttonExpression}.click()`)
    const confirmedIdentityReset = `[...document.querySelectorAll('button')].find((button) => button.textContent.includes('Confirm reset and compare a new code'))`
    await settings.waitFor(confirmedIdentityReset)
    await settings.evaluate(`${confirmedIdentityReset}.click()`)
    await waitFor(
      () =>
        desktop.authentications.some(
          ({ browser, fingerprint, role, desktopFingerprint }) =>
            browser === 'chrome' &&
            !preRecoveryFingerprints.has(fingerprint) &&
            role === 'control' &&
            desktopFingerprint === replacementDesktopFingerprint
        ) &&
        desktop.authentications.some(
          ({ browser, fingerprint, role, desktopFingerprint }) =>
            browser === 'chrome' &&
            !preRecoveryFingerprints.has(fingerprint) &&
            role === 'page' &&
            desktopFingerprint === replacementDesktopFingerprint
        ),
      'explicit desktop identity recovery'
    )
    const recoveredFingerprint = desktop.authentications.find(
      ({ browser, fingerprint, desktopFingerprint }) =>
        browser === 'chrome' &&
        !preRecoveryFingerprints.has(fingerprint) &&
        desktopFingerprint === replacementDesktopFingerprint
    )?.fingerprint
    assert.ok(recoveredFingerprint)
    assertProtocol3Authentication(desktop, 'chrome', recoveredFingerprint)
    await settings.waitFor(buttonExpression)
    await settings.close()

    const blank = await cdp.page('about:blank')
    await cdp.send('Target.activateTarget', { targetId: blank.targetId })
    settings = await openChromePopup(cdp, workerTarget.sessionId, extensionId, 'unsupported')
    await settings.waitFor(
      `document.body.textContent.includes('This browser tab is not available to Wren.')`
    )
    await qualifyChromePopupLayout(settings, 'unsupported')
    await settings.close()
    await blank.close()
    await page.close()
  } catch (error) {
    throw new Error(`${error.message}\nChrome diagnostics:\n${stderr.slice(-4000)}`)
  } finally {
    cdp?.close()
    await stopBrowser(child)
  }
}

async function qualifyFirefox(root, extension, desktop, top, frame) {
  const profile = path.join(root, 'firefox-profile')
  await mkdir(profile, { recursive: true })
  const marionettePort = await availablePort()
  await writeFile(
    path.join(profile, 'user.js'),
    [
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("datareporting.policy.dataSubmissionEnabled", false);',
      'user_pref("extensions.autoDisableScopes", 0);',
      'user_pref("extensions.enabledScopes", 15);',
      'user_pref("extensions.update.enabled", false);',
      `user_pref("marionette.port", ${marionettePort});`,
      'user_pref("xpinstall.signatures.required", false);'
    ].join('\n')
  )
  const firefox = executable(['firefox'])
  const child = spawn(
    firefox,
    [
      '--headless',
      '--marionette',
      '-remote-allow-system-access',
      '--no-remote',
      '--profile',
      profile,
      'about:blank'
    ],
    {
      env: {
        ...process.env,
        MOZ_CRASHREPORTER_DISABLE: '1',
        MOZ_DISABLE_AUTO_SAFE_MODE: '1'
      },
      stdio: ['ignore', 'ignore', 'pipe']
    }
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  let marionette
  try {
    marionette = await new MarionetteClient(marionettePort).open()
    const installed = await marionette.request('Addon:Install', {
      path: extension,
      temporary: true
    })
    assert.equal(installed.value, '{645ed7c6-d25f-4256-b29a-10e1e0633cf5}')
    await marionette.request('WebDriver:Navigate', { url: `${top.origin}/` })
    const initialHandles = await marionette.request('WebDriver:GetWindowHandles')
    const topHandle = (initialHandles.value || initialHandles)[0]
    await waitFor(() => desktop.identity('firefox'), 'Firefox Companion identity', 30_000)
    const extensionId = desktop.identity('firefox').extensionId
    const popupWindow = await marionette.request('WebDriver:NewWindow', { type: 'tab' })
    const popupHandle = popupWindow.value?.handle || popupWindow.handle
    await marionette.request('WebDriver:SwitchToWindow', { handle: popupHandle })
    await firefoxNavigateExtension(marionette, `moz-extension://${extensionId}/settings.html`)
    await marionette.request('WebDriver:SetWindowRect', {
      x: 0,
      y: 0,
      width: 680,
      height: 720
    })
    await marionette.request('WebDriver:SwitchToWindow', { handle: topHandle })
    await firefoxReloadExtensionInBackground(
      marionette,
      `moz-extension://${extensionId}/settings.html`
    )
    await delay(800)
    await marionette.request('WebDriver:SwitchToWindow', { handle: popupHandle })
    try {
      await firefoxWaitFor(
        marionette,
        `document.body.textContent.includes('Pair this Companion')`,
        'Firefox pairing popup'
      )
    } catch (error) {
      throw new Error(
        `${error.message}; connections=${JSON.stringify(
          [...desktop.connections].map(({ role, identity, state }) => ({ role, identity, state }))
        )}`
      )
    }
    await qualifyFirefoxPopupLayout(marionette, 'pairing')

    desktop.releaseAuthentication()
    await waitFor(
      () =>
        top.reports.some(({ type }) => type === 'ready') &&
        frame.reports.some(({ type }) => type === 'ready'),
      'Firefox top-frame provider reports',
      30_000
    )
    const firefoxAuth = desktop.authentications.filter(({ browser }) => browser === 'firefox')
    assert.ok(firefoxAuth.some(({ role }) => role === 'control'))
    assert.ok(firefoxAuth.filter(({ role }) => role === 'page').length >= 2)
    assert.ok(desktop.requests.some(({ origin }) => origin === top.origin))
    assert.ok(desktop.requests.some(({ origin }) => origin === frame.origin))
    assert.ok(
      desktop.requests
        .filter(({ role }) => role === 'page')
        .every(({ origin }) => origin === top.origin || origin === frame.origin)
    )
    const firefoxFingerprint = firefoxAuth.find(({ role }) => role === 'control')?.fingerprint
    assert.ok(firefoxFingerprint)
    assertProtocol3Authentication(desktop, 'firefox', firefoxFingerprint)
    assert.equal(top.reports.find(({ type }) => type === 'ready')?.chainId, '0x1')
    assert.equal(frame.reports.find(({ type }) => type === 'ready')?.chainId, '0x2')
    await firefoxWaitFor(
      marionette,
      `document.body.textContent.includes('Reset pairing') && document.querySelectorAll('[data-chain-id]').length === 18`,
      'Firefox connected popup'
    )
    await qualifyFirefoxPopupLayout(marionette, 'connected')
    await firefoxEvaluate(
      marionette,
      `(() => { document.querySelector('[data-chain-id="0x12"]').scrollIntoView({ block: 'nearest' }); return true })()`
    )
    await qualifyFirefoxPopupLayout(marionette, 'long-chain-list')
    await marionette.request('WebDriver:SwitchToWindow', { handle: topHandle })
    await marionette.request('WebDriver:Navigate', { url: `${top.origin}/?idle=1` })
    await firefoxWaitFor(
      marionette,
      `location.search === '?idle=1' && document.readyState === 'complete'`,
      'Firefox idle provider page'
    )
    await delay(800)
    await firefoxReloadExtensionInBackground(
      marionette,
      `moz-extension://${extensionId}/settings.html`
    )
    await delay(800)
    await marionette.request('WebDriver:SwitchToWindow', { handle: popupHandle })
    await firefoxWaitFor(
      marionette,
      `document.querySelectorAll('[data-chain-id]').length === 18 && [...document.querySelectorAll('[role="radio"]')].some((control) => control.textContent.trim() === 'MetaMask') && !document.body.textContent.includes('Refresh this tab')`,
      'Firefox idle connected popup'
    )
    desktop.availableChains = {}
    await marionette.request('WebDriver:SwitchToWindow', { handle: topHandle })
    await firefoxReloadExtensionInBackground(
      marionette,
      `moz-extension://${extensionId}/settings.html`
    )
    await delay(800)
    await marionette.request('WebDriver:SwitchToWindow', { handle: popupHandle })
    await firefoxWaitFor(
      marionette,
      `document.body.textContent.includes('Wren could not refresh its available networks.') && document.querySelectorAll('[data-chain-id]').length === 18`,
      'Firefox network refresh error'
    )
    await qualifyFirefoxPopupLayout(marionette, 'network-refresh-error')
    desktop.availableChains = availableChains
    await marionette.request('WebDriver:SwitchToWindow', { handle: topHandle })
    await firefoxReloadExtensionInBackground(
      marionette,
      `moz-extension://${extensionId}/settings.html`
    )
    await delay(800)
    await marionette.request('WebDriver:SwitchToWindow', { handle: popupHandle })
    await firefoxWaitFor(
      marionette,
      `!document.body.textContent.includes('Wren could not refresh its available networks.')`,
      'Firefox network refresh recovery'
    )
    await firefoxEvaluate(
      marionette,
      `(() => { [...document.querySelectorAll('[role="radio"]')].find((control) => control.textContent.trim() === 'MetaMask').click(); return true })()`
    )
    await firefoxWaitFor(
      marionette,
      `document.querySelector('[role="alertdialog"]')`,
      'Firefox identity confirmation'
    )
    await qualifyFirefoxPopupLayout(marionette, 'identity-confirmation')
    const selectedDappBehindPopup = await firefoxChromeEvaluate(
      marionette,
      `
        const window = Services.wm.getMostRecentWindow('navigator:browser');
        const browser = [...window.gBrowser.browsers].find(
          (candidate) => candidate.currentURI.spec.startsWith(arguments[0])
        );
        if (!browser) return false;
        window.gBrowser.selectedTab = window.gBrowser.getTabForBrowser(browser);
        return true;
      `,
      [top.origin]
    )
    assert.equal(selectedDappBehindPopup, true, 'Firefox dapp tab remains active behind popup')
    await firefoxEvaluate(
      marionette,
      `(() => {
        [...document.querySelectorAll('button')]
          .find((button) => button.textContent.trim() === 'Switch to MetaMask')
          .click();
        return true;
      })()`
    )
    await marionette.request('WebDriver:SwitchToWindow', { handle: topHandle })
    await firefoxWaitFor(
      marionette,
      `document.readyState === 'complete' && JSON.parse(localStorage.getItem('__frameAppearAsMM__')) === true`,
      'Firefox identity switch reload'
    )

    const recoveryPopupWindow = await marionette.request('WebDriver:NewWindow', { type: 'tab' })
    const recoveryPopupHandle = recoveryPopupWindow.value?.handle || recoveryPopupWindow.handle
    await marionette.request('WebDriver:SwitchToWindow', { handle: recoveryPopupHandle })
    await firefoxNavigateExtension(marionette, `moz-extension://${extensionId}/settings.html`)
    await marionette.request('WebDriver:SwitchToWindow', { handle: topHandle })
    await firefoxReloadExtensionInBackground(
      marionette,
      `moz-extension://${extensionId}/settings.html`
    )
    await delay(800)
    await marionette.request('WebDriver:SwitchToWindow', { handle: recoveryPopupHandle })
    await firefoxWaitFor(
      marionette,
      `document.body.textContent.includes('Injecting as MetaMask') && !document.body.textContent.includes('Refresh this tab')`,
      'Firefox switched identity popup'
    )

    const unsupportedWindow = await marionette.request('WebDriver:NewWindow', { type: 'tab' })
    const unsupportedHandle = unsupportedWindow.value?.handle || unsupportedWindow.handle
    await marionette.request('WebDriver:SwitchToWindow', { handle: unsupportedHandle })
    await marionette.request('WebDriver:Navigate', { url: 'about:blank' })
    await firefoxReloadExtensionInBackground(
      marionette,
      `moz-extension://${extensionId}/settings.html`
    )
    await delay(800)
    await marionette.request('WebDriver:SwitchToWindow', { handle: recoveryPopupHandle })
    await firefoxWaitFor(
      marionette,
      `document.body.textContent.includes('This browser tab is not available to Wren.')`,
      'Firefox unsupported popup'
    )
    await qualifyFirefoxPopupLayout(marionette, 'unsupported')
  } catch (error) {
    throw new Error(`${error.message}\nFirefox diagnostics:\n${stderr.slice(-4000)}`)
  } finally {
    await marionette?.close()
    await stopBrowser(child)
  }
}

async function qualify(browser) {
  assert.equal(QUALIFICATION_AUTH_VERSION, 3, 'Browser qualification must use protocol 3')
  const root = await mkdtemp(path.join(os.tmpdir(), `wren-companion-${browser}-`))
  const extension = path.join(root, 'extension')
  const desktop = new MockDesktop({ availableChains, holdAuthentication: true })
  const top = new QualificationSite('top')
  const frame = new QualificationSite('frame')
  try {
    await desktop.listen()
    await top.listen()
    await frame.listen()
    top.frameOrigin = frame.origin
    frame.frameOrigin = frame.origin
    desktop.setChainId(top.origin, '0x1')
    desktop.setChainId(frame.origin, '0x2')
    await buildExtension(extension, desktop.port, browser)
    if (browser === 'chrome') await qualifyChrome(root, extension, desktop, top, frame)
    else await qualifyFirefox(root, extension, desktop, top, frame)
    console.log(
      `${browser}: qualified EIP-6963, protocol 3, isolated origins, and popup states at 100/125/150% in a disposable profile on port ${desktop.port}`
    )
  } finally {
    await Promise.allSettled([desktop.close(), top.close(), frame.close()])
    await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
}

const browsers = requestedBrowser === 'all' ? ['chrome', 'firefox'] : [requestedBrowser]
for (const browser of browsers) await qualify(browser)
