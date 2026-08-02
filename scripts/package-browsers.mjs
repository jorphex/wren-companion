import { execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { createRequire } from 'node:module'
import { extensionArtifactFiles } from './artifact-policy.mjs'
import { createFirefoxManifest } from './browser-manifests.mjs'
import { readSourceIdentity } from './source-identity.mjs'

const require = createRequire(import.meta.url)
const { AUTH_VERSION } = require('../src/auth-protocol')
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const compatibility = JSON.parse(
  await readFile(new URL('../compatibility.json', import.meta.url), 'utf8')
)
const { commit: sourceCommit } = readSourceIdentity()

if (compatibility.protocolVersion !== AUTH_VERSION) {
  throw new Error('Compatibility metadata and authentication protocol differ')
}
if (!/^[0-9a-f]{40}$/.test(compatibility.desktop?.commit || '')) {
  throw new Error('Compatibility metadata requires an exact desktop commit')
}

const root = resolve(new URL('..', import.meta.url).pathname)
const dist = join(root, 'dist')
const artifacts = join(root, 'artifacts')
const staging = join(artifacts, `.staging-${process.pid}`)
const version = packageJson.version
const chromeArchive = join(artifacts, `frame-companion-${version}-chrome.zip`)
const firefoxArchive = join(artifacts, `frame-companion-${version}-firefox.zip`)
const fixedTime = new Date('1980-01-01T00:00:00.000Z')

await rm(artifacts, { recursive: true, force: true })
await mkdir(dirname(staging), { recursive: true })

try {
  await cp(dist, staging, { recursive: true, errorOnExist: true, force: false })
  for (const file of extensionArtifactFiles) {
    const path = join(staging, file)
    await chmod(path, 0o644)
    await utimes(path, fixedTime, fixedTime)
  }

  execFileSync('zip', ['-X', '-q', chromeArchive, ...extensionArtifactFiles], {
    cwd: staging,
    env: { ...process.env, TZ: 'UTC' }
  })

  const manifestPath = join(staging, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  await writeFile(manifestPath, `${JSON.stringify(createFirefoxManifest(manifest), null, 2)}\n`)
  await chmod(manifestPath, 0o644)
  await utimes(manifestPath, fixedTime, fixedTime)
  execFileSync('zip', ['-X', '-q', firefoxArchive, ...extensionArtifactFiles], {
    cwd: staging,
    env: { ...process.env, TZ: 'UTC' }
  })
} finally {
  await rm(staging, { recursive: true, force: true })
}

const compatibilityArtifact = {
  ...compatibility,
  companion: {
    repository: packageJson.repository.url.replace(/^git\+|\.git$/g, ''),
    version,
    commit: sourceCommit
  },
  browsers: {
    chrome: `frame-companion-${version}-chrome.zip`,
    firefox: `frame-companion-${version}-firefox.zip`
  }
}
await writeFile(
  join(artifacts, `frame-companion-${version}-compatibility.json`),
  `${JSON.stringify(compatibilityArtifact, null, 2)}\n`,
  { mode: 0o600 }
)
