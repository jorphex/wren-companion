import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'qualification')
const requestedPort = Number(process.argv[2] || 8765)
if (!Number.isSafeInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) {
  throw new Error('Qualification port must be an integer from 1024 through 65535')
}

const files = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/testnets.js', ['testnets.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']]
])

const server = createServer(async (request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1')
  const entry = request.method === 'GET' ? files.get(url.pathname) : undefined
  if (!entry || url.search) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    response.end('Not found\n')
    return
  }

  const [filename, contentType] = entry
  const file = path.join(root, filename)
  const metadata = await stat(file)
  response.writeHead(200, {
    'Cache-Control': 'no-store',
    'Content-Length': metadata.size,
    'Content-Security-Policy':
      "default-src 'none'; script-src 'self' chrome-extension: moz-extension:; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    'Content-Type': contentType,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  })
  createReadStream(file).pipe(response)
})

server.listen(requestedPort, '127.0.0.1', () => {
  console.log(`Wren qualification page: http://127.0.0.1:${requestedPort}/`)
  console.log('Press Ctrl+C to stop.')
})
