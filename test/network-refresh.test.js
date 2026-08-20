const assert = require('node:assert/strict')
const test = require('node:test')

const {
  MAX_NETWORK_CATALOG_ENTRIES,
  networkRefreshFailure,
  networkRefreshSuccess,
  validateNetworkCatalog
} = require('../src/network-refresh')

test('accepts only an array network catalog and clears prior refresh errors', () => {
  const chains = [{ chainId: 1, name: 'Ethereum' }]

  assert.deepEqual(networkRefreshSuccess(chains), {
    availableChains: chains,
    chainsStatus: 'ready',
    chainsError: null
  })
  assert.throws(
    () => networkRefreshSuccess({ chainId: 1 }),
    /Wren returned an invalid network catalog/u
  )
})

test('captures a bounded diagnostic without replacing the last valid catalog', () => {
  const failure = networkRefreshFailure(
    Object.assign(new Error('network metadata failed '.repeat(20)), { code: -32603 })
  )

  assert.equal(failure.chainsStatus, 'error')
  assert.equal(failure.chainsError.code, -32603)
  assert.equal(failure.chainsError.message.length, 240)
  assert.equal(Object.hasOwn(failure, 'availableChains'), false)
})

test('rejects malformed, duplicate, and oversized catalog entries before rendering', () => {
  const valid = [{ chainId: 1, name: ' Ethereum ', connected: true, isTestnet: false }]

  assert.deepEqual(validateNetworkCatalog(valid), [
    { chainId: 1, name: 'Ethereum', connected: true, isTestnet: false }
  ])
  for (const malformed of [
    [{ chainId: 0, name: 'Ethereum' }],
    [{ chainId: 1, name: '' }],
    [
      { chainId: 1, name: 'Ethereum' },
      { chainId: 1, name: 'Duplicate' }
    ],
    [{ chainId: 1, name: 'Ethereum', connected: 'yes' }],
    Array.from({ length: MAX_NETWORK_CATALOG_ENTRIES + 1 }, (_, chainId) => ({
      chainId: chainId + 1,
      name: `Chain ${chainId + 1}`
    }))
  ]) {
    assert.equal(validateNetworkCatalog(malformed), undefined)
    assert.throws(() => networkRefreshSuccess(malformed), /invalid network catalog/u)
  }
})
