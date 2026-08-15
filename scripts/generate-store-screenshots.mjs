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
  companion: await data(path.join(source, 'companion-connected.png'), 'image/png'),
  connections: await data(path.join(source, 'wren-local-connections.png'), 'image/png'),
  review: await data(path.join(source, 'wren-request-review.png'), 'image/png'),
  icon: await data(path.join(root, 'src', 'icons', 'icon128.png'), 'image/png'),
  font: await data(
    path.join(root, 'src', 'fonts', 'Recursive', 'Recursive_VF_1.085.woff2'),
    'font/woff2'
  )
}

const styles = `
  @font-face { font-family: Recursive; src: url('${assets.font}') format('woff2'); }
  * { box-sizing: border-box; }
  html, body { margin: 0; width: 1280px; height: 800px; overflow: hidden; }
  body {
    font-family: Recursive, ui-monospace, monospace;
    color: #edf3ef;
    background:
      radial-gradient(circle at 76% 22%, rgba(186, 139, 81, .12), transparent 35%),
      radial-gradient(circle at 10% 90%, rgba(92, 126, 105, .12), transparent 36%),
      #0b0f0d;
  }
  .canvas { position: relative; width: 1280px; height: 800px; padding: 52px 64px; }
  .brand { display: flex; align-items: center; gap: 16px; color: #d7e4dc; font-size: 16px; font-weight: 650; }
  .brand img { width: 44px; height: 44px; border-radius: 12px; }
  h1 { margin: 23px 0 9px; font-size: 43px; line-height: 1.08; letter-spacing: -.035em; font-weight: 680; }
  .lede { margin: 0; max-width: 820px; color: #aebbb3; font-size: 18px; line-height: 1.5; }
  .stage { position: absolute; left: 64px; right: 64px; bottom: 48px; height: 490px; }
  .panel { position: absolute; overflow: hidden; border: 1px solid #344139; border-radius: 22px; background: #070b09; box-shadow: 0 24px 70px rgba(0,0,0,.42); }
  .label { position: absolute; z-index: 3; top: 15px; left: 18px; padding: 8px 11px; border: 1px solid #3b4a40; border-radius: 999px; color: #dbe7df; background: rgba(12,17,14,.92); font-size: 13px; font-weight: 630; }
  .panel img { display: block; }
  .companion { right: 20px; top: 30px; width: 458px; height: 460px; padding-top: 42px; }
  .companion img { width: 420px; margin: 0 auto; }
  .connections { left: 20px; top: 60px; width: 610px; height: 350px; padding-top: 44px; }
  .connections img { width: 610px; }
  .review { left: 12px; top: 0; width: 610px; height: 485px; padding-top: 42px; }
  .review img { width: 610px; }
  .flow { position: absolute; left: 558px; top: 190px; width: 110px; color: #c79a60; text-align: center; font-size: 35px; }
`

const pages = [
  {
    file: 'wren-companion-store-connected-v4.png',
    title: 'Your browser, connected to Wren',
    lede: 'Use Ethereum and EVM dapps while accounts, approvals, and transaction review stay in the desktop wallet.',
    body: `
      <div class="panel connections"><div class="label">Wren desktop</div><img src="${assets.connections}"></div>
      <div class="flow">↔</div>
      <div class="panel companion"><div class="label">Browser Companion</div><img src="${assets.companion}"></div>
    `
  },
  {
    file: 'wren-companion-store-review-v4.png',
    title: 'Review every request in Wren',
    lede: 'The Companion routes each dapp request to Wren, where you can inspect the network, method, contract, and effects before acting.',
    body: `
      <div class="panel review"><div class="label">Request review</div><img src="${assets.review}"></div>
      <div class="flow">←</div>
      <div class="panel companion"><div class="label">Companion connected</div><img src="${assets.companion}"></div>
    `
  }
]

const temporary = await mkdtemp(path.join(os.tmpdir(), 'wren-companion-store-'))
try {
  const chrome = executable(chromeCandidates)
  for (const page of pages) {
    const html = path.join(temporary, `${page.file}.html`)
    await writeFile(
      html,
      `<!doctype html><meta charset="utf-8"><style>${styles}</style><main class="canvas"><div class="brand"><img src="${assets.icon}">Wren Companion</div><h1>${page.title}</h1><p class="lede">${page.lede}</p><section class="stage">${page.body}</section></main>`
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
