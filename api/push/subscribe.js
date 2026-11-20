/**
 * POST   /api/push/subscribe — save (or reactivate) this browser's subscription
 * DELETE /api/push/subscribe — unsubscribe this browser
 *
 * Body (POST): { endpoint, keys: { p256dh, auth } }
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'

export default async function handler(req, res) {
  if (!['POST', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'DELETE') {
      const body = await readJson(req)
      if (body?.endpoint) {
        await db
          .delete(schema.pushSubscriptions)
          .where(eq(schema.pushSubscriptions.endpoint, body.endpoint))
      }
      return sendJson(res, 200, { ok: true })
    }

    const body = await readJson(req)
    const { endpoint, keys } = body || {}
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return sendJson(res, 400, { error: 'Invalid subscription payload.' })
    }

    await db
      .insert(schema.pushSubscriptions)
      .values({
        userId: user.id,
        endpoint,
        p256dhKey: keys.p256dh,
        authKey: keys.auth,
        userAgent: req.headers['user-agent'] || null,
        isActive: true,
        failureCount: 0,
      })
      .onConflictDoUpdate({
        target: schema.pushSubscriptions.endpoint,
        set: {
          userId: user.id,
          p256dhKey: keys.p256dh,
          authKey: keys.auth,
          isActive: true,
          failureCount: 0,
        },
      })

    return sendJson(res, 201, { ok: true })
  } catch (err) {
    console.error('push subscribe error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
