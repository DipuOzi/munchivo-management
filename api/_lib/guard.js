/**
 * Auth guard for protected API routes.
 * Usage:  const user = await withAuth(req, res); if (!user) return;
 */
import { getSessionUser } from './session.js'
import { sendJson } from './http.js'

export async function withAuth(req, res) {
  try {
    const user = await getSessionUser(req)
    if (!user) {
      sendJson(res, 401, { error: 'Not authenticated.' })
      return null
    }
    return user
  } catch (err) {
    console.error('auth guard error:', err)
    sendJson(res, 500, { error: 'Authentication check failed.' })
    return null
  }
}
