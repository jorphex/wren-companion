function toRpcChainId(value) {
  if (!Number.isSafeInteger(value) || value <= 0) return
  return `0x${value.toString(16)}`
}

module.exports = { toRpcChainId }
