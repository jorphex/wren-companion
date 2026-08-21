const DOCUMENT_ACTION_TYPE = 'wren:document-action'
const DOCUMENT_ACTION_RESULT_TYPE = 'wren:document-action-result'
const DOCUMENT_CAPTURE_ACTION = 'capture'
const IDENTITY_STORAGE_KEY = '__frameAppearAsMM__'
const RELOAD_RESPONSE_GRACE_MS = 100

const validDocumentNonce = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value)

const exactKeys = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  return actual.length === keys.length && actual.every((key, index) => key === keys[index])
}

function createDocumentActionListener({
  runtimeId,
  storage,
  reload,
  setTimer,
  documentNonce,
  isTopDocument = true,
  getDocumentUrl = () => window.location.href
}) {
  return (message, sender, sendResponse) => {
    if (sender?.id !== runtimeId) return false

    const fallbackTarget = validDocumentNonce(message?.documentNonce)
    const nonceMatches = fallbackTarget && message.documentNonce === documentNonce
    let accepted = false
    let capturedValue
    if (
      exactKeys(message, ['action', 'type']) &&
      message.type === DOCUMENT_ACTION_TYPE &&
      message.action === DOCUMENT_CAPTURE_ACTION &&
      isTopDocument === true &&
      validDocumentNonce(documentNonce)
    ) {
      try {
        capturedValue = storage.getItem(IDENTITY_STORAGE_KEY)
        accepted = true
      } catch {
        accepted = false
      }
    } else if (
      exactKeys(
        message,
        fallbackTarget ? ['action', 'documentNonce', 'type'] : ['action', 'type']
      ) &&
      message.type === DOCUMENT_ACTION_TYPE &&
      message.action === 'reload' &&
      (!fallbackTarget || isTopDocument === true) &&
      (!fallbackTarget || nonceMatches)
    ) {
      accepted = true
    } else if (
      exactKeys(
        message,
        fallbackTarget ? ['action', 'documentNonce', 'type', 'value'] : ['action', 'type', 'value']
      ) &&
      message.type === DOCUMENT_ACTION_TYPE &&
      message.action === 'setIdentity' &&
      typeof message.value === 'boolean' &&
      (!fallbackTarget || isTopDocument === true) &&
      (!fallbackTarget || nonceMatches)
    ) {
      try {
        const serialized = JSON.stringify(message.value)
        storage.setItem(IDENTITY_STORAGE_KEY, serialized)
        accepted = storage.getItem(IDENTITY_STORAGE_KEY) === serialized
      } catch {
        accepted = false
      }
    }

    if (!accepted) return false
    try {
      sendResponse({
        type: DOCUMENT_ACTION_RESULT_TYPE,
        action: message.action,
        accepted: true,
        ...((fallbackTarget || message.action === DOCUMENT_CAPTURE_ACTION) && { documentNonce }),
        ...(message.action === DOCUMENT_CAPTURE_ACTION && {
          url: getDocumentUrl(),
          value: capturedValue
        })
      })
    } catch {
      return false
    }
    // Identity writes never reload their receiver. A separate reload command
    // acknowledges that scheduling succeeded, then gives the browser time to
    // deliver that response before replacing the document.
    if (message.action === 'reload') setTimer(reload, RELOAD_RESPONSE_GRACE_MS)
    return false
  }
}

module.exports = {
  DOCUMENT_ACTION_RESULT_TYPE,
  DOCUMENT_ACTION_TYPE,
  DOCUMENT_CAPTURE_ACTION,
  IDENTITY_STORAGE_KEY,
  RELOAD_RESPONSE_GRACE_MS,
  createDocumentActionListener,
  validDocumentNonce
}
