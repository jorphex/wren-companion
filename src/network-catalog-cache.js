const CACHE_KEY = 'wrenNetworkCatalogV1'
const CACHE_VERSION = 1

function parseNetworkCatalogCache(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== CACHE_VERSION ||
    !Array.isArray(value.chains)
  ) {
    return undefined
  }
  return value.chains
}

async function loadNetworkCatalogCache(storage) {
  const stored = await storage.get(CACHE_KEY)
  return parseNetworkCatalogCache(stored?.[CACHE_KEY])
}

function saveNetworkCatalogCache(storage, chains) {
  if (!Array.isArray(chains)) return Promise.reject(new Error('Invalid network catalog'))
  return storage.set({ [CACHE_KEY]: { version: CACHE_VERSION, chains } })
}

function clearNetworkCatalogCache(storage) {
  return storage.remove(CACHE_KEY)
}

module.exports = {
  CACHE_KEY,
  clearNetworkCatalogCache,
  loadNetworkCatalogCache,
  parseNetworkCatalogCache,
  saveNetworkCatalogCache
}
