const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '..', 'qualification', 'testnets.js'), 'utf8')
const context = {}
vm.runInNewContext(source, context)
const { all: qualificationTestnets, get: qualificationTestnet } = context.FrameQualificationTestnets

test('qualification transaction allowlist contains only approved testnets', () => {
  assert.deepEqual(Object.keys(qualificationTestnets), ['0xaa36a7', '0x14a34'])
  assert.equal(qualificationTestnet('0xAA36A7').name, 'Ethereum Sepolia')
  assert.equal(qualificationTestnet('0x14A34').name, 'Base Sepolia')
})

test('qualification transaction allowlist rejects mainnets and malformed chain IDs', () => {
  assert.equal(qualificationTestnet('0x1'), undefined)
  assert.equal(qualificationTestnet('0x2105'), undefined)
  assert.equal(qualificationTestnet(undefined), undefined)
})
