import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getLocalSetting,
  reloadCapturedTab,
  setLocalSetting
} from '../src/tab-document-actions.mjs'

const capturedDocument = {
  documentId: 'document-1',
  url: 'https://app.example/contracts',
  value: false
}

const createBrowser = ({ activeUrl = capturedDocument.url } = {}) => {
  const calls = []
  const messageResults = []
  const scriptResults = []
  const browserApi = {
    tabs: {
      query: async () => [{ id: 7, url: activeUrl }],
      sendMessage: async (...args) => {
        calls.push(['message', args])
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
    scriptResults,
    setActiveUrl: (url) => (activeUrl = url)
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

test('writes identity through an acknowledged exact-document reload command', async () => {
  const { browserApi, calls, messageResults } = createBrowser({
    activeUrl: 'https://app.example/contracts?method=deposit#write'
  })
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
    true
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['message']
  )
  assert.deepEqual(calls[0][1], [
    7,
    { type: 'wren:document-action', action: 'setIdentity', value: true },
    { documentId: 'document-1' }
  ])
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
      false
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
    false
  )
  assert.equal(calls.length, 1)
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
