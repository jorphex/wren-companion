const chainFamilies = Object.freeze({
  1: 'ethereum',
  10: 'optimism',
  100: 'gnosis',
  137: 'polygon',
  8453: 'base',
  42161: 'arbitrum',
  84532: 'base',
  747474: 'katana',
  11155111: 'ethereum',
  11155420: 'optimism'
})

const testnetChainIds = new Set([84532, 11155111, 11155420])

const colorTokens = Object.freeze({
  ethereum: '--wren-chain-ethereum',
  optimism: '--wren-chain-optimism',
  gnosis: '--wren-chain-gnosis',
  polygon: '--wren-chain-polygon',
  base: '--wren-chain-base',
  arbitrum: '--wren-chain-arbitrum',
  katana: '--wren-chain-katana',
  testnet: '--wren-chain-testnet',
  custom: '--wren-chain-custom'
})

export function getChainColorToken(chainId, isTestnet = false) {
  const numericChainId = Number(chainId)

  if (isTestnet || testnetChainIds.has(numericChainId)) return colorTokens.testnet

  return colorTokens[chainFamilies[numericChainId] || 'custom']
}
