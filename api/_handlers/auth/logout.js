/**
 * POST /api/auth/logout
 * Destroys the current session and clears the cookie.
 */
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { clearSessionCookie, destroySession, getSessionUser } from '../../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }

  try {
    const user = await getSessionUser(req)
    await destroySession(req)
    if (user) {
      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'auth.logout',
        entity: 'user',
        entityId: user.id,
      })
    }
  } catch (err) {
    console.error('logout error:', err)
  }

  clearSessionCookie(res, req)
  return sendJson(res, 200, { ok: true })
}
