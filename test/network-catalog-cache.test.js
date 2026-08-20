const assert = require('node:assert/strict')
const test = require('node:test')

const {
  CACHE_KEY,
  clearNetworkCatalogCache,
  loadNetworkCatalogCache,
  parseNetworkCatalogCache,
  saveNetworkCatalogCache
} = require('../src/network-catalog-cache')

class MemoryStorage {
  constructor(value = {}) {
    this.value = value
  }

  async get() {
    return this.value
  }

  async set(update) {
    Object.assign(this.value, update)
  }

  async remove(key) {
    delete this.value[key]
  }
}

test('round-trips the last valid network catalog', async () => {
  const storage = new MemoryStorage()
  const chains = [{ chainId: 1, name: 'Ethereum', connected: true }]

  await saveNetworkCatalogCache(storage, chains)

  assert.deepEqual(await loadNetworkCatalogCache(storage), chains)
  assert.deepEqual(storage.value[CACHE_KEY], { version: 1, chains })
})

test('distinguishes a cached empty catalog from a missing or invalid cache', () => {
  assert.deepEqual(parseNetworkCatalogCache({ version: 1, chains: [] }), [])
  assert.equal(parseNetworkCatalogCache(undefined), undefined)
  assert.equal(parseNetworkCatalogCache({ version: 2, chains: [] }), undefined)
  assert.equal(parseNetworkCatalogCache({ version: 1, chains: {} }), undefined)
})

test('rejects invalid writes and clears pairing-bound cache state', async () => {
  const storage = new MemoryStorage({ [CACHE_KEY]: { version: 1, chains: [] } })

  await assert.rejects(saveNetworkCatalogCache(storage, {}), /Invalid network catalog/u)
  await clearNetworkCatalogCache(storage)

  assert.equal(await loadNetworkCatalogCache(storage), undefined)
})
