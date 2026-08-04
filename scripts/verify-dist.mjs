import { lstat, readFile, readdir } from 'node:fs/promises'
import { join, relative, resolve } from 'node:path'
import { extensionArtifactFiles } from './artifact-policy.mjs'

const root = resolve(process.argv[2] || new URL('../dist/', import.meta.url).pathname)
const browser = process.argv[3] || 'chrome'
if (!['chrome', 'firefox'].includes(browser)) throw new Error(`Unsupported browser: ${browser}`)
const expectedFiles = new Set(extensionArtifactFiles)

const files = []

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const stats = await lstat(path)

    if (stats.isSymbolicLink()) throw new Error(`Unexpected symlink in extension artifact: ${path}`)
    if (entry.isDirectory()) await walk(path)
    else if (entry.isFile()) files.push(relative(root, path))
    else throw new Error(`Unexpected artifact entry: ${path}`)
  }
}

await walk(root)

const actualFiles = new Set(files)
const missing = [...expectedFiles].filter((file) => !actualFiles.has(file))
const unexpected = [...actualFiles].filter((file) => !expectedFiles.has(file))

if (missing.length || unexpected.length) {
  throw new Error(
    `Extension artifact mismatch; missing=${missing.join(',')} unexpected=${unexpected.join(',')}`
  )
}

const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'))
const packageFile = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))

if (manifest.manifest_version !== 3) throw new Error('Extension artifact must use Manifest V3')
if (manifest.version !== packageFile.version)
  throw new Error('Manifest and package versions differ')
if (manifest.name !== 'Frame Community Companion')
  throw new Error('Store package must use the community fork identity')
const validBackground =
  browser === 'chrome'
    ? manifest.background?.service_worker === 'index.js' && !manifest.background?.scripts
    : !manifest.background?.service_worker &&
      JSON.stringify(manifest.background?.scripts) === JSON.stringify(['index.js'])
if (!validBackground) throw new Error(`Unexpected ${browser} background declaration`)
if (manifest.content_scripts?.some(({ js }) => js?.some((file) => !actualFiles.has(file)))) {
  throw new Error('Manifest references a missing content script')
}
const [providerScript] = manifest.content_scripts || []
const expectedMatches = ['http://*/*', 'https://*/*']
if (
  manifest.content_scripts?.length !== 1 ||
  providerScript.run_at !== 'document_start' ||
  providerScript.all_frames !== true ||
  JSON.stringify(providerScript.matches) !== JSON.stringify(expectedMatches)
) {
  throw new Error('Unexpected provider injection policy')
}
if (
  manifest.web_accessible_resources?.some(({ resources }) =>
    resources?.some((file) => !actualFiles.has(file))
  )
) {
  throw new Error('Manifest references a missing web-accessible resource')
}
if (actualFiles.has('augment.js')) throw new Error('Obsolete augment content must not be packaged')
if (JSON.stringify(manifest).includes('file://'))
  throw new Error('Opaque file origins must not be injected')
if (
  manifest.permissions?.includes('<all_urls>') ||
  manifest.host_permissions?.includes('<all_urls>')
) {
  throw new Error('Extension must not request unrestricted host access')
}
if (
  JSON.stringify(manifest.permissions) !== JSON.stringify(['alarms', 'scripting']) ||
  JSON.stringify(manifest.host_permissions) !== JSON.stringify(['https://*/*', 'http://*/*'])
) {
  throw new Error('Extension permissions differ from the reviewed store policy')
}
if (manifest.icons?.['128'] !== 'icons/icon128.png') {
  throw new Error('Chrome Web Store icon is missing')
}
if (!manifest.content_security_policy?.extension_pages?.includes('ws://127.0.0.1:1248')) {
  throw new Error('Extension CSP must restrict Frame transport to loopback')
}
if (
  manifest.browser_specific_settings?.gecko?.id !== '{53cfd564-e246-4c76-808c-8648768988d5}' ||
  manifest.browser_specific_settings?.gecko?.strict_min_version !== '142.0' ||
  JSON.stringify(manifest.browser_specific_settings?.gecko?.data_collection_permissions) !==
    JSON.stringify({ required: ['none'] })
) {
  throw new Error('Firefox data-collection declaration is missing or incompatible')
}

for (const file of ['index.js', 'inject.js']) {
  const bundle = await readFile(join(root, file), 'utf8')
  for (const obsolete of ['embedded_action_res', 'embedded:action', 'tabs.sendMessage']) {
    if (bundle.includes(obsolete)) throw new Error(`${file} retains obsolete bridge: ${obsolete}`)
  }
}

const settingsBundle = await readFile(join(root, 'settings.js'), 'utf8')
if (/\b(?:eval|Function)\s*\(/u.test(settingsBundle)) {
  throw new Error('Settings bundle contains dynamic code evaluation')
}

console.log(`Verified ${files.length} extension artifact files`)
