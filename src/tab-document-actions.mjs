export const isInjectedUrl = (url = '') => url.startsWith('http://') || url.startsWith('https://')

const urlOrigin = (value) => {
  try {
    const url = new URL(value)
    return isInjectedUrl(url.href) ? url.origin : undefined
  } catch {
    return undefined
  }
}

const sameOrigin = (left, right) => {
  const leftOrigin = urlOrigin(left)
  return Boolean(leftOrigin && leftOrigin === urlOrigin(right))
}

const sameUrl = (left, right) => {
  try {
    return new URL(left).href === new URL(right).href
  } catch {
    return false
  }
}

export async function getActiveTab(browserApi) {
  const tabs = await browserApi.tabs.query({ active: true, currentWindow: true })
  return tabs[0]
}

async function executeScript(browserApi, tabId, func, args, documentId) {
  try {
    return await browserApi.scripting.executeScript({
      target: {
        tabId,
        ...(documentId ? { documentIds: [documentId] } : {})
      },
      func,
      args
    })
  } catch {
    return []
  }
}

const validDocumentId = (value) =>
  typeof value === 'string' && value.length > 0 && value.length <= 256

const validDocumentNonce = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value)

const hasExactDocumentTarget = (document) =>
  validDocumentId(document?.documentId) || validDocumentNonce(document?.documentNonce)

const activeTabMatches = (activeTab, tab, document) =>
  hasExactDocumentTarget(document) &&
  activeTab?.id === tab?.id &&
  isInjectedUrl(activeTab?.url) &&
  sameOrigin(activeTab.url, document.url)

export const IDENTITY_SETTING_CHANGED = 'changed'
export const IDENTITY_SETTING_FAILED = 'failed'
export const IDENTITY_SETTING_SAVED = 'saved'

const capturedDocumentTarget = (document) =>
  validDocumentId(document?.documentId)
    ? { documentId: document.documentId }
    : validDocumentNonce(document?.documentNonce)
      ? { frameId: 0 }
      : undefined

const exactDocumentActionResponse = (response, action, document) =>
  response?.type === 'wren:document-action-result' &&
  response.action === action &&
  response.accepted === true &&
  (!validDocumentNonce(document?.documentNonce) ||
    response.documentNonce === document.documentNonce)

const captureFallbackDocument = async (browserApi, tab, expectedUrl) => {
  try {
    const before = await getActiveTab(browserApi)
    if (before?.id !== tab?.id || !sameUrl(before.url, expectedUrl)) return undefined
    const response = await browserApi.tabs.sendMessage(
      tab.id,
      { type: 'wren:document-action', action: 'capture' },
      { frameId: 0 }
    )
    const after = await getActiveTab(browserApi)
    if (
      response?.type !== 'wren:document-action-result' ||
      response.action !== 'capture' ||
      response.accepted !== true ||
      !validDocumentNonce(response.documentNonce) ||
      (response.value !== null &&
        response.value !== undefined &&
        typeof response.value !== 'string') ||
      !sameUrl(response.url, expectedUrl) ||
      after?.id !== tab?.id ||
      !sameUrl(after.url, response.url)
    ) {
      return undefined
    }
    return { documentNonce: response.documentNonce, url: response.url, value: response.value }
  } catch {
    return undefined
  }
}

const sendCapturedDocumentAction = async (browserApi, tab, document, action) => {
  try {
    const activeTab = await getActiveTab(browserApi)
    const target = capturedDocumentTarget(document)
    if (!target || !activeTabMatches(activeTab, tab, document)) {
      return { accepted: false, attempted: false }
    }
    const message = {
      type: 'wren:document-action',
      ...action,
      ...(validDocumentNonce(document.documentNonce) && { documentNonce: document.documentNonce })
    }
    const response = await browserApi.tabs.sendMessage(tab.id, message, target)
    return {
      accepted: exactDocumentActionResponse(response, action.action, document),
      attempted: true
    }
  } catch {
    return { accepted: false, attempted: true }
  }
}

export async function getLocalSetting(browserApi, tab, key) {
  if (!Number.isInteger(tab?.id) || !isInjectedUrl(tab?.url)) return { value: false }

  const results = await executeScript(
    browserApi,
    tab.id,
    (storageKey) => ({ value: localStorage.getItem(storageKey), url: window.location.href }),
    [key]
  )
  const result = results?.find((entry) => entry?.frameId === 0)
  if (typeof result?.result?.url !== 'string' || !sameOrigin(result.result.url, tab.url)) {
    return { value: false }
  }

  const capturedDocument = validDocumentId(result.documentId)
    ? { documentId: result.documentId, url: result.result.url }
    : await captureFallbackDocument(browserApi, tab, result.result.url)
  if (!capturedDocument) return { value: false }
  const serialized = validDocumentId(capturedDocument.documentId)
    ? result.result.value
    : capturedDocument.value
  const document = validDocumentId(capturedDocument.documentId)
    ? capturedDocument
    : { documentNonce: capturedDocument.documentNonce, url: capturedDocument.url }

  try {
    return {
      value: JSON.parse(serialized || false),
      ...document
    }
  } catch {
    return { value: false, ...document }
  }
}

export async function setLocalSetting(browserApi, tab, document, key, value) {
  if (key !== '__frameAppearAsMM__' || typeof value !== 'boolean') {
    return IDENTITY_SETTING_FAILED
  }
  const written = await sendCapturedDocumentAction(browserApi, tab, document, {
    action: 'setIdentity',
    value
  })
  if (!written.accepted) return IDENTITY_SETTING_FAILED
  // The document grants a short response-delivery window before reloading.
  // Only its explicit acknowledgement proves that the reload was scheduled;
  // any preflight or message error leaves truthful manual-refresh guidance.
  const reload = await sendCapturedDocumentAction(browserApi, tab, document, {
    action: 'reload'
  })
  return reload.accepted ? IDENTITY_SETTING_CHANGED : IDENTITY_SETTING_SAVED
}

export async function reloadCapturedTab(browserApi, tab, document) {
  return (await sendCapturedDocumentAction(browserApi, tab, document, { action: 'reload' }))
    .accepted
}
