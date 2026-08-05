const test = require('node:test')
const assert = require('node:assert/strict')
const { installLegacyProvider } = require('../src/legacy-provider')

test('installs Wren only when no legacy provider exists', () => {
  const target = {}
  const provider = { isFrame: true }

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, provider)
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, 'ethereum'), {
    value: provider,
    writable: true,
    configurable: true,
    enumerable: true
  })
})

test('never overwrites an existing configurable provider', () => {
  const existing = { isOtherWallet: true }
  const target = {}
  Object.defineProperty(target, 'ethereum', {
    value: existing,
    writable: true,
    configurable: true
  })

  assert.equal(installLegacyProvider(target, { isFrame: true }), false)
  assert.equal(target.ethereum, existing)
})

test('never shadows an inherited provider', () => {
  const existing = { isOtherWallet: true }
  const target = Object.create({ ethereum: existing })

  assert.equal(installLegacyProvider(target, { isFrame: true }), false)
  assert.equal(target.ethereum, existing)
  assert.equal(Object.hasOwn(target, 'ethereum'), false)
})
