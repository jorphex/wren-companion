const assert = require('node:assert/strict')
const test = require('node:test')

const {
  DOCUMENT_ACTION_RESULT_TYPE,
  DOCUMENT_ACTION_TYPE,
  DOCUMENT_CAPTURE_ACTION,
  IDENTITY_STORAGE_KEY,
  RELOAD_RESPONSE_GRACE_MS,
  createDocumentActionListener
} = require('../src/document-actions')

const documentNonce = 'a'.repeat(64)

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
    setTimer: (callback, delay) => {
      events.push(['scheduled', delay])
      callback()
    }
  })
  const sendResponse = (response) => events.push(['response', response])
  return { events, listener, sendResponse, values }
}

test('acknowledges an exact identity write without reloading its receiver', () => {
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
    ['response', { type: DOCUMENT_ACTION_RESULT_TYPE, action: 'setIdentity', accepted: true }]
  ])
})

test('does not destroy an identity acknowledgement when response delivery is destructive', () => {
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

  listener(
    { type: DOCUMENT_ACTION_TYPE, action: 'setIdentity', value: true },
    { id: 'extension-id' },
    (response) => {
      events.push(['response', response])
      events.push('receiver-destroyed')
    }
  )

  assert.equal(values.get(IDENTITY_STORAGE_KEY), 'true')
  assert.deepEqual(events, [
    ['response', { type: DOCUMENT_ACTION_RESULT_TYPE, action: 'setIdentity', accepted: true }],
    'receiver-destroyed'
  ])
})

test('acknowledges an exact refresh before scheduling it', () => {
  const { events, listener, sendResponse } = setup()
  listener({ type: DOCUMENT_ACTION_TYPE, action: 'reload' }, { id: 'extension-id' }, sendResponse)
  assert.deepEqual(events, [
    ['response', { type: DOCUMENT_ACTION_RESULT_TYPE, action: 'reload', accepted: true }],
    ['scheduled', RELOAD_RESPONSE_GRACE_MS],
    'reload'
  ])
})

test('binds Firefox fallback actions to the content script document nonce', () => {
  const events = []
  const values = new Map()
  const listener = createDocumentActionListener({
    runtimeId: 'extension-id',
    storage: {
      getItem: (key) => values.get(key),
      setItem: (key, value) => values.set(key, value)
    },
    reload: () => events.push('reload'),
    setTimer: () => {},
    documentNonce,
    getDocumentUrl: () => 'https://app.example/contracts'
  })
  const responses = []

  listener(
    { type: DOCUMENT_ACTION_TYPE, action: DOCUMENT_CAPTURE_ACTION },
    { id: 'extension-id' },
    (response) => responses.push(response)
  )
  listener(
    {
      type: DOCUMENT_ACTION_TYPE,
      action: 'setIdentity',
      value: true,
      documentNonce: 'b'.repeat(64)
    },
    { id: 'extension-id' },
    (response) => responses.push(response)
  )
  listener(
    {
      type: DOCUMENT_ACTION_TYPE,
      action: 'setIdentity',
      value: true,
      documentNonce
    },
    { id: 'extension-id' },
    (response) => responses.push(response)
  )

  assert.deepEqual(responses, [
    {
      type: DOCUMENT_ACTION_RESULT_TYPE,
      action: DOCUMENT_CAPTURE_ACTION,
      accepted: true,
      documentNonce,
      url: 'https://app.example/contracts',
      value: undefined
    },
    {
      type: DOCUMENT_ACTION_RESULT_TYPE,
      action: 'setIdentity',
      accepted: true,
      documentNonce
    }
  ])
  assert.equal(values.get(IDENTITY_STORAGE_KEY), 'true')
})

test('rejects nonce capture and fallback actions from all_frames subframes', () => {
  const events = []
  const listener = createDocumentActionListener({
    runtimeId: 'extension-id',
    storage: { getItem: () => undefined, setItem: () => events.push('write') },
    reload: () => events.push('reload'),
    setTimer: () => events.push('timer'),
    documentNonce,
    isTopDocument: false
  })
  const sendResponse = () => events.push('response')

  assert.equal(
    listener(
      { type: DOCUMENT_ACTION_TYPE, action: DOCUMENT_CAPTURE_ACTION },
      { id: 'extension-id' },
      sendResponse
    ),
    false
  )
  assert.equal(
    listener(
      {
        type: DOCUMENT_ACTION_TYPE,
        action: 'setIdentity',
        value: true,
        documentNonce
      },
      { id: 'extension-id' },
      sendResponse
    ),
    false
  )
  assert.deepEqual(events, [])
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
