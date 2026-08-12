const assert = require('node:assert/strict')
const test = require('node:test')

const { AUTH_VERSION } = require('../src/auth-protocol')

test('browser qualification is locked to the production protocol 3 contract', async () => {
  const { QUALIFICATION_AUTH_VERSION } = await import('../scripts/qualification/mock-desktop.mjs')

  assert.equal(AUTH_VERSION, 3)
  assert.equal(QUALIFICATION_AUTH_VERSION, AUTH_VERSION)
})
