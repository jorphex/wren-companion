const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

const { buildDirectory, parseDesktopPort } = require('../scripts/build-options.cjs')

test('uses the live desktop port unless an isolated build overrides it', () => {
  assert.equal(parseDesktopPort(), 1248)
  assert.equal(parseDesktopPort('49152'), 49152)
  for (const value of ['0', '1023', '65536', '1.5', 'port']) {
    assert.throws(() => parseDesktopPort(value), /WREN_DESKTOP_PORT/u)
  }
})

test('keeps production output by default and requires a disposable external build directory', () => {
  assert.equal(buildDirectory('/project'), path.join('/project', 'dist'))
  assert.equal(buildDirectory('/project', '/tmp/wren-qualified'), '/tmp/wren-qualified')
  assert.throws(
    () => buildDirectory('/project', '.qualification/extension'),
    /absolute disposable/u
  )
  assert.throws(() => buildDirectory('/project', '/project'), /outside the project/u)
  assert.throws(() => buildDirectory('/project', '/project/qualification'), /outside the project/u)
})
