const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const FRAME_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDcuNSIgaGVpZ2h0PSIzMDYiIHZpZXdCb3g9IjAgMCAzMDcuNSAzMDYiPgogIDxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9IiMyODI3MmEiPjwvcmVjdD4KICA8cGF0aCBmaWxsPScjMDBkMmJlJyB0cmFuc2Zvcm09InRyYW5zbGF0ZSg3NywgNzYuNSkiIGQ9Ik0xNDUuMSw3NS42VjE3LjZjMC01LjEtNC4yLTkuMy05LjMtOS4zaC01OC4xYy0uNiwwLTEuMS0uMi0xLjYtLjZsLTctN2MtLjQtLjQtMS0uNy0xLjYtLjdIOS4zQzQuMiwwLDAsNC4xLDAsOS4zaDB2NThjMCwuNi4yLDEuMS42LDEuNmw3LDdjLjQuNC43LDEsLjcsMS42djU4YzAsNS4xLDQuMiw5LjMsOS4zLDkuM2g1OC4yYy42LDAsMS4xLjIsMS42LjZsNyw3Yy40LjQsMSwuNiwxLjYuNmg1OC4yYzUuMSwwLDkuMy00LjEsOS4zLTkuM2gwdi01OGMwLS42LS4yLTEuMS0uNi0xLjZsLTctN2MtLjUtLjQtLjgtLjktLjgtMS41Wk0xMDUuNiwxMDYuNmgtNTcuN2MtLjcsMC0xLjMtLjYtMS4zLTEuM3YtNTcuNmMwLS43LjYtMS4zLDEuMy0xLjNoNTcuN2MuNywwLDEuMy42LDEuMywxLjN2NTcuNmMuMS43LS41LDEuMy0xLjMsMS4zWiIvPgo8L3N2Zz4K'

function randomUuid(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues !== 'function')
    throw new Error('Secure randomness unavailable')

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, '$1-$2-$3-$4-$5')
}

function createProviderInfo(uuidFactory = randomUuid) {
  const uuid = uuidFactory()
  if (!UUID_V4.test(uuid)) throw new Error('Unable to create Frame provider UUID')
  return Object.freeze({ uuid, name: 'Frame', icon: FRAME_ICON, rdns: 'sh.frame' })
}

module.exports = { createProviderInfo, randomUuid }
