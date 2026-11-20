/**
 * POST /api/auth/login
 * Body: { email, password }
 * Sets an HTTP-only session cookie on success.
 */
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { getIp, readJson, sendJson } from '../../_lib/http.js'
import { isRateLimited, recordFailedAttempt, clearAttempts } from '../../_lib/rateLimit.js'
import { createSession, setSessionCookie } from '../../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }

  const ip = getIp(req) || 'unknown'
  const rateKey = `login:${ip}`

  const limit = isRateLimited(rateKey)
  if (limit.limited) {
    return sendJson(res, 429, {
      error: `Too many login attempts. Please try again in ${Math.ceil(limit.retryAfterSec / 60)} minute(s).`,
    })
  }

  let body
  try {
    body = await readJson(req)
  } catch {
    return sendJson(res, 400, { error: 'Invalid request body.' })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''

  if (!email || !password) {
    return sendJson(res, 400, { error: 'Email and password are required.' })
  }

  try {
    const rows = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1)

    const user = rows[0]

    // Always run a bcrypt compare to keep timing consistent, even for
    // unknown emails (compare against a fixed dummy hash).
    const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO7ZBpQ0F5BnC1E0FTnhuFQkZDxRPGmXe'
    const passwordOk = await bcrypt.compare(
      password,
      user?.passwordHash || DUMMY_HASH,
    )

    if (!user || !user.isActive || !passwordOk) {
      recordFailedAttempt(rateKey)
      return sendJson(res, 401, { error: 'Invalid email or password.' })
    }

    clearAttempts(rateKey)
    const token = await createSession(user.id, req)
    setSessionCookie(res, token, req)

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'auth.login',
      entity: 'user',
      entityId: user.id,
      details: { ip },
    })

    return sendJson(res, 200, {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    })
  } catch (err) {
    console.error('login error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
