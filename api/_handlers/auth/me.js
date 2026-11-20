/**
 * GET /api/auth/me
 * Returns the authenticated user, or 401 when unauthenticated.
 * Used by the frontend on load to restore the session from the cookie.
 */
import { sendJson } from '../../_lib/http.js'
import { getSessionUser } from '../../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }

  try {
    const user = await getSessionUser(req)
    if (!user) {
      return sendJson(res, 401, { error: 'Not authenticated.' })
    }
    return sendJson(res, 200, { user })
  } catch (err) {
    console.error('me error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
