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

const capturedResult = (results, documentId) =>
  results?.find((result) => result?.documentId === documentId)

const activeTabMatches = (activeTab, tab, document) =>
  validDocumentId(document?.documentId) &&
  activeTab?.id === tab?.id &&
  isInjectedUrl(activeTab?.url) &&
  sameOrigin(activeTab.url, document.url)

export async function getLocalSetting(browserApi, tab, key) {
  if (!Number.isInteger(tab?.id) || !isInjectedUrl(tab?.url)) return { value: false }

  const results = await executeScript(
    browserApi,
    tab.id,
    (storageKey) => ({ value: localStorage.getItem(storageKey), url: window.location.href }),
    [key]
  )
  const result = results?.find((entry) => entry?.frameId === 0) || results?.[0]
  if (
    !validDocumentId(result?.documentId) ||
    typeof result?.result?.url !== 'string' ||
    !sameOrigin(result.result.url, tab.url)
  ) {
    return { value: false }
  }

  try {
    return {
      value: JSON.parse(result.result.value || false),
      documentId: result.documentId,
      url: result.result.url
    }
  } catch {
    return { value: false, documentId: result.documentId, url: result.result.url }
  }
}

async function runCapturedDocumentAction(browserApi, tab, document, func, args = []) {
  const activeTab = await getActiveTab(browserApi)
  if (!activeTabMatches(activeTab, tab, document)) return false

  const results = await executeScript(browserApi, tab.id, func, args, document.documentId)
  const result = capturedResult(results, document.documentId)
  return result?.result === true
}

export async function setLocalSetting(browserApi, tab, document, key, value) {
  return runCapturedDocumentAction(
    browserApi,
    tab,
    document,
    (storageKey, nextValue) => {
      const serialized = JSON.stringify(nextValue)
      localStorage.setItem(storageKey, serialized)
      if (localStorage.getItem(storageKey) !== serialized) return false
      setTimeout(() => window.location.reload(), 0)
      return true
    },
    [key, value]
  )
}

export async function reloadCapturedTab(browserApi, tab, document) {
  return runCapturedDocumentAction(browserApi, tab, document, () => {
    setTimeout(() => window.location.reload(), 0)
    return true
  })
}
