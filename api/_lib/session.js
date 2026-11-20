/**
 * Session helpers — HTTP-only secure cookie sessions stored in Postgres.
 * Only a SHA-256 hash of the token is persisted, so a database leak
 * cannot be used to hijack sessions.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { and, eq, gt, lt } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'

export const SESSION_COOKIE = 'mv_session'
const SESSION_TTL_SEC = 60 * 60 * 24 * 7 // 7 days

export function isSecureRequest(req) {
  // Vercel sets x-forwarded-proto; local dev server is plain http.
  return (
    req.headers['x-forwarded-proto'] === 'https' ||
    req.connection?.encrypted === true
  )
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

export function safeEqual(a, b) {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function parseCookies(req) {
  const header = req.headers.cookie
  const cookies = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(
      part.slice(idx + 1).trim(),
    )
  }
  return cookies
}

export function setSessionCookie(res, token, req) {
  const secure = isSecureRequest(req)
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SEC}`,
    ...(secure ? ['Secure'] : []),
  ]
  const value = parts.join('; ')
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', value)
  } else if (typeof res.headers === 'object' && res.headers) {
    const existing = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : res.headers['set-cookie']
        ? [res.headers['set-cookie']]
        : []
    res.headers['set-cookie'] = [...existing, value]
  }
}

export function clearSessionCookie(res, req) {
  const secure = isSecureRequest(req)
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    ...(secure ? ['Secure'] : []),
  ]
  const value = parts.join('; ')
  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', value)
  } else if (typeof res.headers === 'object' && res.headers) {
    const existing = Array.isArray(res.headers['set-cookie'])
      ? res.headers['set-cookie']
      : res.headers['set-cookie']
        ? [res.headers['set-cookie']]
        : []
    res.headers['set-cookie'] = [...existing, value]
  }
}

/**
 * Creates a session row and returns the raw token for the cookie.
 */
export async function createSession(userId, req) {
  const token = randomBytes(48).toString('base64url')
  const expiresAt = new Date(Date.now() + SESSION_TTL_SEC * 1000)

  await db.insert(schema.sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    ipAddress: req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || null,
    userAgent: req.headers['user-agent'] || null,
  })

  // Opportunistic cleanup of this user's expired sessions.
  await db
    .delete(schema.sessions)
    .where(
      and(eq(schema.sessions.userId, userId), lt(schema.sessions.expiresAt, new Date())),
    )

  return token
}

/**
 * Returns the authenticated user for this request, or null.
 */
export async function getSessionUser(req) {
  const cookies = parseCookies(req)
  const token = cookies[SESSION_COOKIE]
  if (!token) return null

  const rows = await db
    .select({
      userId: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      role: schema.users.role,
      isActive: schema.users.isActive,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.sessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.sessions.tokenHash, hashToken(token)),
        gt(schema.sessions.expiresAt, new Date()),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row || !row.isActive) return null

  return {
    id: row.userId,
    name: row.name,
    email: row.email,
    role: row.role,
  }
}

export async function destroySession(req) {
  const cookies = parseCookies(req)
  const token = cookies[SESSION_COOKIE]
  if (!token) return
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hashToken(token)))
}
