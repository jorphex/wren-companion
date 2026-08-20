function isEvictableIdleTopSession(session) {
  return Boolean(
    session &&
    !session.closed &&
    session.owner?.frameId === 0 &&
    !session.everUsed &&
    !session.socket &&
    session.pending?.size === 0 &&
    session.queue?.length === 0
  )
}

function sessionsForTab(sessions, tabId) {
  return [...sessions].filter((session) => !session.closed && session.owner.tabId === tabId)
}

function terminatePageSession(
  session,
  scheduleDisconnect = (disconnect) => setTimeout(disconnect, 100)
) {
  session.safePost?.({ type: 'fatal' })
  session.close()
  scheduleDisconnect(() => session.port?.disconnect?.())
}

function evictIdleTopSessions(
  sessions,
  {
    tabId,
    maxGlobalSessions,
    maxTabSessions,
    requiredGlobalSlots = 0,
    requiredTabSlots = 0,
    terminateSession = terminatePageSession
  }
) {
  const evicted = []
  const globalSessions = [...sessions].filter((session) => !session.closed)
  let globalOverage = Math.max(0, globalSessions.length + requiredGlobalSlots - maxGlobalSessions)
  let tabOverage = Math.max(
    0,
    sessionsForTab(sessions, tabId).length + requiredTabSlots - maxTabSessions
  )

  for (const session of globalSessions) {
    if (!isEvictableIdleTopSession(session)) continue
    if (globalOverage <= 0 && (session.owner.tabId !== tabId || tabOverage <= 0)) continue
    terminateSession(session)
    evicted.push(session)
    globalOverage -= 1
    if (session.owner.tabId === tabId) tabOverage -= 1
  }

  return evicted
}

module.exports = {
  evictIdleTopSessions,
  isEvictableIdleTopSession,
  sessionsForTab,
  terminatePageSession
}
