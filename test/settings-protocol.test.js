const assert = require('node:assert/strict')
const test = require('node:test')

const protocol = import('../src/settings/protocol.mjs')

test('normalizes desktop chain metadata to canonical RPC quantities', async () => {
  const { toRpcChainId } = await protocol
  assert.equal(toRpcChainId(1), '0x1')
  assert.equal(toRpcChainId(137), '0x89')
  for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '1', '0x1']) {
    assert.equal(toRpcChainId(value), undefined)
  }
})

test('preserves the full active-page origin, including a non-default port', async () => {
  const { parsePageOrigin } = await protocol
  assert.deepEqual(parsePageOrigin('http://top.wren-demo.local:34987/path?q=1'), {
    protocol: 'http://',
    origin: 'top.wren-demo.local:34987'
  })
  assert.deepEqual(parsePageOrigin('https://app.example/path'), {
    protocol: 'https://',
    origin: 'app.example'
  })
  assert.deepEqual(parsePageOrigin('about:blank'), { protocol: 'about:', origin: 'blank' })
  assert.deepEqual(parsePageOrigin('not a url'), { protocol: '', origin: 'not a url' })
})

test('accepts only bounded companion authentication state', async () => {
  const { parseAuthenticationState } = await protocol
  assert.deepEqual(parseAuthenticationState({ status: 'pairing', pairingCode: '123456' }), {
    status: 'pairing',
    pairingCode: '123456'
  })
  assert.deepEqual(parseAuthenticationState({ status: 'authenticated', fingerprint: 'hidden' }), {
    status: 'authenticated'
  })
  assert.deepEqual(
    parseAuthenticationState({ status: 'error', code: 'denied', message: 'Pairing denied' }),
    { status: 'error', code: 'denied', message: 'Pairing denied' }
  )
  assert.deepEqual(
    parseAuthenticationState({
      status: 'upgrade-required',
      code: 'upgrade-required',
      message: 'This version can’t verify Wren’s identity. Update the companion, then reconnect.'
    }),
    {
      status: 'upgrade-required',
      code: 'upgrade-required',
      message: 'This version can’t verify Wren’s identity. Update the companion, then reconnect.'
    }
  )
  for (const value of [
    undefined,
    { status: 'pairing', pairingCode: '12345' },
    { status: 'error', code: '', message: 'bad' },
    { status: 'unknown' }
  ]) {
    assert.deepEqual(parseAuthenticationState(value), { status: 'disconnected' })
  }
})
