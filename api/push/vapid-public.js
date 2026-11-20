/**
 * GET /api/push/vapid-public — the public VAPID key for subscribing.
 */
import { sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const publicKey = process.env.VAPID_PUBLIC_KEY
  if (!publicKey) {
    return sendJson(res, 503, { error: 'Push notifications are not configured on this server.' })
  }
  return sendJson(res, 200, { publicKey })
}
