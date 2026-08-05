import { spawnSync } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createFirefoxManifest } from './browser-manifests.mjs'

const root = resolve(new URL('..', import.meta.url).pathname)
const source = join(root, 'dist')
const temporary = await mkdtemp(join(tmpdir(), 'wren-companion-firefox-lint-'))

try {
  await cp(source, temporary, { recursive: true })
  const manifestPath = join(temporary, 'manifest.json')
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  await writeFile(manifestPath, `${JSON.stringify(createFirefoxManifest(manifest), null, 2)}\n`)

  const executable = join(root, 'node_modules', '.bin', 'addons-linter')
  const result = spawnSync(executable, ['--output=json', temporary], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  })
  if (result.error) throw result.error

  let report
  try {
    report = JSON.parse(result.stdout)
  } catch {
    throw new Error(`Firefox validator returned invalid output: ${result.stderr}`)
  }

  const allowedWarnings = report.warnings?.filter(
    (warning) => warning.code === 'UNSAFE_VAR_ASSIGNMENT' && warning.file === 'settings.js'
  )
  const unexpectedWarnings = report.warnings?.filter(
    (warning) => !allowedWarnings.includes(warning)
  )
  if (
    result.status > 1 ||
    report.errors?.length ||
    report.notices?.length ||
    unexpectedWarnings?.length ||
    allowedWarnings?.length !== 2
  ) {
    throw new Error(
      `Firefox validation failed: ${JSON.stringify({
        status: result.status,
        errors: report.errors,
        notices: report.notices,
        warnings: report.warnings
      })}`
    )
  }

  console.log('Firefox validator passed with two audited React DOM innerHTML warnings')
} finally {
  await rm(temporary, { recursive: true, force: true })
}
