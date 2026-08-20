const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 240
const MAX_NETWORK_CATALOG_ENTRIES = 256
const MAX_NETWORK_NAME_LENGTH = 160

function validNetworkCatalogEntry(entry, seenChainIds) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return
  const { chainId, name, connected, isTestnet } = entry
  if (
    !Number.isSafeInteger(chainId) ||
    chainId <= 0 ||
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.length > MAX_NETWORK_NAME_LENGTH ||
    (connected !== undefined && typeof connected !== 'boolean') ||
    (isTestnet !== undefined && typeof isTestnet !== 'boolean') ||
    seenChainIds.has(chainId)
  ) {
    return
  }
  seenChainIds.add(chainId)
  return Object.freeze({
    chainId,
    name: name.trim(),
    ...(connected === undefined ? {} : { connected }),
    ...(isTestnet === undefined ? {} : { isTestnet })
  })
}

function validateNetworkCatalog(chains) {
  if (!Array.isArray(chains) || chains.length > MAX_NETWORK_CATALOG_ENTRIES) return
  const seenChainIds = new Set()
  const catalog = []
  for (const entry of chains) {
    const validated = validNetworkCatalogEntry(entry, seenChainIds)
    if (!validated) return
    catalog.push(validated)
  }
  return Object.freeze(catalog)
}

function networkRefreshSuccess(chains) {
  const catalog = validateNetworkCatalog(chains)
  if (!catalog) throw new Error('Wren returned an invalid network catalog')
  return {
    availableChains: catalog,
    chainsStatus: 'ready',
    chainsError: null
  }
}

function networkRefreshFailure(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error')
  const message = rawMessage.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH)
  const code =
    typeof error?.code === 'number' || typeof error?.code === 'string' ? error.code : undefined

  return {
    chainsStatus: 'error',
    chainsError: {
      ...(code === undefined ? {} : { code }),
      message
    }
  }
}

module.exports = {
  MAX_NETWORK_CATALOG_ENTRIES,
  MAX_NETWORK_NAME_LENGTH,
  networkRefreshFailure,
  networkRefreshSuccess,
  validateNetworkCatalog
}
