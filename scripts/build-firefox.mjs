import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createFirefoxManifest } from './browser-manifests.mjs'

const root = resolve(new URL('..', import.meta.url).pathname)
const source = join(root, 'dist')
const destination = join(root, 'dist-firefox')

await rm(destination, { recursive: true, force: true })
await cp(source, destination, { recursive: true, errorOnExist: true, force: false })

const manifestPath = join(destination, 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
await writeFile(manifestPath, `${JSON.stringify(createFirefoxManifest(manifest), null, 2)}\n`)

console.log('Built Firefox reviewer output in dist-firefox')
