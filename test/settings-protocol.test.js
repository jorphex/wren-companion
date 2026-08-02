const assert = require('node:assert/strict')
const test = require('node:test')

const { toRpcChainId } = require('../src/settings/protocol')

test('normalizes desktop chain metadata to canonical RPC quantities', () => {
  assert.equal(toRpcChainId(1), '0x1')
  assert.equal(toRpcChainId(137), '0x89')
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', '0x1']) {
    assert.equal(toRpcChainId(value), undefined)
  }
})
