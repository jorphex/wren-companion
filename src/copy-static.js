const { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('fs')
const path = require('path')

const {
  buildDirectory,
  DEFAULT_DESKTOP_PORT,
  parseDesktopPort
} = require('../scripts/build-options.cjs')

const projectRoot = path.join(__dirname, '..')
const output = buildDirectory(projectRoot, process.env.WREN_BUILD_DIRECTORY)
const desktopPort = parseDesktopPort(process.env.WREN_DESKTOP_PORT)

mkdirSync(output, { recursive: true })
for (const file of ['settings.html', 'icon.png']) {
  copyFileSync(path.join(__dirname, file), path.join(output, file))
}
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.txt']) {
  copyFileSync(path.join(projectRoot, file), path.join(output, file))
}

const manifestSource = readFileSync(path.join(__dirname, 'manifest.json'), 'utf8')
const manifest = manifestSource.replace(
  `ws://127.0.0.1:${DEFAULT_DESKTOP_PORT}`,
  `ws://127.0.0.1:${desktopPort}`
)
writeFileSync(path.join(output, 'manifest.json'), manifest)

cpSync(path.join(__dirname, 'icons'), path.join(output, 'icons'), { recursive: true })
cpSync(path.join(__dirname, 'style'), path.join(output, 'style'), { recursive: true })
cpSync(path.join(__dirname, 'fonts'), path.join(output, 'fonts'), { recursive: true })
