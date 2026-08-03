const assert = require('node:assert/strict')
const { once } = require('node:events')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')
const test = require('node:test')

async function getAvailablePort() {
  const server = net.createServer()
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : undefined
  server.close()
  await once(server, 'close')
  if (!port) throw new Error('Could not reserve a qualification server port')
  return port
}

async function startQualificationServer(port) {
  const script = path.join(__dirname, '..', 'scripts', 'serve-qualification.mjs')
  const child = spawn(process.execPath, [script, String(port)], {
    stdio: ['ignore', 'pipe', 'pipe']
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`Qualification server startup timed out: ${stderr}`)),
      5000
    )
    child.stdout.on('data', (chunk) => {
      if (chunk.toString().includes(`http://127.0.0.1:${port}/`)) {
        clearTimeout(timeout)
        resolve()
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error(`Server exited ${code}: ${stderr}`))
    })
  })

  return child
}

test('qualification server exposes every page dependency and rejects unknown assets', async () => {
  const port = await getAvailablePort()
  const child = await startQualificationServer(port)

  try {
    const testnets = await fetch(`http://127.0.0.1:${port}/testnets.js`)
    assert.equal(testnets.status, 200)
    assert.match(testnets.headers.get('content-type'), /^text\/javascript/u)
    assert.match(await testnets.text(), /0x14a34/u)

    const unknown = await fetch(`http://127.0.0.1:${port}/unknown.js`)
    assert.equal(unknown.status, 404)

    const query = await fetch(`http://127.0.0.1:${port}/app.js?cache=bypass`)
    assert.equal(query.status, 404)
  } finally {
    child.kill('SIGTERM')
    if (child.exitCode === null) await once(child, 'exit')
  }
})
