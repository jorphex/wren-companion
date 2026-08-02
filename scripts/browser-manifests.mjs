export function createFirefoxManifest(manifest) {
  const serviceWorker = manifest.background?.service_worker
  if (typeof serviceWorker !== 'string' || manifest.background?.scripts) {
    throw new Error('Chrome manifest has an incompatible background declaration')
  }

  return {
    ...manifest,
    background: { scripts: [serviceWorker] }
  }
}
