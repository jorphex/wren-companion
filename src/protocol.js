const MAX_MESSAGE_BYTES = 1024 * 1024
const MAX_ID_LENGTH = 256
const MAX_METHOD_LENGTH = 256
const requestKeys = new Set(['jsonrpc', 'id', 'method', 'params', 'chainId'])
const protectedMethods = new Set(['frame_summon', 'wallet_getEthereumChains'])
const responseKeys = new Set(['jsonrpc', 'id', 'result', 'error'])
const errorKeys = new Set(['code', 'message', 'data'])
const subscriptionKeys = new Set(['jsonrpc', 'method', 'params'])

function isObject(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  try {
    const prototype = Object.getPrototypeOf(value)
    return prototype === Object.prototype || prototype === null
  } catch {
    return false
  }
}

function serializedSize(value) {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Infinity
  }
}

function validId(id) {
  return (
    (typeof id === 'number' && Number.isFinite(id)) ||
    (typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH)
  )
}

function responseId(value) {
  return isObject(value) && validId(value.id) ? value.id : null
}

function hasControlCharacters(value) {
  return [...value].some((character) => {
    const code = character.codePointAt(0)
    return code <= 0x1f || code === 0x7f
  })
}

function errorResponse(id, code, message) {
  return { jsonrpc: '2.0', id: validId(id) ? id : null, error: { code, message } }
}

function invalidRequest(value, message = 'Invalid Request') {
  return { success: false, error: errorResponse(responseId(value), -32600, message) }
}

function parsePageRequestValue(value) {
  if (!isObject(value) || serializedSize(value) > MAX_MESSAGE_BYTES) return invalidRequest(value)
  if (Object.keys(value).some((key) => !requestKeys.has(key))) return invalidRequest(value)
  if (value.jsonrpc !== '2.0' || !validId(value.id)) return invalidRequest(value)
  if (
    typeof value.method !== 'string' ||
    value.method.length === 0 ||
    value.method.length > MAX_METHOD_LENGTH ||
    hasControlCharacters(value.method)
  ) {
    return invalidRequest(value)
  }
  if (protectedMethods.has(value.method)) {
    return invalidRequest(value, 'Unsupported method')
  }
  if (value.params !== undefined && !Array.isArray(value.params) && !isObject(value.params)) {
    return invalidRequest(value, 'Invalid params')
  }
  if (
    value.chainId !== undefined &&
    (typeof value.chainId !== 'string' ||
      value.chainId.length > 66 ||
      !/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(value.chainId))
  ) {
    return invalidRequest(value, 'Invalid chain id')
  }

  return {
    success: true,
    value: {
      jsonrpc: '2.0',
      id: value.id,
      method: value.method,
      params: value.params ?? [],
      ...(value.chainId !== undefined && { chainId: value.chainId })
    }
  }
}

function parsePageRequest(value) {
  try {
    // Firefox retains the page realm for objects transferred to a content script.
    // JSON-RPC normalization gives both browser realms the same plain-data boundary.
    const serialized = JSON.stringify(value)
    if (
      typeof serialized !== 'string' ||
      new TextEncoder().encode(serialized).byteLength > MAX_MESSAGE_BYTES
    ) {
      return invalidRequest(value)
    }
    return parsePageRequestValue(JSON.parse(serialized))
  } catch {
    return invalidRequest(value)
  }
}

function parseDesktopMessage(data) {
  if (typeof data !== 'string' || new TextEncoder().encode(data).byteLength > MAX_MESSAGE_BYTES) {
    return { success: false }
  }

  let value
  try {
    value = JSON.parse(data)
  } catch {
    return { success: false }
  }

  if (!isObject(value) || value.jsonrpc !== '2.0' || serializedSize(value) > MAX_MESSAGE_BYTES) {
    return { success: false }
  }

  if (validId(value.id)) {
    if (Object.keys(value).some((key) => !responseKeys.has(key))) return { success: false }
    const hasResult = Object.prototype.hasOwnProperty.call(value, 'result')
    const hasError = isObject(value.error)
    if (hasResult === hasError) return { success: false }
    if (
      hasError &&
      (Object.keys(value.error).some((key) => !errorKeys.has(key)) ||
        typeof value.error.code !== 'number' ||
        !Number.isFinite(value.error.code) ||
        typeof value.error.message !== 'string' ||
        value.error.message.length > 1024)
    ) {
      return { success: false }
    }
    return { success: true, value }
  }

  if (
    Object.keys(value).every((key) => subscriptionKeys.has(key)) &&
    value.method === 'eth_subscription' &&
    isObject(value.params) &&
    typeof value.params.subscription === 'string' &&
    value.params.subscription.length <= MAX_ID_LENGTH
  ) {
    return { success: true, value }
  }

  return { success: false }
}

module.exports = {
  MAX_MESSAGE_BYTES,
  errorResponse,
  parseDesktopMessage,
  parsePageRequest,
  serializedSize,
  validId
}
