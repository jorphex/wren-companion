const QUALIFICATION_TESTNETS = Object.freeze({
  '0xaa36a7': Object.freeze({ name: 'Ethereum Sepolia' }),
  '0x14a34': Object.freeze({ name: 'Base Sepolia' })
})

function getTestnet(chainId) {
  if (typeof chainId !== 'string') return undefined
  return QUALIFICATION_TESTNETS[chainId.toLowerCase()]
}

globalThis.FrameQualificationTestnets = Object.freeze({
  all: QUALIFICATION_TESTNETS,
  get: getTestnet
})
