const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const globalStyle = fs.readFileSync(path.join(root, 'src', 'style', 'index.css'), 'utf8')
const settingsSource = fs.readFileSync(path.join(root, 'src', 'settings', 'index.js'), 'utf8')

test('popup bootstrap sizing does not depend on its provisional viewport', () => {
  const bodyStyle = globalStyle
    .match(/(?:^|\n)body \{[\s\S]*?\n\}/gu)
    ?.find((block) => block.includes('width:'))
  const settingsScroll = settingsSource.match(
    /const SettingsScroll = styled\.main`([\s\S]*?)`/u
  )?.[1]

  assert.ok(bodyStyle, 'body style block is present')
  assert.match(bodyStyle, /width:\s*420px;/u)
  assert.doesNotMatch(bodyStyle, /\b(?:vw|vh)\b/u)

  assert.ok(settingsScroll, 'SettingsScroll style block is present')
  assert.match(settingsScroll, /max-height:\s*600px;/u)
  assert.doesNotMatch(settingsScroll, /\b(?:vw|vh)\b/u)
})
