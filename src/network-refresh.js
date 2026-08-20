const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 240

function networkRefreshSuccess(chains) {
  if (!Array.isArray(chains)) throw new Error('Wren returned an invalid network catalog')
  return {
    availableChains: chains,
    chainsStatus: 'ready',
    chainsError: null
  }
}

function networkRefreshFailure(error) {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error')
  const message = rawMessage.slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH)
  const code =
    typeof error?.code === 'number' || typeof error?.code === 'string' ? error.code : undefined

  return {
    chainsStatus: 'error',
    chainsError: {
      ...(code === undefined ? {} : { code }),
      message
    }
  }
}

module.exports = { networkRefreshFailure, networkRefreshSuccess }
