function installLegacyProvider(target, provider) {
  if ('ethereum' in target) {
    const existing = target.ethereum
    if (existing === provider) return true
    if (
      !existing ||
      (typeof existing !== 'object' && typeof existing !== 'function') ||
      !provider
    ) {
      return false
    }

    try {
      const providers = Array.isArray(existing.providers) ? existing.providers : [existing]
      if (!providers.includes(provider)) {
        const nextProviders = [...providers, provider]
        Object.defineProperty(existing, 'providers', {
          value: nextProviders,
          writable: true,
          configurable: true,
          enumerable: true
        })
      }
      return true
    } catch {
      // Some wallets expose a sealed provider. EIP-6963 remains available in
      // that case, and the incumbent legacy provider must not be overwritten.
      return false
    }
  }

  Object.defineProperty(target, 'ethereum', {
    value: provider,
    writable: true,
    configurable: true,
    enumerable: true
  })
  return true
}

module.exports = { installLegacyProvider }
