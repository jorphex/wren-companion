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

test('joins an existing configurable provider without replacing it', () => {
  const existing = { isOtherWallet: true }
  const provider = { isFrame: true }
  const target = {}
  Object.defineProperty(target, 'ethereum', {
    value: existing,
    writable: true,
    configurable: true
  })

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, existing)
  assert.deepEqual(existing.providers, [existing, provider])
})

test('joins an inherited provider without shadowing it', () => {
  const existing = { isOtherWallet: true }
  const provider = { isFrame: true }
  const target = Object.create({ ethereum: existing })

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, existing)
  assert.equal(Object.hasOwn(target, 'ethereum'), false)
  assert.deepEqual(existing.providers, [existing, provider])
})

test('appends to a multi-provider legacy list without duplicating Wren', () => {
  const first = { isOtherWallet: true }
  const second = { isAnotherWallet: true }
  const provider = { isFrame: true }
  const target = { ethereum: { providers: [first, second] } }

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(installLegacyProvider(target, provider), true)
  assert.deepEqual(target.ethereum.providers, [first, second, provider])
})

test('leaves a sealed incumbent provider untouched', () => {
  const existing = Object.freeze({ isOtherWallet: true })
  const target = { ethereum: existing }

  assert.equal(installLegacyProvider(target, { isFrame: true }), false)
  assert.equal(target.ethereum, existing)
  assert.equal(existing.providers, undefined)
})
