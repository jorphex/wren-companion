const assert = require('node:assert/strict')
const test = require('node:test')

const {
  canPerformAuthenticationAction,
  parseAuthenticationAction,
  shouldPauseAuthentication
} = require('../src/authentication-actions')

test('accepts only explicit bounded authentication recovery actions', () => {
  assert.equal(parseAuthenticationAction({ type: 'reconnectAuthentication' }), 'reconnect')
  assert.equal(
    parseAuthenticationAction({ type: 'rotateCredential', confirmation: 'reset-pairing' }),
    'reset-pairing'
  )
  for (const value of [
    undefined,
    null,
    [],
    { type: 'reconnectAuthentication', extra: true },
    { type: 'rotateCredential' },
    { type: 'rotateCredential', confirmation: 'yes' },
    { type: 'rotateCredential', confirmation: 'reset-pairing', extra: true }
  ]) {
    assert.equal(parseAuthenticationAction(value), undefined)
  }
})

test('pauses only terminal authentication states until explicit recovery', () => {
  assert.equal(shouldPauseAuthentication({ status: 'upgrade-required' }), true)
  assert.equal(
    shouldPauseAuthentication({ status: 'error', code: 'pinned-desktop-mismatch' }),
    true
  )
  assert.equal(shouldPauseAuthentication({ status: 'error', code: 'denied' }), false)
  assert.equal(shouldPauseAuthentication({ status: 'authenticated' }), false)
})

test('permits reconnect and confirmed reset only from their intended states', () => {
  assert.equal(canPerformAuthenticationAction('reconnect', { status: 'upgrade-required' }), true)
  assert.equal(canPerformAuthenticationAction('reconnect', { status: 'error' }), false)
  assert.equal(canPerformAuthenticationAction('reset-pairing', { status: 'authenticated' }), true)
  assert.equal(
    canPerformAuthenticationAction('reset-pairing', {
      status: 'error',
      code: 'pinned-desktop-mismatch'
    }),
    true
  )
  assert.equal(
    canPerformAuthenticationAction('reset-pairing', { status: 'error', code: 'denied' }),
    false
  )
})
