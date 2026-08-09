const assert = require('node:assert/strict')
const test = require('node:test')

const identity = import('../src/settings/chain-identity.mjs')

test('maps canonical networks to Wren chain identity colors', async () => {
  const { getChainColorToken } = await identity

  assert.equal(getChainColorToken(1), '--wren-chain-ethereum')
  assert.equal(getChainColorToken(10), '--wren-chain-optimism')
  assert.equal(getChainColorToken(100), '--wren-chain-gnosis')
  assert.equal(getChainColorToken(137), '--wren-chain-polygon')
  assert.equal(getChainColorToken(8453), '--wren-chain-base')
  assert.equal(getChainColorToken(42161), '--wren-chain-arbitrum')
  assert.equal(getChainColorToken(747474), '--wren-chain-katana')
})

test('uses the testnet and custom identity colors without implying status', async () => {
  const { getChainColorToken } = await identity

  assert.equal(getChainColorToken(11155111), '--wren-chain-testnet')
  assert.equal(getChainColorToken(84532), '--wren-chain-testnet')
  assert.equal(getChainColorToken(1, true), '--wren-chain-testnet')
  assert.equal(getChainColorToken(999999), '--wren-chain-custom')
  assert.equal(getChainColorToken('invalid'), '--wren-chain-custom')
})
