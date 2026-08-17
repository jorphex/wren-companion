import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
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

const canonical = await readFile(path.join(root, 'src', 'icon.png'))
const iconData = `data:image/png;base64,${canonical.toString('base64')}`
const output = path.join(root, 'src', 'icons', 'icon128.png')
const temporary = await mkdtemp(path.join(os.tmpdir(), 'wren-companion-icon-'))

try {
  const html = path.join(temporary, 'icon.html')
  await writeFile(
    html,
    `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:128px;height:128px;overflow:hidden;background:transparent}body{padding:16px}img{display:block;width:96px;height:96px}</style><img src="${iconData}">`
  )
  execFileSync(
    executable(chromeCandidates),
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--default-background-color=00000000',
      '--force-device-scale-factor=1',
      '--run-all-compositor-stages-before-draw',
      '--window-size=128,128',
      `--screenshot=${output}`,
      `file://${html}`
    ],
    { stdio: 'ignore' }
  )
} finally {
  await rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
}

console.log('Generated padded 128px browser-store icon')
