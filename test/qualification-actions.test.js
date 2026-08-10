const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '..', 'qualification', 'app.js'), 'utf8')

test('qualification approval actions lock while Wren owns an in-flight request', () => {
  assert.match(
    source,
    /const approvalActions = new Set\(\['connect', 'personal', 'typed', 'transaction'\]\)/u
  )
  assert.match(source, /if \(pendingAction\) return/u)
  assert.match(source, /elements\.confirmation\.disabled = locked/u)
  assert.match(source, /Waiting for approval…/u)
  assert.match(source, /Finish this request in Wren before trying again\./u)
})
