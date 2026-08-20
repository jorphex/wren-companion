const assert = require('node:assert/strict')
const test = require('node:test')

const { networkRefreshFailure, networkRefreshSuccess } = require('../src/network-refresh')

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
