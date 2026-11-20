/**
 * GET   /api/notifications        — list (unread first, newest first)
 * POST  /api/notifications        — { action: 'read' | 'read-all', id? }
 */
import { and, desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { readJson, sendJson } from './_lib/http.js'
import { withAuth } from './_lib/guard.js'

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const rows = await db
        .select({
          id: schema.notifications.id,
          type: schema.notifications.type,
          severity: schema.notifications.severity,
          title: schema.notifications.title,
          body: schema.notifications.body,
          entityType: schema.notifications.entityType,
          entityId: schema.notifications.entityId,
          resolved: schema.notifications.resolved,
          createdAt: schema.notifications.createdAt,
          readAt: schema.notificationReads.readAt,
        })
        .from(schema.notifications)
        .leftJoin(
          schema.notificationReads,
          and(
            eq(schema.notificationReads.notificationId, schema.notifications.id),
            eq(schema.notificationReads.userId, user.id),
          ),
        )
        .orderBy(desc(schema.notifications.createdAt))
        .limit(100)

      const unreadCount = rows.filter((r) => !r.readAt).length
      return sendJson(res, 200, { notifications: rows, unreadCount })
    }

    // POST — mark read
    const body = await readJson(req)
    if (body.action === 'read-all') {
      const unread = await db
        .select({ id: schema.notifications.id })
        .from(schema.notifications)
        .where(sql`NOT EXISTS (
          SELECT 1 FROM notification_reads nr
          WHERE nr.notification_id = ${schema.notifications.id} AND nr.user_id = ${user.id}
        )`)
        .limit(200)
      for (const n of unread) {
        await db
          .insert(schema.notificationReads)
          .values({ notificationId: n.id, userId: user.id })
          .onConflictDoNothing()
      }
      return sendJson(res, 200, { ok: true, marked: unread.length })
    }

    if (body.action === 'read' && body.id) {
      await db
        .insert(schema.notificationReads)
        .values({ notificationId: body.id, userId: user.id })
        .onConflictDoNothing()
      return sendJson(res, 200, { ok: true })
    }

    return sendJson(res, 400, { error: 'Invalid action.' })
  } catch (err) {
    console.error('notifications error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
