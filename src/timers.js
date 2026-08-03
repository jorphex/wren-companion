const createTimerFunctions = (host) => ({
  setTimer: (callback, delay) => host.setTimeout(callback, delay),
  clearTimer: (timer) => host.clearTimeout(timer)
})

const { clearTimer, setTimer } = createTimerFunctions(globalThis)

module.exports = { clearTimer, createTimerFunctions, setTimer }
