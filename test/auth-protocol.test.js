const assert = require('node:assert/strict')
const test = require('node:test')

const {
  authPayload,
  deriveExtensionIdentity,
  pairingCode,
  parseServerAuthMessage,
  validateChallenge
} = require('../src/auth-protocol')

const challenge = {
  type: 'frame-auth',
  version: 2,
  step: 'challenge',
  challengeId: '18e73d72-3643-4cf6-846f-83854160f9f2',
  clientNonce: Buffer.alloc(32, 1).toString('base64url'),
  serverNonce: Buffer.alloc(32, 2).toString('base64url'),
  browser: 'chrome',
  extensionId: 'a'.repeat(32),
  installationId: '7a86842f-7c01-4d0d-b0f7-fc04e0acfd8f',
  fingerprint: Buffer.alloc(32, 3).toString('base64url'),
  expiresAt: 61_000
}

test('parses only strict bounded server authentication messages', () => {
  assert.deepEqual(parseServerAuthMessage(JSON.stringify(challenge)), {
    success: true,
    value: challenge
  })
  assert.equal(parseServerAuthMessage(JSON.stringify({ ...challenge, extra: true })).success, false)
  assert.deepEqual(parseServerAuthMessage(JSON.stringify({ ...challenge, version: 1 })), {
    success: false,
    code: 'unsupported-version'
  })
  assert.equal(parseServerAuthMessage('{').success, false)
  assert.equal(parseServerAuthMessage('x'.repeat(9 * 1024)).success, false)
  assert.equal(
    parseServerAuthMessage(
      JSON.stringify({
        type: 'frame-auth',
        version: 2,
        step: 'authenticated',
        fingerprint: challenge.fingerprint
      })
    ).success,
    true
  )
})

test('derives only desktop-recognized extension identities', () => {
  assert.deepEqual(deriveExtensionIdentity(`chrome-extension://${'a'.repeat(32)}/index.js`), {
    browser: 'chrome',
    extensionId: 'a'.repeat(32)
  })
  assert.deepEqual(
    deriveExtensionIdentity('moz-extension://18e73d72-3643-4cf6-846f-83854160f9f2/'),
    {
      browser: 'firefox',
      extensionId: '18e73d72-3643-4cf6-846f-83854160f9f2'
    }
  )
  for (const url of [
    'https://example.test',
    `chrome-extension://${'z'.repeat(32)}`,
    'moz-extension://not-a-uuid/'
  ]) {
    assert.equal(deriveExtensionIdentity(url), undefined)
  }
})

test('matches the desktop transcript and challenge-bound pairing code', async () => {
  assert.equal(new TextDecoder().decode(authPayload(challenge)).split('\n').length, 9)
  assert.equal(await pairingCode(challenge), '269231')
  assert.equal(
    validateChallenge(
      challenge,
      {
        browser: challenge.browser,
        extensionId: challenge.extensionId,
        installationId: challenge.installationId,
        clientNonce: challenge.clientNonce,
        fingerprint: challenge.fingerprint
      },
      1000
    ),
    true
  )
  assert.equal(
    validateChallenge(challenge, { ...challenge, fingerprint: 'a'.repeat(43) }, 1000),
    false
  )
  assert.equal(validateChallenge(challenge, challenge, challenge.expiresAt), false)
})
