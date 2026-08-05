import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { readSourceIdentity } from './source-identity.mjs'

if (!process.env.npm_execpath) throw new Error('SBOM verification must run through npm')

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packageLock = await readFile(new URL('../package-lock.json', import.meta.url))
const path =
  process.argv[2] ||
  new URL(`../artifacts/wren-companion-${packageJson.version}.cdx.json`, import.meta.url).pathname
const sbom = JSON.parse(await readFile(path, 'utf8'))
if (
  sbom.bomFormat !== 'CycloneDX' ||
  sbom.metadata?.component?.name !== packageJson.name ||
  sbom.metadata?.component?.version !== packageJson.version
) {
  throw new Error('SBOM root does not match the companion package')
}

const { commit: sourceCommit, timestamp: sourceTimestamp } = readSourceIdentity()
const serialBytes = createHash('sha256')
  .update(`${packageJson.name}\0${packageJson.version}\0${sourceCommit}\0`)
  .update(packageLock)
  .digest()
  .subarray(0, 16)
serialBytes[6] = (serialBytes[6] & 0x0f) | 0x50
serialBytes[8] = (serialBytes[8] & 0x3f) | 0x80
const serialHex = serialBytes.toString('hex')
const expectedSerial = `urn:uuid:${serialHex.slice(0, 8)}-${serialHex.slice(8, 12)}-${serialHex.slice(12, 16)}-${serialHex.slice(16, 20)}-${serialHex.slice(20)}`
if (
  sbom.serialNumber !== expectedSerial ||
  sbom.metadata.timestamp !== new Date(sourceTimestamp).toISOString()
) {
  throw new Error('SBOM source identity is not reproducible')
}

const runNpm = (args) =>
  execFileSync(process.execPath, [process.env.npm_execpath, ...args], {
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024
  })
const productionTree = JSON.parse(runNpm(['ls', '--omit=dev', '--all', '--json']))
const rootReference = sbom.metadata.component['bom-ref']
const expectedGraph = new Map([[rootReference, new Set()]])

function collectExpectedGraph(dependencies, parentReference) {
  for (const [name, dependency] of Object.entries(dependencies || {})) {
    if (typeof dependency?.version !== 'string') continue
    const reference = `${name}@${dependency.version}`
    expectedGraph.get(parentReference).add(reference)
    if (!expectedGraph.has(reference)) expectedGraph.set(reference, new Set())
    collectExpectedGraph(dependency.dependencies, reference)
  }
}
collectExpectedGraph(productionTree.dependencies, rootReference)

const components = new Map()
for (const component of sbom.components || []) {
  const reference = component?.['bom-ref']
  if (typeof reference !== 'string' || components.has(reference)) {
    throw new Error('SBOM contains an invalid or duplicate component')
  }
  if (
    component.properties?.some(
      (property) => property?.name === 'cdx:npm:package:development' && property.value === 'true'
    )
  ) {
    throw new Error(`SBOM contains development dependency ${component.name || ''}`.trim())
  }
  components.set(reference, component)
}

const expectedComponents = new Set(expectedGraph.keys())
expectedComponents.delete(rootReference)
if (
  components.size !== expectedComponents.size ||
  [...expectedComponents].some((reference) => !components.has(reference))
) {
  throw new Error('SBOM components do not match the installed production dependency closure')
}

const graph = new Map()
for (const dependency of sbom.dependencies || []) {
  if (
    typeof dependency?.ref !== 'string' ||
    graph.has(dependency.ref) ||
    !Array.isArray(dependency.dependsOn)
  ) {
    throw new Error('SBOM contains an invalid or duplicate dependency node')
  }
  graph.set(dependency.ref, dependency.dependsOn)
}
if (
  graph.size !== expectedGraph.size ||
  [...expectedGraph].some(([reference, expectedDependencies]) => {
    const actual = graph.get(reference)
    return (
      !actual ||
      actual.length !== expectedDependencies.size ||
      actual.some((dependency) => !expectedDependencies.has(dependency))
    )
  })
) {
  throw new Error('SBOM graph does not match the installed production dependency graph')
}

console.log(`Verified production CycloneDX SBOM with ${components.size} components`)
