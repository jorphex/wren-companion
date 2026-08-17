import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'

const iconDimensions = new Map([
  ['src/icon.png', 512],
  ['src/icons/icon128.png', 128],
  ['src/icons/icon16.png', 16],
  ['src/icons/icon16good.png', 16],
  ['src/icons/icon16moon.png', 16],
  ['src/icons/icon48.png', 48],
  ['src/icons/icon48good.png', 48],
  ['src/icons/icon48moon.png', 48],
  ['src/icons/icon96.png', 96],
  ['src/icons/icon96good.png', 96],
  ['src/icons/icon96moon.png', 96]
])
const storeImageDimensions = new Map([
  ['store-assets/promo-440x280.png', [440, 280]],
  ['store-assets/screenshots/wren-companion-store-connected-v14.png', [1280, 800]],
  ['store-assets/screenshots/wren-companion-store-pairing-v14.png', [1280, 800]],
  ['store-assets/screenshots/wren-companion-store-review-v14.png', [1280, 800]],
  ['store-assets/source/companion-connected.png', [420, 418]],
  ['store-assets/source/companion-pairing.png', [420, 239]],
  ['store-assets/source/uniswap-home.png', [1280, 800]],
  ['store-assets/source/wren-native-pairing.png', [620, 900]],
  ['store-assets/source/wren-request-review.png', [930, 1350]]
])

const pngDimensions = (data) => {
  assert.deepEqual(
    data.subarray(0, 8),
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    'Brand asset must be a PNG'
  )
  return [data.readUInt32BE(16), data.readUInt32BE(20)]
}

for (const [file, expectedSize] of iconDimensions) {
  const data = await readFile(file)
  assert.deepEqual(pngDimensions(data), [expectedSize, expectedSize], `${file} has the wrong size`)
}

for (const [file, expectedDimensions] of storeImageDimensions) {
  const data = await readFile(file)
  assert.deepEqual(pngDimensions(data), expectedDimensions, `${file} has the wrong size`)
}

assert.deepEqual(
  (await readdir('store-assets/screenshots')).sort(),
  [
    'wren-companion-store-connected-v14.png',
    'wren-companion-store-pairing-v14.png',
    'wren-companion-store-review-v14.png'
  ],
  'Store screenshot inventory contains stale or missing assets'
)

assert.deepEqual(
  (await readdir('store-assets/source')).sort(),
  [
    'companion-connected.png',
    'companion-pairing.png',
    'uniswap-home.png',
    'wren-native-pairing.png',
    'wren-request-review.png'
  ],
  'Store screenshot source inventory contains stale or missing assets'
)

const canonical = await readFile('src/icon.png')
const canonicalHash = createHash('sha256').update(canonical).digest('hex')
assert.equal(
  canonicalHash,
  '982b4f5c3c5767a4750dfc29cb4aedb81ff4761bf73b219ce943cbe139d93c2b',
  'The companion brand source must match Wren desktop’s canonical app icon'
)

const storeIcon = await readFile('src/icons/icon128.png')
assert.equal(
  createHash('sha256').update(storeIcon).digest('hex'),
  '57d7559b1ffdf09b68ea548ab696725db9f735e251c10ba1cf0abdeb73f51c10',
  'The browser-store icon must retain its reviewed 16px safe-area treatment'
)

const master = await readFile('src/brand/wren-mark.svg', 'utf8')
assert.match(master, /id="wren-silhouette"/, 'The brand master must define the shared silhouette')
assert.match(master, /id="wren-color"/, 'The brand master must define the full-color mark')

const manifest = JSON.parse(await readFile('src/manifest.json', 'utf8'))
for (const size of ['16', '48', '96']) {
  assert.equal(manifest.action?.default_icon?.[size], `icons/icon${size}.png`)
  assert.equal(manifest.icons?.[size], `icons/icon${size}.png`)
}
assert.equal(manifest.icons?.['128'], 'icons/icon128.png')

console.log('Coherent Wren Companion icon assets verified')
