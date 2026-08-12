const assert = require('node:assert/strict')
const cryptoModule = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const {
  authPayload,
  deriveExtensionIdentity,
  pairingCode,
  parseServerAuthMessage,
  sameExchange,
  transcriptObject,
  validateChallenge,
  verifyDesktopProof
} = require('../src/auth-protocol')
const { createCredentialBundle } = require('../src/credential-store')

const uuid = (digit) =>
  `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`
const nonce = (byte) => Buffer.alloc(32, byte).toString('base64url')

async function signedChallenge() {
  const desktop = await createCredentialBundle(crypto.subtle, uuid('1'), 1)
  const client = await createCredentialBundle(crypto.subtle, uuid('2'), 1)
  const desktopCredential = desktop.credentials.control
  const clientCredential = client.credentials.control
  const challenge = {
    type: 'frame-auth',
    version: 3,
    step: 'challenge',
    peerKind: 'companion',
    channelRole: 'control',
    challengeId: uuid('3'),
    desktopNonce: nonce(3),
    clientNonce: nonce(4),
    expiresAt: 61_000,
    desktop: {
      installationId: desktop.installationId,
      fingerprint: desktopCredential.fingerprint,
      publicKey: desktopCredential.publicKey
    },
    client: {
      installationId: client.installationId,
      fingerprint: client.fingerprint,
      roleFingerprint: clientCredential.fingerprint
    }
  }
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    desktopCredential.privateKey,
    authPayload(challenge, 'desktop-challenge')
  )
  return { ...challenge, signature: Buffer.from(signature).toString('base64url') }
}

test('uses the immutable cross-repo canonical transcript fixture', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'fixtures/wren-companion-auth-v3.json'), 'utf8')
  )
  const message = {
    channelRole: fixture.transcript.channelRole,
    desktop: fixture.transcript.desktop,
    client: fixture.transcript.client,
    challengeId: fixture.transcript.challengeId,
    desktopNonce: fixture.transcript.desktopNonce,
    clientNonce: fixture.transcript.clientNonce,
    expiresAt: fixture.transcript.expiresAt
  }
  assert.deepEqual(transcriptObject(message, 'desktop-challenge'), fixture.transcript)
  const payload = Buffer.from(authPayload(message, 'desktop-challenge'))
  assert.equal(payload.toString('base64'), fixture.payloadBase64)
  assert.equal(cryptoModule.createHash('sha256').update(payload).digest('hex'), fixture.sha256)
})

test('parses strict signed v3 messages and rejects downgrade, role confusion, and additions', async () => {
  const challenge = await signedChallenge()
  assert.deepEqual(parseServerAuthMessage(JSON.stringify(challenge)), {
    success: true,
    value: challenge
  })
  for (const candidate of [
    { ...challenge, version: 2 },
    { ...challenge, peerKind: 'native' },
    { ...challenge, channelRole: 'rpc' },
    { ...challenge, extra: true },
    { ...challenge, signature: 'a'.repeat(86) }
  ]) {
    const result = parseServerAuthMessage(JSON.stringify(candidate))
    if (candidate.version === 2) assert.equal(result.code, 'unsupported-version')
    else assert.equal(result.success, false)
  }
  assert.equal(parseServerAuthMessage('x'.repeat(17 * 1024)).success, false)
})

test('verifies desktop proof and detects expiry, tampering, replay, and ack substitution', async () => {
  const challenge = await signedChallenge()
  assert.equal(
    await verifyDesktopProof(challenge, 'desktop-challenge', challenge.desktop.publicKey),
    true
  )
  assert.equal(
    await verifyDesktopProof(
      { ...challenge, challengeId: uuid('5') },
      'desktop-challenge',
      challenge.desktop.publicKey
    ),
    false
  )
  const expected = {
    channelRole: 'control',
    installationId: challenge.client.installationId,
    fingerprint: challenge.client.fingerprint,
    roleFingerprint: challenge.client.roleFingerprint,
    clientNonce: challenge.clientNonce
  }
  assert.equal(validateChallenge(challenge, expected, 1000), true)
  assert.equal(validateChallenge(challenge, expected, challenge.expiresAt), false)
  assert.equal(validateChallenge(challenge, { ...expected, channelRole: 'page' }, 1000), false)

  const { publicKey: _publicKey, ...desktopIdentity } = challenge.desktop
  const ack = { ...challenge, step: 'authenticated', desktop: desktopIdentity }
  assert.equal(sameExchange(ack, challenge), true)
  assert.equal(sameExchange({ ...ack, challengeId: uuid('6') }, challenge), false)
})

test('derives extension identity and challenge-bound pairing code', async () => {
  assert.deepEqual(deriveExtensionIdentity(`chrome-extension://${'a'.repeat(32)}/index.js`), {
    browser: 'chrome',
    extensionId: 'a'.repeat(32)
  })
  assert.equal(deriveExtensionIdentity('https://example.test'), undefined)
  assert.match(await pairingCode(await signedChallenge()), /^\d{6}$/u)
})
