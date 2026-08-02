import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'

const root = new URL('../dist/', import.meta.url)
const expectedFiles = new Set([
  'FrameLogo.png',
  'frame.js',
  'icon.png',
  'icons/icon16.png',
  'icons/icon16good.png',
  'icons/icon16moon.png',
  'icons/icon48.png',
  'icons/icon48good.png',
  'icons/icon48moon.png',
  'icons/icon96.png',
  'icons/icon96good.png',
  'icons/icon96moon.png',
  'index.js',
  'inject.js',
  'manifest.json',
  'settings.html',
  'settings.js',
  'settings.js.LICENSE.txt',
  'style/fonts.css',
  'style/index.css'
])

const files = []

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const stats = await lstat(path)

    if (stats.isSymbolicLink()) throw new Error(`Unexpected symlink in extension artifact: ${path}`)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) files.push(relative(root.pathname, path))
    else throw new Error(`Unexpected artifact entry: ${path}`)
  }
}

await walk(root.pathname)

const actualFiles = new Set(files)
const missing = [...expectedFiles].filter((file) => !actualFiles.has(file))
const unexpected = [...actualFiles].filter((file) => !expectedFiles.has(file))

if (missing.length || unexpected.length) {
  throw new Error(
    `Extension artifact mismatch; missing=${missing.join(',')} unexpected=${unexpected.join(',')}`
  )
}

const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
const packageFile = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

if (manifest.manifest_version !== 3) throw new Error('Extension artifact must use Manifest V3')
if (manifest.version !== packageFile.version)
  throw new Error('Manifest and package versions differ')
if (manifest.background?.service_worker !== 'index.js')
  throw new Error('Unexpected background worker')
if (manifest.content_scripts?.some(({ js }) => js?.some((file) => !actualFiles.has(file)))) {
  throw new Error('Manifest references a missing content script')
}
if (
  manifest.web_accessible_resources?.some(({ resources }) =>
    resources?.some((file) => !actualFiles.has(file))
  )
) {
  throw new Error('Manifest references a missing web-accessible resource')
}
if (actualFiles.has('augment.js')) throw new Error('Obsolete augment content must not be packaged')

console.log(`Verified ${files.length} extension artifact files`)
