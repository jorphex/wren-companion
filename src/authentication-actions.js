const TERMINAL_AUTHENTICATION_CODES = new Set(['pinned-desktop-mismatch'])

function parseAuthenticationAction(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) return
  const keys = Object.keys(message)
  if (message.type === 'reconnectAuthentication' && keys.length === 1) return 'reconnect'
  if (
    message.type === 'rotateCredential' &&
    message.confirmation === 'reset-pairing' &&
    keys.length === 2
  ) {
    return 'reset-pairing'
  }
}

function shouldPauseAuthentication(authentication) {
  return (
    authentication?.status === 'upgrade-required' ||
    (authentication?.status === 'error' && TERMINAL_AUTHENTICATION_CODES.has(authentication.code))
  )
}

function canPerformAuthenticationAction(action, authentication) {
  if (action === 'reconnect') return authentication?.status === 'upgrade-required'
  if (action === 'reset-pairing') {
    return (
      authentication?.status === 'authenticated' ||
      (authentication?.status === 'error' && authentication.code === 'pinned-desktop-mismatch')
    )
  }
  return false
}

module.exports = {
  canPerformAuthenticationAction,
  parseAuthenticationAction,
  shouldPauseAuthentication
}
