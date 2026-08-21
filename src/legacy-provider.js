const providerObject = (value) =>
  value && (typeof value === 'object' || typeof value === 'function')

const uniqueProviders = (primary, candidates) => [
  primary,
  ...candidates.filter((candidate) => candidate !== primary)
]

const installPrimary = (target, provider) => {
  const descriptor = Object.getOwnPropertyDescriptor(target, 'ethereum')
  if (descriptor && !descriptor.configurable) {
    if (!Object.hasOwn(descriptor, 'value') || !descriptor.writable) return false
    Object.defineProperty(target, 'ethereum', { value: provider })
    return true
  }
  Object.defineProperty(target, 'ethereum', {
    value: provider,
    writable: true,
    configurable: true,
    enumerable: true
  })
  return true
}

function installLegacyProvider(target, provider) {
  if (!providerObject(target) || !providerObject(provider)) return false

  try {
    const existing = target.ethereum
    if (existing === provider) return true
    if (existing !== undefined && !providerObject(existing)) return false

    const candidates = existing
      ? Array.isArray(existing.providers)
        ? existing.providers
        : [existing]
      : []
    const providers = uniqueProviders(provider, candidates)

    // Make Wren the deterministic legacy provider.  EIP-6963 selection is
    // not enough for explorers that later fall back to window.ethereum.
    Object.defineProperty(provider, 'providers', {
      value: providers,
      writable: true,
      configurable: true,
      enumerable: true
    })
    return installPrimary(target, provider)
  } catch {
    // A non-writable legacy global cannot be safely made secondary.
    return false
  }
}

module.exports = { installLegacyProvider }
