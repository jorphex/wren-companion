const assert = require('node:assert/strict')
const test = require('node:test')

test('installs the legacy provider before the first EIP-6963 announcement', () => {
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
  } finally {
    delete require.cache[require.resolve('../src/frame')]
    global.window = originalWindow
    global.document = originalDocument
    global.CustomEvent = originalCustomEvent
  }
})
