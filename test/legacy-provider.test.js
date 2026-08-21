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

test('makes Wren the primary legacy provider while retaining a configurable incumbent', () => {
  const existing = { isOtherWallet: true }
  const provider = { isFrame: true }
  const target = {}
  Object.defineProperty(target, 'ethereum', {
    value: existing,
    writable: true,
    configurable: true
  })

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, provider)
  assert.deepEqual(provider.providers, [provider, existing])
})

test('makes Wren primary over an inherited provider while retaining it', () => {
  const existing = { isOtherWallet: true }
  const provider = { isFrame: true }
  const target = Object.create({ ethereum: existing })

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, provider)
  assert.equal(Object.hasOwn(target, 'ethereum'), true)
  assert.deepEqual(provider.providers, [provider, existing])
})

test('keeps Wren deterministically first in a multi-provider legacy list', () => {
  const first = { isOtherWallet: true }
  const second = { isAnotherWallet: true }
  const provider = { isFrame: true }
  const target = { ethereum: { providers: [first, second] } }

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, provider)
  assert.deepEqual(provider.providers, [provider, first, second])
})

test('replaces a writable non-configurable incumbent without changing its descriptor policy', () => {
  const existing = { isOtherWallet: true }
  const provider = { isFrame: true }
  const target = {}
  Object.defineProperty(target, 'ethereum', {
    value: existing,
    writable: true,
    configurable: false,
    enumerable: false
  })

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, provider)
  assert.deepEqual(provider.providers, [provider, existing])
  assert.deepEqual(Object.getOwnPropertyDescriptor(target, 'ethereum'), {
    value: provider,
    writable: true,
    configurable: false,
    enumerable: false
  })
})

test('retains a sealed incumbent as a secondary provider without mutating it', () => {
  const existing = Object.freeze({ isOtherWallet: true })
  const provider = { isFrame: true }
  const target = { ethereum: existing }

  assert.equal(installLegacyProvider(target, provider), true)
  assert.equal(target.ethereum, provider)
  assert.deepEqual(provider.providers, [provider, existing])
  assert.equal(existing.providers, undefined)
})

test('leaves a non-writable legacy global untouched', () => {
  const existing = { isOtherWallet: true }
  const target = {}
  Object.defineProperty(target, 'ethereum', {
    value: existing,
    writable: false,
    configurable: false
  })

  assert.equal(installLegacyProvider(target, { isFrame: true }), false)
  assert.equal(target.ethereum, existing)
})
