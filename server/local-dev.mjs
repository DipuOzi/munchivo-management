/**
 * LOCAL DEVELOPMENT API SERVER
 *
 * In production on Vercel, api/index.js is the single serverless function
 * and vercel.json rewrites every /api request to it. Locally, Vite cannot
 * run that function, so this tiny Node server mounts the exact same router
 * on the exact same origin — no extra framework, dev-only.
 *
 * The Vite dev server proxies /api/* to http://localhost:3001.
 * Supports Vercel-style dynamic params: /api/ingredients/:id.
 */
import { createServer } from 'node:http'
import { config } from 'dotenv'

// Load env BEFORE importing any module that touches the database.
// (Static ESM imports are hoisted, so we must import dynamically.)
config({ path: '.env.local' })
config({ path: '.env' })

if (!process.env.DATABASE_URL) {
  console.error(
    '✗ DATABASE_URL is not set. Create .env.local in the project root first.',
  )
  process.exit(1)
}

const { dispatch } = await import('../api/_lib/router.js')

const PORT = process.env.API_DEV_PORT || 3001

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  try {
    await dispatch(req, res)
  } catch (err) {
    console.error(`[api] ${url.pathname} failed:`, err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal server error.' }))
    } else if (!res.writableEnded) {
      res.end()
    }
  }
})

server.listen(PORT, () => {
  console.log(`[api] Local API server running at http://localhost:${PORT}`)
})
