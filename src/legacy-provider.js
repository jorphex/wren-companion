function installLegacyProvider(target, provider) {
  if ('ethereum' in target) return false

  Object.defineProperty(target, 'ethereum', {
    value: provider,
    writable: true,
    configurable: true,
    enumerable: true
  })
  return true
}

module.exports = { installLegacyProvider }
