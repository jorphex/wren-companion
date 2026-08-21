const assert = require('node:assert/strict')
const test = require('node:test')

const {
  DOCUMENT_ACTION_RESULT_TYPE,
  DOCUMENT_ACTION_TYPE,
  IDENTITY_STORAGE_KEY,
  createDocumentActionListener
} = require('../src/document-actions')

function setup() {
  const events = []
  const values = new Map()
  const listener = createDocumentActionListener({
    runtimeId: 'extension-id',
    storage: {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value)
    },
    reload: () => events.push('reload'),
    setTimer: (callback) => callback()
  })
  const sendResponse = (response) => events.push(['response', response])
  return { events, listener, sendResponse, values }
}

test('acknowledges an exact identity write before scheduling its reload', () => {
  const { events, listener, sendResponse, values } = setup()

  assert.equal(
    listener(
      { type: DOCUMENT_ACTION_TYPE, action: 'setIdentity', value: true },
      { id: 'extension-id' },
      sendResponse
    ),
    false
  )
  assert.equal(values.get(IDENTITY_STORAGE_KEY), 'true')
  assert.deepEqual(events, [
    ['response', { type: DOCUMENT_ACTION_RESULT_TYPE, action: 'setIdentity', accepted: true }],
    'reload'
  ])
})

test('acknowledges an exact refresh before scheduling it', () => {
  const { events, listener, sendResponse } = setup()
  listener({ type: DOCUMENT_ACTION_TYPE, action: 'reload' }, { id: 'extension-id' }, sendResponse)
  assert.deepEqual(events, [
    ['response', { type: DOCUMENT_ACTION_RESULT_TYPE, action: 'reload', accepted: true }],
    'reload'
  ])
})

test('rejects foreign senders and malformed or broadened actions without side effects', () => {
  for (const [message, sender] of [
    [{ type: DOCUMENT_ACTION_TYPE, action: 'reload' }, { id: 'other-extension' }],
    [{ type: DOCUMENT_ACTION_TYPE, action: 'setIdentity', value: 'true' }, { id: 'extension-id' }],
    [
      { type: DOCUMENT_ACTION_TYPE, action: 'setIdentity', value: true, key: 'other' },
      { id: 'extension-id' }
    ],
    [{ type: DOCUMENT_ACTION_TYPE, action: 'other' }, { id: 'extension-id' }]
  ]) {
    const { events, listener, sendResponse, values } = setup()
    assert.equal(listener(message, sender, sendResponse), false)
    assert.deepEqual(events, [])
    assert.equal(values.size, 0)
  }
})
