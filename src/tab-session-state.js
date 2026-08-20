function tabSessionState(sessions, tabId, origin) {
  const candidates = [...sessions].filter(
    (session) => !session.closed && session.owner.tabId === tabId && session.owner.origin === origin
  )
  if (!candidates.length) return

  const confirmed = candidates.find((session) => session.pageConnectionConfirmed)
  const ready = candidates.find((session) => session.connected && session.currentChain)
  const connected = candidates.find((session) => session.connected)
  const chain =
    confirmed?.currentChain ||
    ready?.currentChain ||
    candidates.find((session) => session.currentChain)?.currentChain ||
    ''

  return {
    chain,
    status: confirmed ? 'connected' : ready || connected ? 'ready' : 'checking'
  }
}

module.exports = { tabSessionState }
