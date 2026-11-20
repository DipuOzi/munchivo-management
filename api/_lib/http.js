/**
 * Shared helpers for Vercel-style serverless handlers.
 * Each handler is `export default async function handler(req, res)`,
 * which is exactly what Vercel's Node.js runtime expects.
 */

export function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  res.end(JSON.stringify(data))
}

export async function readJson(req) {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  try {
    return JSON.parse(raw)
  } catch {
    const err = new Error('Invalid JSON body')
    err.statusCode = 400
    throw err
  }
}

export function getIp(req) {
  const fwd = req.headers['x-forwarded-for']
  if (typeof fwd === 'string' && fwd.length > 0) {
    return fwd.split(',')[0].trim()
  }
  return req.headers['x-real-ip'] || req.socket?.remoteAddress || null
}
