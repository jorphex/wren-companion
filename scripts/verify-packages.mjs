import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { lstat, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { extensionArtifactFiles } from './artifact-policy.mjs'
import { readSourceIdentity } from './source-identity.mjs'

const require = createRequire(import.meta.url)
const { AUTH_VERSION } = require('../src/auth-protocol')
const root = new URL('..', import.meta.url).pathname
const artifacts = join(root, 'artifacts')
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const sourceCompatibility = JSON.parse(await readFile(join(root, 'compatibility.json'), 'utf8'))
const version = packageJson.version
const expected = [
  'SHA256SUMS',
  `frame-companion-${version}-chrome.zip`,
  `frame-companion-${version}-compatibility.json`,
  `frame-companion-${version}-firefox.zip`,
  `frame-companion-${version}.cdx.json`
].sort()
const actual = (await readdir(artifacts)).sort()
if (JSON.stringify(actual) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected package inventory: ${actual.join(',')}`)
}

for (const file of actual) {
  const stats = await lstat(join(artifacts, file))
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error(`Unexpected package entry: ${file}`)
}

const checksums = new Map(
  (await readFile(join(artifacts, 'SHA256SUMS'), 'utf8'))
    .trim()
    .split('\n')
    .map((line) => {
      const match = /^([0-9a-f]{64})\s{2}([A-Za-z0-9._-]+)$/.exec(line)
      if (!match) throw new Error('Invalid checksum manifest')
      return [match[2], match[1]]
    })
)
if (checksums.size !== expected.length - 1) throw new Error('Checksum manifest is incomplete')
const expectedChecksums = new Set(expected.filter((file) => file !== 'SHA256SUMS'))
if ([...checksums.keys()].some((file) => !expectedChecksums.has(file))) {
  throw new Error('Checksum manifest references an unexpected artifact')
}

for (const [file, expectedDigest] of checksums) {
  const digest = createHash('sha256')
  for await (const chunk of createReadStream(join(artifacts, file))) digest.update(chunk)
  if (digest.digest('hex') !== expectedDigest) throw new Error(`Checksum mismatch: ${file}`)
}

for (const browser of ['chrome', 'firefox']) {
  const archive = join(artifacts, `frame-companion-${version}-${browser}.zip`)
  const entries = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' }).trim().split('\n')
  if (JSON.stringify(entries) !== JSON.stringify(extensionArtifactFiles)) {
    throw new Error(`${browser} archive inventory differs from policy`)
  }
  const manifest = JSON.parse(
    execFileSync('unzip', ['-p', archive, 'manifest.json'], { encoding: 'utf8' })
  )
  if (
    manifest.version !== version ||
    manifest.manifest_version !== 3 ||
    manifest.background?.service_worker !== 'index.js' ||
    JSON.stringify(manifest.background?.scripts) !== JSON.stringify(['index.js'])
  ) {
    throw new Error(`${browser} archive has an incompatible manifest`)
  }

  const extracted = await mkdtemp(join(tmpdir(), `frame-companion-${browser}-`))
  try {
    execFileSync('unzip', ['-q', archive, '-d', extracted])
    execFileSync(process.execPath, [join(root, 'scripts/verify-dist.mjs'), extracted])
  } finally {
    await rm(extracted, { recursive: true, force: true })
  }
}

if (
  checksums.get(`frame-companion-${version}-chrome.zip`) !==
  checksums.get(`frame-companion-${version}-firefox.zip`)
) {
  throw new Error('Chrome and Firefox archives unexpectedly differ')
}

const compatibility = JSON.parse(
  await readFile(join(artifacts, `frame-companion-${version}-compatibility.json`), 'utf8')
)
const { commit: sourceCommit } = readSourceIdentity()
const companionRepository = packageJson.repository.url.replace(/^git\+|\.git$/g, '')
if (
  compatibility.schemaVersion !== sourceCompatibility.schemaVersion ||
  compatibility.protocolVersion !== AUTH_VERSION ||
  compatibility.protocolVersion !== sourceCompatibility.protocolVersion ||
  compatibility.companion?.version !== version ||
  compatibility.companion?.commit !== sourceCommit ||
  compatibility.companion?.repository !== companionRepository ||
  JSON.stringify(compatibility.desktop) !== JSON.stringify(sourceCompatibility.desktop) ||
  compatibility.browsers?.chrome !== `frame-companion-${version}-chrome.zip` ||
  compatibility.browsers?.firefox !== `frame-companion-${version}-firefox.zip`
) {
  throw new Error('Invalid compatibility metadata')
}

console.log(`Verified ${actual.length} companion release artifacts`)
