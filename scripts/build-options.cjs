const path = require('node:path')

const DEFAULT_DESKTOP_PORT = 1248

function parseDesktopPort(value = '') {
  if (value === '') return DEFAULT_DESKTOP_PORT
  if (!/^\d+$/u.test(value)) throw new Error('WREN_DESKTOP_PORT must be an integer')
  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    throw new Error('WREN_DESKTOP_PORT must be from 1024 through 65535')
  }
  return port
}

function buildDirectory(projectRoot, value = '') {
  if (!value) return path.join(projectRoot, 'dist')
  if (!path.isAbsolute(value)) {
    throw new Error('WREN_BUILD_DIRECTORY must be an absolute disposable path')
  }
  const root = path.resolve(projectRoot)
  const output = path.resolve(value)
  if (output === root || output.startsWith(`${root}${path.sep}`)) {
    throw new Error('WREN_BUILD_DIRECTORY must be outside the project')
  }
  return output
}

module.exports = { DEFAULT_DESKTOP_PORT, buildDirectory, parseDesktopPort }
