const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const root = path.join(__dirname, '..')
const globalStyle = fs.readFileSync(path.join(root, 'src', 'style', 'index.css'), 'utf8')
const backgroundSource = fs.readFileSync(path.join(root, 'src', 'index.js'), 'utf8')
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

test('network and injection choices expose selection without toggle semantics', () => {
  assert.match(settingsSource, /role="radiogroup" aria-label="Networks"/u)
  assert.match(settingsSource, /role="radiogroup" aria-label="Wallet identity"/u)
  assert.match(settingsSource, /role="radio"/u)
  assert.match(settingsSource, /aria-checked=/u)
  assert.doesNotMatch(settingsSource, /aria-pressed=/u)
})

test('injection identity changes require an explicit reload acknowledgement', () => {
  assert.match(settingsSource, /Switch injection identity\?/u)
  assert.match(settingsSource, /unsaved work in the tab may be lost/u)
  assert.match(settingsSource, /Keep current identity/u)
  assert.match(settingsSource, /Switch to \{targetIdentity\}/u)
  assert.match(settingsSource, /this\.armIdentitySwitch/u)
})

test('network switch feedback is driven by the background result rather than a timeout guess', () => {
  assert.match(settingsSource, /chainSwitchResult/u)
  assert.match(settingsSource, /result\.declined \? 'rejected' : 'failed'/u)
  assert.doesNotMatch(settingsSource, /setTimeout\([^)]*chainSwitch/su)
  assert.match(backgroundSource, /type: 'chainSwitchResult'/u)
  assert.match(backgroundSource, /switchError\?\.code === 4001/u)
})
