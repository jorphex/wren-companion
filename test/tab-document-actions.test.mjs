import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getLocalSetting,
  IDENTITY_SETTING_CHANGED,
  IDENTITY_SETTING_FAILED,
  IDENTITY_SETTING_SAVED,
  reloadCapturedTab,
  setLocalSetting
} from '../src/tab-document-actions.mjs'

const capturedDocument = {
  documentId: 'document-1',
  url: 'https://app.example/contracts',
  value: false
}
const documentNonce = 'a'.repeat(64)
const replacementDocumentNonce = 'b'.repeat(64)
const capturedFirefoxDocument = {
  documentNonce,
  url: 'https://app.example/contracts',
  value: false
}

const createBrowser = ({ activeUrl = capturedDocument.url } = {}) => {
  const calls = []
  const messageResults = []
  const scriptResults = []
  const messageEffects = []
  let queryError
  const browserApi = {
    tabs: {
      query: async () => {
        if (queryError) {
          const error = queryError
          queryError = undefined
          throw error
        }
        return [{ id: 7, url: activeUrl }]
      },
      sendMessage: async (...args) => {
        calls.push(['message', args])
        messageEffects.shift()?.()
        const result = messageResults.shift()
        if (result instanceof Error) throw result
        return result
      }
    },
    scripting: {
      executeScript: async (options) => {
        calls.push(['script', options])
        return scriptResults.shift() || []
      }
    }
  }
  return {
    browserApi,
    calls,
    messageResults,
    messageEffects,
    scriptResults,
    setActiveUrl: (url) => (activeUrl = url),
    setQueryError: (error) => (queryError = error)
  }
}

test('captures the top-level document and its actual URL', async () => {
  const { browserApi, scriptResults } = createBrowser()
  scriptResults.push([
    {
      frameId: 0,
      documentId: 'document-1',
      result: { value: 'true', url: 'https://app.example/contracts?tab=write' }
    },
    {
      frameId: 2,
      documentId: 'frame-document',
      result: { value: 'false', url: 'https://app.example/embed' }
    }
  ])

  assert.deepEqual(await getLocalSetting(browserApi, { id: 7, url: capturedDocument.url }, 'key'), {
    value: true,
    documentId: 'document-1',
    url: 'https://app.example/contracts?tab=write'
  })
})

test('uses a per-document nonce handshake when Firefox omits documentId', async () => {
  const url = 'https://app.example/contracts?tab=write'
  const { browserApi, calls, messageResults, scriptResults } = createBrowser({ activeUrl: url })
  scriptResults.push([{ frameId: 0, result: { value: 'true', url } }])
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'capture',
    accepted: true,
    documentNonce,
    url,
    value: 'true'
  })

  assert.deepEqual(await getLocalSetting(browserApi, { id: 7, url }, 'key'), {
    value: true,
    documentNonce,
    url
  })
  assert.deepEqual(calls.at(-1)[1], [
    7,
    { type: 'wren:document-action', action: 'capture' },
    { frameId: 0 }
  ])
})

test('reads the fallback value atomically with its nonce instead of a stale executeScript result', async () => {
  const url = 'https://app.example/contracts?tab=write'
  const { browserApi, messageResults, scriptResults } = createBrowser({ activeUrl: url })
  scriptResults.push([{ frameId: 0, result: { value: 'false', url } }])
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'capture',
    accepted: true,
    documentNonce,
    url,
    value: 'true'
  })

  assert.deepEqual(await getLocalSetting(browserApi, { id: 7, url }, 'key'), {
    value: true,
    documentNonce,
    url
  })
})

test('rejects a Firefox nonce handshake after the captured document navigates', async () => {
  const url = 'https://app.example/contracts?tab=write'
  const { browserApi, messageResults, scriptResults } = createBrowser({ activeUrl: url })
  scriptResults.push([{ frameId: 0, result: { value: 'true', url } }])
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'capture',
    accepted: true,
    documentNonce: replacementDocumentNonce,
    url: 'https://app.example/replaced'
  })

  assert.deepEqual(await getLocalSetting(browserApi, { id: 7, url }, 'key'), { value: false })
})

test('writes identity before issuing a separately acknowledged exact-document reload command', async () => {
  const { browserApi, calls, messageResults } = createBrowser({
    activeUrl: 'https://app.example/contracts?method=deposit#write'
  })
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true
  })
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'reload',
    accepted: true
  })

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_CHANGED
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message', 'message']
  )
  assert.deepEqual(calls[0][1], [
    7,
    { type: 'wren:document-action', action: 'setIdentity', value: true },
    { documentId: 'document-1' }
  ])
  assert.deepEqual(calls[1][1], [
    7,
    { type: 'wren:document-action', action: 'reload' },
    { documentId: 'document-1' }
  ])
})

