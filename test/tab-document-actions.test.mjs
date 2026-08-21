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
  const scriptResults = []
  const browserApi = {
    tabs: {
      query: async () => [{ id: 7, url: activeUrl }]
    },
    scripting: {
      executeScript: async (options) => {
        calls.push(['script', options])
        return scriptResults.shift() || []
      }
    }
  }
  return { browserApi, calls, scriptResults, setActiveUrl: (url) => (activeUrl = url) }
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

test('acknowledges the write before reloading across a same-document route change', async () => {
  const { browserApi, calls, scriptResults } = createBrowser({
    activeUrl: 'https://app.example/contracts?method=deposit#write'
  })
  scriptResults.push([{ frameId: 0, documentId: 'document-1', result: true }])

  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      'identity',
      true
    ),
    true
  )
  assert.deepEqual(
    calls.map(([type]) => type),
    ['script']
  )
  assert.deepEqual(calls[0][1].target, { tabId: 7, documentIds: ['document-1'] })
  assert.match(
    calls[0][1].func.toString(),
    /setTimeout\(\(\) => window\.location\.reload\(\), 0\)/u
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
        'identity',
        true
      ),
      false
    )
    assert.equal(
      calls.some(([type]) => type === 'script'),
      false
    )
  }

  const { browserApi, calls, scriptResults } = createBrowser()
  scriptResults.push([{ frameId: 0, documentId: 'document-2', result: true }])
  assert.equal(
    await setLocalSetting(
      browserApi,
      { id: 7, url: capturedDocument.url },
      capturedDocument,
      'identity',
      true
    ),
    false
  )
  assert.equal(calls.length, 1)
})

test('refreshes only after proving the captured document is still active', async () => {
  const { browserApi, calls, scriptResults } = createBrowser({
    activeUrl: 'https://app.example/contracts#same-document'
  })
  scriptResults.push([
    {
      frameId: 0,
      documentId: 'document-1',
      result: true
    }
  ])

  assert.equal(
    await reloadCapturedTab(browserApi, { id: 7, url: capturedDocument.url }, capturedDocument),
    true
  )
  assert.deepEqual(calls.at(-1)[1].target, { tabId: 7, documentIds: ['document-1'] })
  assert.match(
    calls.at(-1)[1].func.toString(),
    /setTimeout\(\(\) => window\.location\.reload\(\), 0\)/u
  )
})

test('never reloads a replacement document through a tab-level API', async () => {
  const { browserApi, calls, scriptResults, setActiveUrl } = createBrowser()
  scriptResults.push([])
  setActiveUrl('https://other.example/replaced')

  assert.equal(
    await reloadCapturedTab(browserApi, { id: 7, url: capturedDocument.url }, capturedDocument),
    false
  )
  assert.equal(
    calls.some(([type]) => type === 'reload'),
    false
  )
})
