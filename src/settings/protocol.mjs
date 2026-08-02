function toRpcChainId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return
  return `0x${value.toString(16)}`
}

const simpleAuthenticationStatuses = new Set([
  'authenticating',
  'disconnected',
  'preparing',
  'rotating'
])

function parseAuthenticationState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'disconnected' }
  if (simpleAuthenticationStatuses.has(value.status)) return { status: value.status }
  if (value.status === 'pairing' && /^\d{6}$/u.test(value.pairingCode)) {
    return { status: 'pairing', pairingCode: value.pairingCode }
  }
  if (value.status === 'authenticated') return { status: 'authenticated' }
  if (
    value.status === 'error' &&
    typeof value.code === 'string' &&
    value.code.length > 0 &&
    value.code.length <= 64 &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 1024
  ) {
    return { status: 'error', code: value.code, message: value.message }
  }
  return { status: 'disconnected' }
}

export { parseAuthenticationState, toRpcChainId }
