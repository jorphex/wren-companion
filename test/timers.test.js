const assert = require('node:assert/strict')
const test = require('node:test')

const { createTimerFunctions } = require('../src/timers')

test('invokes browser timers with their global receiver', () => {
  const callback = () => {}
  const timer = { id: 1 }
  const calls = []
  const host = {
    setTimeout(receivedCallback, delay) {
      assert.equal(this, host)
      calls.push(['set', receivedCallback, delay])
      return timer
    },
    clearTimeout(receivedTimer) {
      assert.equal(this, host)
      calls.push(['clear', receivedTimer])
    }
  }
  const { clearTimer, setTimer } = createTimerFunctions(host)

  assert.equal(setTimer(callback, 250), timer)
  clearTimer(timer)
  assert.deepEqual(calls, [
    ['set', callback, 250],
    ['clear', timer]
  ])
})
