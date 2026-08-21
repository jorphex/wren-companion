const assert = require('node:assert/strict')
const test = require('node:test')

test('installs the legacy provider before the first EIP-6963 announcement', async () => {
  const originalWindow = global.window
  const originalDocument = global.document
  const originalCustomEvent = global.CustomEvent
  let announcedProvider
  let legacyProviderAtAnnouncement

  global.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type
      this.detail = options?.detail
    }
  }
  global.window = {
    addEventListener() {},
    dispatchEvent(event) {
      if (event.type === 'eip6963:announceProvider') {
        announcedProvider = event.detail.provider
        legacyProviderAtAnnouncement = this.ethereum
      }
      return true
    },
    localStorage: { getItem: () => null }
  }
  global.document = {
    currentScript: {
      dataset: { frameChannel: 'qualification-channel' },
      removeAttribute() {}
    }
  }

  try {
    delete require.cache[require.resolve('../src/frame')]
    require('../src/frame')

    assert.ok(announcedProvider)
    assert.equal(legacyProviderAtAnnouncement, announcedProvider)
    assert.equal(announcedProvider.isMetaMask, true)
    assert.equal(announcedProvider.isWren, true)
    assert.equal(announcedProvider.isFrame, true)
    assert.equal(await announcedProvider._metamask.isUnlocked(), true)
  } finally {
    delete require.cache[require.resolve('../src/frame')]
    global.window = originalWindow
    global.document = originalDocument
    global.CustomEvent = originalCustomEvent
  }
})

test('keeps Wren the primary legacy provider across both identity modes', () => {
  const originalWindow = global.window
  const originalDocument = global.document
  const originalCustomEvent = global.CustomEvent
  global.CustomEvent = class CustomEvent {
    constructor(type, options) {
      this.type = type
      this.detail = options?.detail
    }
  }

  try {
    for (const appearAsMetaMask of [false, true]) {
      const incumbent = { isMetaMask: true }
      let announcedProvider
      global.window = {
        ethereum: incumbent,
        addEventListener() {},
        dispatchEvent(event) {
          if (event.type === 'eip6963:announceProvider') announcedProvider = event.detail.provider
          return true
        },
        localStorage: { getItem: () => JSON.stringify(appearAsMetaMask) }
      }
      global.document = {
        currentScript: {
          dataset: { frameChannel: 'qualification-channel' },
          removeAttribute() {}
        }
      }

      delete require.cache[require.resolve('../src/frame')]
      require('../src/frame')

      assert.equal(global.window.ethereum, announcedProvider)
      assert.deepEqual(announcedProvider.providers, [announcedProvider, incumbent])
      assert.equal(announcedProvider.isMetaMask, true)
      assert.equal(announcedProvider.isWren === true, !appearAsMetaMask)
    }
  } finally {
    delete require.cache[require.resolve('../src/frame')]
    global.window = originalWindow
    global.document = originalDocument
    global.CustomEvent = originalCustomEvent
  }
})
