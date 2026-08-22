const assert = require('node:assert/strict')
const test = require('node:test')

const { AUTH_VERSION } = require('../src/auth-protocol')

test('browser qualification is locked to the production protocol 3 contract', async () => {
  const { QUALIFICATION_AUTH_VERSION } = await import('../scripts/qualification/mock-desktop.mjs')

  assert.equal(AUTH_VERSION, 3)
  assert.equal(QUALIFICATION_AUTH_VERSION, AUTH_VERSION)
})

test('browser qualification models switch responses before chain notifications', async () => {
  const { MockDesktop } = await import('../scripts/qualification/mock-desktop.mjs')
  const desktop = new MockDesktop()
  const origin = 'https://basescan.org'
  const sent = []
  const connection = {
    role: 'page',
    state: 'authenticated',
    subscriptions: new Map([['chain-subscription', { event: 'chainChanged', origin }]]),
    peer: {
      send: (message) => sent.push(message),
      close: () => assert.fail('valid switch request closed the page connection')
    }
  }
  desktop.connections.add(connection)

  desktop.rpc(connection, {
    jsonrpc: '2.0',
    id: 1,
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: '0x2105' }],
    __frameOrigin: origin
  })

  assert.deepEqual(sent, [
    { jsonrpc: '2.0', id: 1, result: null },
    {
      jsonrpc: '2.0',
      method: 'eth_subscription',
      params: { subscription: 'chain-subscription', result: '0x2105' }
    }
  ])
  desktop.server.close()
})
