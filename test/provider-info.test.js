const assert = require('node:assert/strict')
const test = require('node:test')

const { createProviderInfo, randomUuid } = require('../src/provider-info')

test('creates immutable EIP-6963 metadata with a UUIDv4', () => {
  const info = createProviderInfo(() => '12345678-1234-4234-9234-123456789abc')

  assert.deepEqual(info, {
    uuid: '12345678-1234-4234-9234-123456789abc',
    name: 'Wren',
    icon: info.icon,
    rdns: 'io.github.jorphex.wren'
  })
  assert.equal(Object.isFrozen(info), true)
  assert.match(info.icon, /^data:image\/svg\+xml;base64,/u)
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
