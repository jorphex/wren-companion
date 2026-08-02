import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const artifacts = new URL('../artifacts/', import.meta.url).pathname
const files = (await readdir(artifacts)).filter((file) => file !== 'SHA256SUMS').sort()
const lines = []

for (const file of files) {
  const path = join(artifacts, file)
  const stats = await lstat(path)
  if (!stats.isFile() || stats.isSymbolicLink())
    throw new Error(`Unexpected artifact entry: ${file}`)

  const digest = createHash('sha256')
  for await (const chunk of createReadStream(path)) digest.update(chunk)
  lines.push(`${digest.digest('hex')}  ${file}`)
}

await writeFile(join(artifacts, 'SHA256SUMS'), `${lines.join('\n')}\n`, { mode: 0o600 })
