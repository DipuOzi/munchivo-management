/**
 * POST /api/push/test — sends a test push to all of THIS user's devices.
 */
import { and, eq } from 'drizzle-orm'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const webpush = require('web-push')
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'



const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:hello@munchivo.com'

let vapidConfigured = false
function ensureVapid() {
  if (vapidConfigured) return true
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return false
  const publicKey = process.env.VAPID_PUBLIC_KEY.replace(/^"|"$/g, '')
  const privateKey = process.env.VAPID_PRIVATE_KEY.replace(/^"|"$/g, '')
  webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey)
  vapidConfigured = true
  return true
}

/**
 * Fire-and-forget push to every active subscription across the whole
 * business. Failures deactivate the subscription after 3 consecutive
 * errors (expired browsers etc).
 *
 * This is intentionally NOT used by the stock engine. Stock changes
 * emit notifications through the notification layer instead, so this
 * module's heavy VAPID setup never becomes a blocker for every API request.
 */
export async function sendPushToAll(payload) {
  if (!ensureVapid()) return
  const subs = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.isActive, true))

  const jobs = subs.map((sub) =>
    (async () => {
      try {
        const payloadObj =
          typeof payload === 'string' ? JSON.parse(payload) : payload
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
          },
          JSON.stringify(payloadObj),
        )
        await db
          .update(schema.pushSubscriptions)
          .set({ failureCount: 0, lastSuccessAt: new Date() })
          .where(eq(schema.pushSubscriptions.id, sub.id))
      } catch (err) {
        const failures = sub.failureCount + 1
        await db
          .update(schema.pushSubscriptions)
          .set({
            failureCount: failures,
            isActive: failures < 3 && err.statusCode !== 404 && err.statusCode !== 410,
          })
          .where(eq(schema.pushSubscriptions.id, sub.id))
      }
    })(),
  )
  await Promise.allSettled(jobs)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  if (!ensureVapid()) {
    return sendJson(res, 503, { error: 'Push is not configured (missing VAPID keys).' })
  }

  try {
    const body = await readJson(req).catch(() => ({}))
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.userId, user.id), eq(schema.pushSubscriptions.isActive, true)))

    const payload = JSON.stringify({
      title: body.title || 'Munchivo test notification',
      body: body.body || `Hello ${user.name} — browser push is working!`,
      url: '/notifications',
    })

    const jobs = subs.map((sub) =>
      (async () => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dhKey, auth: sub.authKey },
            },
            payload,
          )
          await db
            .update(schema.pushSubscriptions)
            .set({ failureCount: 0, lastSuccessAt: new Date() })
            .where(eq(schema.pushSubscriptions.id, sub.id))
        } catch {
          // Best effort only.
        }
      })(),
    )
    const results = await Promise.allSettled(jobs)
    const sent = results.filter((r) => r.status === 'fulfilled').length
    return sendJson(res, 200, { sent, devices: subs.length })
  } catch (err) {
    console.error('push test error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
