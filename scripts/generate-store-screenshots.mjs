import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = path.join(root, 'store-assets', 'source')
const output = path.join(root, 'store-assets', 'screenshots')
const chromeCandidates = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']

function executable(candidates) {
  for (const candidate of candidates) {
    const result = spawnSync('sh', ['-c', `command -v "$1"`, 'sh', candidate], {
      encoding: 'utf8'
    })
    if (result.status === 0 && result.stdout.trim()) return result.stdout.trim()
  }
  throw new Error(`No supported browser found: ${candidates.join(', ')}`)
}

const data = async (file, mime) =>
  `data:${mime};base64,${(await readFile(file)).toString('base64')}`
const assets = {
  companionConnected: await data(path.join(source, 'companion-connected.png'), 'image/png'),
  companionPairing: await data(path.join(source, 'companion-pairing.png'), 'image/png'),
  dapp: await data(path.join(source, 'uniswap-home.png'), 'image/png'),
  nativePairing: await data(path.join(source, 'wren-native-pairing.png'), 'image/png'),
  review: await data(path.join(source, 'wren-request-review.png'), 'image/png'),
  font: await data(
    path.join(root, 'src', 'fonts', 'Recursive', 'Recursive_VF_1.085.woff2'),
    'font/woff2'
  )
}

const styles = `
  @font-face { font-family: Recursive; src: url('${assets.font}') format('woff2'); }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
  body { font-family: Recursive, ui-monospace, monospace; color: #edf3ef; background: #070907; }
  .canvas { position: relative; width: 1280px; height: 800px; overflow: hidden; }
  .browser { position: absolute; inset: 0; background: #f7f7f7; }
  .browser-bar { height: 62px; display: flex; align-items: center; gap: 15px; padding: 0 22px; color: #555; background: #f5f5f5; border-bottom: 1px solid #ddd; font-family: system-ui, sans-serif; font-size: 14px; }
  .dots { display: flex; gap: 7px; }
  .dot { width: 11px; height: 11px; border-radius: 50%; background: #d2d2d2; }
  .address { display: flex; align-items: center; height: 36px; width: 525px; padding: 0 15px; border: 1px solid #dedede; border-radius: 18px; background: #fff; color: #363636; }
  .browser-page { position: absolute; inset: 62px 0 0; overflow: hidden; }
  .browser-page > img { display: block; width: 1280px; height: 800px; object-fit: cover; object-position: top center; }
  .browser-page::after { content: ''; position: absolute; z-index: 1; inset: auto 0 0; height: 245px; background: linear-gradient(transparent, rgba(255,255,255,.94) 52%, #fff 78%); }
  .shade { position: absolute; inset: 62px 0 0; background: linear-gradient(90deg, rgba(7,9,7,.06), rgba(7,9,7,.16)); }
  .caption { position: absolute; z-index: 4; left: 42px; bottom: 35px; padding: 13px 18px; border: 1px solid rgba(255,255,255,.15); border-radius: 13px; color: #edf3ef; background: rgba(7,9,7,.87); box-shadow: 0 12px 36px rgba(0,0,0,.22); font-size: 19px; font-weight: 650; letter-spacing: -.01em; }
  .panel { position: absolute; z-index: 3; overflow: hidden; border: 1px solid #344139; border-radius: 18px; background: #070907; box-shadow: 0 22px 65px rgba(0,0,0,.42); }
  .panel img { display: block; }
  .companion-pairing { left: 185px; top: 222px; width: 420px; height: 239px; }
  .native-pairing { left: 677px; top: 156px; width: 504px; height: 393px; }
  .native-pairing img { width: 744px; transform: translate(-120px, -344px); }
  .connector { position: absolute; z-index: 2; left: 604px; top: 341px; width: 74px; height: 2px; background: linear-gradient(90deg, #c59a63, #91a899); }
  .connector::before, .connector::after { content: ''; position: absolute; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #91a899; }
  .connector::before { left: -2px; }
  .connector::after { right: -2px; }
  .companion-connected { right: 70px; top: 112px; width: 420px; height: 418px; }
  .review-frame { left: 54px; top: 94px; width: 685px; height: 657px; }
  .review-frame img { width: 685px; }
  .review .browser-page > img { filter: saturate(.82) brightness(.67); }
  .review .shade { background: rgba(7,9,7,.24); }
  .review .companion-connected { right: 56px; top: 177px; }
  .review .caption { left: auto; right: 77px; bottom: 88px; width: 378px; text-align: center; }
`

const browser = `
  <div class="browser">
    <div class="browser-bar">
      <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      <div class="address">app.uniswap.org</div>
    </div>
    <div class="browser-page"><img src="${assets.dapp}" alt=""></div>
  </div>
  <div class="shade" aria-hidden="true"></div>
`

const pages = [
  {
    file: 'wren-companion-store-pairing-v14.png',
    className: 'pairing',
    body: `${browser}
      <div class="panel companion-pairing"><img src="${assets.companionPairing}" alt="Wren Companion pairing code"></div>
      <div class="connector" aria-hidden="true"></div>
      <div class="panel native-pairing"><img src="${assets.nativePairing}" alt="Matching Wren desktop pairing code"></div>
      <div class="caption">Pair once. Keep approval on your desktop.</div>`
  },
  {
    file: 'wren-companion-store-connected-v14.png',
    className: 'connected',
    body: `${browser}
      <div class="panel companion-connected"><img src="${assets.companionConnected}" alt="Wren Companion connected to app.uniswap.org"></div>
      <div class="caption">Use browser dapps with Wren.</div>`
  },
  {
    file: 'wren-companion-store-review-v14.png',
    className: 'review',
    body: `${browser}
      <div class="panel review-frame"><img src="${assets.review}" alt="Wren transaction review"></div>
      <div class="panel companion-connected"><img src="${assets.companionConnected}" alt="Wren Companion connected to app.uniswap.org"></div>
      <div class="caption">Review requests in Wren before you act.</div>`
  }
]

const temporary = await mkdtemp(path.join(os.tmpdir(), 'wren-companion-store-'))
try {
  const chrome = executable(chromeCandidates)
  for (const page of pages) {
    const html = path.join(temporary, `${page.file}.html`)
    await writeFile(
      html,
      `<!doctype html><html><head><meta charset="utf-8"><style>${styles}</style></head><body><main class="canvas ${page.className}">${page.body}</main></body></html>`
    )
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-background-networking',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        '--run-all-compositor-stages-before-draw',
        '--window-size=1280,800',
        `--screenshot=${path.join(output, page.file)}`,
        `file://${html}`
      ],
      { stdio: 'ignore' }
    )
  }
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

console.log(`Generated ${pages.length} Chrome Web Store screenshots`)
