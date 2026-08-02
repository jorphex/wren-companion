const { bytesToBase64Url } = require('./credential-store')

const AUTH_VERSION = 2
const MAX_AUTH_MESSAGE_BYTES = 8 * 1024
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000
const browsers = new Set(['chrome', 'firefox', 'safari'])
const errorCodes = new Set([
  'denied',
  'expired',
  'invalid-message',
  'invalid-proof',
  'invalid-state',
  'unsupported-version'
])

function deriveExtensionIdentity(runtimeUrl) {
  try {
    const url = new URL(runtimeUrl)
    const extensionId = url.hostname.toLowerCase()
    if (url.protocol === 'chrome-extension:' && /^[a-p]{32}$/u.test(extensionId)) {
      return Object.freeze({ browser: 'chrome', extensionId })
    }
    if (
      url.protocol === 'moz-extension:' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(extensionId)
    ) {
      return Object.freeze({ browser: 'firefox', extensionId })
    }
  } catch {
    return
  }
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
}

function isBase64Url(value, length) {
  if (typeof value !== 'string' || value.length !== length || !/^[A-Za-z0-9_-]+$/u.test(value)) {
    return false
  }
  try {
    const padding = '='.repeat((4 - (value.length % 4)) % 4)
    const bytes = Uint8Array.from(
      atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding),
      (character) => character.charCodeAt(0)
    )
    return bytesToBase64Url(bytes) === value
  } catch {
    return false
  }
}

function parseServerAuthMessage(data) {
  if (
    typeof data !== 'string' ||
    new TextEncoder().encode(data).byteLength > MAX_AUTH_MESSAGE_BYTES
  ) {
    return { success: false, code: 'invalid-message' }
  }

  let value
  try {
    value = JSON.parse(data)
  } catch {
    return { success: false, code: 'invalid-message' }
  }
  if (!isObject(value) || value.type !== 'frame-auth') {
    return { success: false, code: 'invalid-message' }
  }
  if (value.version !== AUTH_VERSION) {
    return { success: false, code: 'unsupported-version' }
  }

  if (
    value.step === 'challenge' &&
    exactKeys(value, [
      'type',
      'version',
      'step',
      'challengeId',
      'clientNonce',
      'serverNonce',
      'browser',
      'extensionId',
      'installationId',
      'fingerprint',
      'expiresAt'
    ]) &&
    typeof value.challengeId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.challengeId
    ) &&
    isBase64Url(value.clientNonce, 43) &&
    isBase64Url(value.serverNonce, 43) &&
    browsers.has(value.browser) &&
    typeof value.extensionId === 'string' &&
    value.extensionId.length > 0 &&
    value.extensionId.length <= 128 &&
    typeof value.installationId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value.installationId
    ) &&
    isBase64Url(value.fingerprint, 43) &&
    Number.isSafeInteger(value.expiresAt)
  ) {
    return { success: true, value }
  }

  if (
    value.step === 'authenticated' &&
    exactKeys(value, ['type', 'version', 'step', 'fingerprint']) &&
    isBase64Url(value.fingerprint, 43)
  ) {
    return { success: true, value }
  }

  if (
    value.step === 'error' &&
    exactKeys(value, ['type', 'version', 'step', 'code', 'message']) &&
    errorCodes.has(value.code) &&
    typeof value.message === 'string' &&
    value.message.length > 0 &&
    value.message.length <= 1024
  ) {
    return { success: true, value }
  }

  return { success: false, code: 'invalid-message' }
}

function authPayload(challenge) {
  return new TextEncoder().encode(
    [
      'frame-extension-auth-v2',
      challenge.challengeId,
      challenge.clientNonce,
      challenge.serverNonce,
      challenge.browser,
      challenge.extensionId,
      challenge.installationId,
      challenge.fingerprint,
      String(challenge.expiresAt)
    ].join('\n')
  )
}

async function pairingCode(challenge, subtle = crypto.subtle) {
  const prefix = new TextEncoder().encode('frame-pairing-code-v2\0')
  const payload = authPayload(challenge)
  const input = new Uint8Array(prefix.length + payload.length)
  input.set(prefix)
  input.set(payload, prefix.length)
  const digest = new Uint8Array(await subtle.digest('SHA-256', input))
  const value = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0)
  return String(value % 1_000_000).padStart(6, '0')
}

function validateChallenge(challenge, expected, now = Date.now()) {
  return (
    challenge.step === 'challenge' &&
    challenge.clientNonce === expected.clientNonce &&
    challenge.browser === expected.browser &&
    challenge.extensionId === expected.extensionId &&
    challenge.installationId === expected.installationId &&
    challenge.fingerprint === expected.fingerprint &&
    challenge.expiresAt > now &&
    challenge.expiresAt <= now + MAX_CLOCK_SKEW_MS
  )
}

module.exports = {
  AUTH_VERSION,
  MAX_AUTH_MESSAGE_BYTES,
  authPayload,
  deriveExtensionIdentity,
  pairingCode,
  parseServerAuthMessage,
  validateChallenge
}
