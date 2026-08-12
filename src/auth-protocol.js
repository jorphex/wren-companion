const { bytesToBase64Url, fingerprintPublicKey, isPublicKey } = require('./credential-store')

const AUTH_VERSION = 3
const AUTH_PROTOCOL = 'wren-companion-auth'
const PEER_KIND = 'companion'
const MAX_AUTH_MESSAGE_BYTES = 16 * 1024
const MAX_CLOCK_SKEW_MS = 2 * 60 * 1000
const CHANNEL_ROLES = new Set(['control', 'page'])
const TRANSCRIPT_ROLES = new Set(['desktop-challenge', 'client-response', 'desktop-ack'])
const errorCodes = new Set([
  'denied',
  'expired',
  'invalid-message',
  'invalid-proof',
  'invalid-state',
  'pinned-desktop-mismatch',
  'unsupported-version'
])
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

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
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
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

function base64UrlToBytes(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(
    atob(value.replaceAll('-', '+').replaceAll('_', '/') + padding),
    (character) => character.charCodeAt(0)
  )
}

const validDesktopIdentity = (value, withKey = false) =>
  exactKeys(
    value,
    withKey ? ['installationId', 'fingerprint', 'publicKey'] : ['installationId', 'fingerprint']
  ) &&
  UUID_V4.test(value.installationId) &&
  isBase64Url(value.fingerprint, 43) &&
  (!withKey || isPublicKey(value.publicKey))

const validClientIdentity = (value) =>
  exactKeys(value, ['installationId', 'fingerprint', 'roleFingerprint']) &&
  UUID_V4.test(value.installationId) &&
  isBase64Url(value.fingerprint, 43) &&
  isBase64Url(value.roleFingerprint, 43)

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
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.type !== 'frame-auth') {
    return { success: false, code: 'invalid-message' }
  }
  if (value.version !== AUTH_VERSION) return { success: false, code: 'unsupported-version' }

  const transcriptFields = [
    'type',
    'version',
    'step',
    'peerKind',
    'channelRole',
    'challengeId',
    'desktopNonce',
    'clientNonce',
    'expiresAt',
    'desktop',
    'client',
    'signature'
  ]
  if (
    (value.step === 'challenge' || value.step === 'authenticated') &&
    exactKeys(value, transcriptFields) &&
    value.peerKind === PEER_KIND &&
    CHANNEL_ROLES.has(value.channelRole) &&
    UUID_V4.test(value.challengeId) &&
    isBase64Url(value.desktopNonce, 43) &&
    isBase64Url(value.clientNonce, 43) &&
    Number.isSafeInteger(value.expiresAt) &&
    validDesktopIdentity(value.desktop, value.step === 'challenge') &&
    validClientIdentity(value.client) &&
    isBase64Url(value.signature, 86)
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

function transcriptObject(challenge, role) {
  if (!TRANSCRIPT_ROLES.has(role)) throw new Error('Invalid authentication transcript role')
  return {
    protocol: AUTH_PROTOCOL,
    version: AUTH_VERSION,
    peerKind: PEER_KIND,
    role,
    channelRole: challenge.channelRole,
    desktop: {
      installationId: challenge.desktop.installationId,
      fingerprint: challenge.desktop.fingerprint
    },
    client: {
      installationId: challenge.client.installationId,
      fingerprint: challenge.client.fingerprint,
      roleFingerprint: challenge.client.roleFingerprint
    },
    challengeId: challenge.challengeId,
    desktopNonce: challenge.desktopNonce,
    clientNonce: challenge.clientNonce,
    expiresAt: challenge.expiresAt
  }
}

function authPayload(challenge, role) {
  return new TextEncoder().encode(
    `wren-companion-auth-v3\0${JSON.stringify(transcriptObject(challenge, role))}`
  )
}

async function pairingCode(challenge, subtle = crypto.subtle) {
  const digest = new Uint8Array(
    await subtle.digest('SHA-256', authPayload(challenge, 'desktop-challenge'))
  )
  const value = new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0)
  return String(value % 1_000_000).padStart(6, '0')
}

function validateChallenge(challenge, expected, now = Date.now()) {
  return (
    challenge.step === 'challenge' &&
    challenge.peerKind === PEER_KIND &&
    challenge.channelRole === expected.channelRole &&
    challenge.clientNonce === expected.clientNonce &&
    challenge.client.installationId === expected.installationId &&
    challenge.client.fingerprint === expected.fingerprint &&
    challenge.client.roleFingerprint === expected.roleFingerprint &&
    challenge.expiresAt > now &&
    challenge.expiresAt <= now + MAX_CLOCK_SKEW_MS
  )
}

function sameExchange(message, challenge) {
  return (
    message.step === 'authenticated' &&
    message.peerKind === challenge.peerKind &&
    message.channelRole === challenge.channelRole &&
    message.challengeId === challenge.challengeId &&
    message.desktopNonce === challenge.desktopNonce &&
    message.clientNonce === challenge.clientNonce &&
    message.expiresAt === challenge.expiresAt &&
    message.desktop.installationId === challenge.desktop.installationId &&
    message.desktop.fingerprint === challenge.desktop.fingerprint &&
    message.client.installationId === challenge.client.installationId &&
    message.client.fingerprint === challenge.client.fingerprint &&
    message.client.roleFingerprint === challenge.client.roleFingerprint
  )
}

async function verifyDesktopProof(message, role, publicKey, subtle = crypto.subtle) {
  if ((await fingerprintPublicKey(publicKey, subtle)) !== message.desktop.fingerprint) return false
  try {
    const key = await subtle.importKey(
      'jwk',
      publicKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    )
    return subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64UrlToBytes(message.signature),
      authPayload(message, role)
    )
  } catch {
    return false
  }
}

module.exports = {
  AUTH_PROTOCOL,
  AUTH_VERSION,
  MAX_AUTH_MESSAGE_BYTES,
  authPayload,
  deriveExtensionIdentity,
  pairingCode,
  parseServerAuthMessage,
  sameExchange,
  transcriptObject,
  validateChallenge,
  verifyDesktopProof
}
