const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const test = require('node:test')

const { createProviderInfo, randomUuid } = require('../src/provider-info')

const assertCanonicalWrenIcon = (icon) => {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/u.exec(icon)
  assert.ok(match)
  const png = Buffer.from(match[1], 'base64')
  assert.equal(png.toString('base64'), match[1])
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10])
  assert.equal(png.readUInt32BE(16), 128)
  assert.equal(png.readUInt32BE(20), 128)
  assert.equal(
    createHash('sha256').update(png).digest('hex'),
    'bc8ba0f545d9a8b005cbf704a147b94f6e77a20afa54bd01b1c74983decc9676'
  )
}

test('creates immutable EIP-6963 metadata with a UUIDv4', () => {
  const info = createProviderInfo(() => '12345678-1234-4234-9234-123456789abc')

  assert.deepEqual(info, {
    uuid: '12345678-1234-4234-9234-123456789abc',
    name: 'Wren',
    icon: info.icon,
    rdns: 'io.github.jorphex.wren'
  })
  assert.equal(Object.isFrozen(info), true)
  assertCanonicalWrenIcon(info.icon)
})

test('rejects non-v4 identifiers', () => {
  assert.throws(
    () => createProviderInfo(() => 'd7acc008-6411-5486-bb2d-0c0cfcddbb92'),
    /provider UUID/u
  )
})

test('falls back to cryptographically sourced UUIDv4 bytes', () => {
  const bytes = Uint8Array.from({ length: 16 }, (_, index) => index)
  const uuid = randomUuid({ getRandomValues: (target) => target.set(bytes) || target })
  assert.equal(uuid, '00010203-0405-4607-8809-0a0b0c0d0e0f')
})
