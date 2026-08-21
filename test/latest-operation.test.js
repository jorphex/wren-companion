const assert = require('node:assert/strict')
const test = require('node:test')

const { LatestOperation } = require('../src/latest-operation')

const deferred = () => {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, reject, resolve }
}

test('shares one active operation within a connection generation', async () => {
  const operations = new LatestOperation()
  const pending = deferred()
  let starts = 0
  const results = []

  const first = operations.run(
    () => {
      starts += 1
      return pending.promise
    },
    (value) => results.push(value),
    () => assert.fail('operation should not fail')
  )
  const second = operations.run(
    () => {
      starts += 1
      return 'unexpected'
    },
    (value) => results.push(value),
    () => assert.fail('operation should not fail')
  )

  assert.equal(first, second)
  assert.equal(operations.isActive(), true)
  pending.resolve('catalog')
  await first
  assert.equal(starts, 1)
  assert.deepEqual(results, ['catalog'])
  assert.equal(operations.isActive(), false)
})

test('ignores an obsolete completion after reconnect without clearing the new request', async () => {
  const operations = new LatestOperation()
  const oldRequest = deferred()
  const currentRequest = deferred()
  const results = []

  const oldOperation = operations.run(
    () => oldRequest.promise,
    (value) => results.push(`old:${value}`),
    (error) => results.push(`old-error:${error.message}`)
  )
  operations.invalidate()
  const currentOperation = operations.run(
    () => currentRequest.promise,
    (value) => results.push(`current:${value}`),
    (error) => results.push(`current-error:${error.message}`)
  )

  oldRequest.reject(new Error('closed socket'))
  await oldOperation
  assert.equal(operations.isActive(), true)
  assert.deepEqual(results, [])

  currentRequest.resolve('catalog')
  await currentOperation
  assert.deepEqual(results, ['current:catalog'])
  assert.equal(operations.isActive(), false)
})