test('writes and reloads a Firefox document only when its nonce acknowledges both actions', async () => {
  const { browserApi, calls, messageResults } = createBrowser()
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true,
    documentNonce
  })
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'reload',
    accepted: true,
    documentNonce
  })

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedFirefoxDocument.url },
      capturedFirefoxDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_CHANGED
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message', 'message']
  )
  assert.deepEqual(calls[0][1], [
    7,
    {
      type: 'wren:document-action',
      action: 'setIdentity',
      value: true,
      documentNonce
    },
    { frameId: 0 }
  ])
  assert.deepEqual(calls[1][1], [
    7,
    { type: 'wren:document-action', action: 'reload', documentNonce },
    { frameId: 0 }
  ])
})

test('keeps the acknowledged identity saved when reload is not acknowledged', async () => {
  const { browserApi, calls, messageResults } = createBrowser()
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true
  })
  messageResults.push(new Error('The document reloaded before the reload acknowledgement'))

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_SAVED
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message', 'message']
  )
})

test('keeps the acknowledged identity saved when the reload preflight fails', async () => {
  const { browserApi, messageEffects, messageResults, setQueryError } = createBrowser()
  messageEffects.push(() => setQueryError(new Error('tabs query failed')))
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true
  })

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_SAVED
  )
})

test('refuses a replaced document and a cross-origin active tab', async () => {
  for (const activeUrl of ['https://other.example/contracts', 'chrome://extensions']) {
    const { browserApi, calls } = createBrowser({ activeUrl })
    assert.equal(
      await setLocalSetting(
        browserApi,
        { id: 7, url: capturedDocument.url },
        capturedDocument,
        '__frameAppearAsMM__',
        true
      ),
      IDENTITY_SETTING_FAILED
    )
    assert.equal(
      calls.some(([type]) => type === 'message'),
      false
    )
  }

  const { browserApi, calls, messageResults } = createBrowser()
  messageResults.push(new Error('The captured document was replaced'))
  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_FAILED
  )
  assert.equal(calls.length, 1)
})

test('reports a saved identity when the captured tab changes before reload dispatch', async () => {
  const { browserApi, calls, messageEffects, messageResults, setActiveUrl } = createBrowser()
  messageEffects.push(() => setActiveUrl('https://other.example/contracts'))
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true
  })

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_SAVED
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message']
  )
})

test('rejects a same-origin replacement document that answers with a different nonce', async () => {
  const { browserApi, calls, messageResults } = createBrowser()
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true,
    documentNonce: replacementDocumentNonce
  })

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedFirefoxDocument.url },
      capturedFirefoxDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_FAILED
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message']
  )
})

test('does not reload a same-origin replacement after the original nonce acknowledges its write', async () => {
  const { browserApi, calls, messageResults } = createBrowser()
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'setIdentity',
    accepted: true,
    documentNonce
  })
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'reload',
    accepted: true,
    documentNonce: replacementDocumentNonce
  })

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedFirefoxDocument.url },
      capturedFirefoxDocument,
      '__frameAppearAsMM__',
      true
    ),
    IDENTITY_SETTING_SAVED
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message', 'message']
  )
})

test('refreshes only after the captured document acknowledges the command', async () => {
  const { browserApi, calls, messageResults } = createBrowser({
    activeUrl: 'https://app.example/contracts#same-document'
  })
  messageResults.push({
    type: 'wren:document-action-result',
    action: 'reload',
    accepted: true
  })

  assert.equal(
    await reloadCapturedTab(browserApi, { id: 7, url: capturedDocument.url }, capturedDocument),
    true
  )
  assert.deepEqual(calls.at(-1)[1], [
    7,
    { type: 'wren:document-action', action: 'reload' },
    { documentId: 'document-1' }
  ])
})

test('never messages a replacement document through a frame-level target', async () => {
  const { browserApi, calls, setActiveUrl } = createBrowser()
  setActiveUrl('https://other.example/replaced')

  assert.equal(
    await reloadCapturedTab(browserApi, { id: 7, url: capturedDocument.url }, capturedDocument),
    false
  )
  assert.equal(
    calls.some(([type]) => type === 'message'),
    false
  )
})
