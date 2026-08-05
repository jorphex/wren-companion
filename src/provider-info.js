const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const WREN_ICON =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiIgdmlld0JveD0iMCAwIDk2IDk2Ij48cmVjdIHdpZHRoPSI5NiIgaGVpZ2h0PSI5NiIgcng9IjIwIiBmaWxsPSIjMTExNTEzIi8+PHBhdGggZmlsbD0iI0E2OEE2MSIgZD0iTTE2IDU1YzEyLTIxIDMxLTI3IDQ3LTEyTDgxIDI0bC03IDIxIDE0LTEwLTE2IDIzQzYwIDc2IDM1IDc3IDE2IDU1WiIvPjxwYXRoIGZpbGw9IiNCNzlBNzAiIGQ9Im02MyA0MyAxOC0xOS03IDIxIDE0LTEwLTE2IDIzWiIvPjwvc3ZnPg=='

function randomUuid(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID()
  if (typeof cryptoApi?.getRandomValues !== 'function')
    throw new Error('Secure randomness unavailable')

  const bytes = cryptoApi.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, '$1-$2-$3-$4-$5')
}

function createProviderInfo(uuidFactory = randomUuid) {
  const uuid = uuidFactory()
  if (!UUID_V4.test(uuid)) throw new Error('Unable to create Wren provider UUID')
  return Object.freeze({ uuid, name: 'Wren', icon: WREN_ICON, rdns: 'io.github.jorphex.wren' })
}

module.exports = { createProviderInfo, randomUuid }
