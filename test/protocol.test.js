const assert = require('node:assert/strict')
const test = require('node:test')
const vm = require('node:vm')

const {
  MAX_MESSAGE_BYTES,
  errorResponse,
  parseDesktopMessage,
  parsePageRequest,
  serializedSize
} = require('../src/protocol')

test('accepts and normalizes a bounded JSON-RPC request', () => {
  assert.deepEqual(parsePageRequest({ jsonrpc: '2.0', id: 7, method: 'eth_chainId' }), {
    success: true,
    value: { jsonrpc: '2.0', id: 7, method: 'eth_chainId', params: [] }
  })
})

test('normalizes requests transferred from a different JavaScript realm', () => {
  const request = vm.runInNewContext(`({
    jsonrpc: '2.0',
    id: 8,
    method: 'wallet_requestPermissions',
    params: { eth_accounts: {} }
  })`)

  assert.notEqual(Object.getPrototypeOf(request), Object.prototype)
  assert.deepEqual(parsePageRequest(request), {
    success: true,
    value: {
      jsonrpc: '2.0',
      id: 8,
      method: 'wallet_requestPermissions',
      params: { eth_accounts: {} }
    }
  })
})

test('preserves object params and canonical chain targets', () => {
  const request = {
    jsonrpc: '2.0',
    id: 'request-1',
    method: 'wallet_requestPermissions',
    params: { eth_accounts: {} },
    chainId: '0xa'
  }

  assert.deepEqual(parsePageRequest(request), { success: true, value: request })
})

test('rejects page-controlled extension metadata and control methods', () => {
  for (const extra of [
    { __frameOrigin: 'https://attacker.example' },
    { __extensionConnecting: true },
    { tab: { url: 'https://attacker.example' } }
  ]) {
    const parsed = parsePageRequest({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      ...extra
    })
    assert.equal(parsed.success, false)
    assert.equal(parsed.error.error.code, -32600)
  }

  assert.equal(parsePageRequest({ jsonrpc: '2.0', id: 1, method: 'frame_summon' }).success, false)
  assert.equal(
    parsePageRequest({ jsonrpc: '2.0', id: 1, method: 'wallet_getEthereumChains' }).success,
    false
  )
})

test('rejects malformed identifiers, methods, params, and chain IDs', () => {
  const invalid = [
    null,
    [],
    { jsonrpc: '1.0', id: 1, method: 'eth_chainId' },
    { jsonrpc: '2.0', method: 'eth_chainId' },
    { jsonrpc: '2.0', id: Number.NaN, method: 'eth_chainId' },
    { jsonrpc: '2.0', id: '', method: 'eth_chainId' },
    { jsonrpc: '2.0', id: 1, method: '' },
    { jsonrpc: '2.0', id: 1, method: 'eth_\naccounts' },
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: 'bad' },
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', chainId: '0x01' },
    { jsonrpc: '2.0', id: 1, method: 'eth_chainId', chainId: 1 }
  ]

  for (const value of invalid) assert.equal(parsePageRequest(value).success, false)
})

test('rejects circular and oversized requests without throwing', () => {
  const circular = { jsonrpc: '2.0', id: 1, method: 'eth_chainId' }
  circular.params = [circular]

  assert.equal(parsePageRequest(circular).success, false)

  const oversized = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_sendTransaction',
    params: ['x'.repeat(MAX_MESSAGE_BYTES)]
  }
  assert.ok(serializedSize(oversized) > MAX_MESSAGE_BYTES)
  assert.equal(parsePageRequest(oversized).success, false)
})

test('creates bounded JSON-RPC errors without reflecting invalid IDs', () => {
  assert.deepEqual(errorResponse('request-1', 4900, 'Disconnected'), {
    jsonrpc: '2.0',
    id: 'request-1',
    error: { code: 4900, message: 'Disconnected' }
  })
  assert.equal(errorResponse({}, -32600, 'Invalid Request').id, null)
})

test('accepts bounded desktop responses and subscription messages', () => {
  for (const message of [
    { jsonrpc: '2.0', id: 1, result: '0x1' },
    { jsonrpc: '2.0', id: 'a', error: { code: 4001, message: 'Rejected' } },
    {
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription: 'sub-1', result: { number: '0x1' } }
    }
  ]) {
    assert.deepEqual(parseDesktopMessage(JSON.stringify(message)), {
      success: true,
      value: message
    })
  }
})

test('rejects malformed and oversized desktop messages', () => {
  const invalid = [
    '',
    'null',
    '{}',
    JSON.stringify({ jsonrpc: '2.0', id: 1 }),
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: true, error: { code: 1, message: 'x' } }),
    JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: '1', message: 'x' } }),
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: true, method: 'eth_chainId' }),
    JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: 1, message: 'x', stack: 'x' } }),
    JSON.stringify({ jsonrpc: '2.0', method: 'eth_subscription', params: {} }),
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription: 'sub-1', result: true },
      extra: true
    }),
    JSON.stringify({ jsonrpc: '2.0', id: 1, result: 'x'.repeat(MAX_MESSAGE_BYTES) })
  ]

  for (const value of invalid) assert.equal(parseDesktopMessage(value).success, false)
})
