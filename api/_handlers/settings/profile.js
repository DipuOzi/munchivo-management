/**
 * PATCH /api/settings/profile — update the signed-in user's name/email.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const body = await readJson(req)
    const updates = { updatedAt: new Date() }

    if (body.name !== undefined) {
      const name = (body.name || '').trim()
      if (!name) return sendJson(res, 400, { error: 'Name cannot be empty.' })
      if (name.length > 120) {
        return sendJson(res, 400, { error: 'Name is too long.' })
      }
      updates.name = name
    }

    if (body.email !== undefined) {
      const email = (body.email || '').trim().toLowerCase()
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return sendJson(res, 400, { error: 'Enter a valid email address.' })
      }
      const [clash] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1)
      if (clash && clash.id !== user.id) {
        return sendJson(res, 409, {
          error: 'Another account already uses this email.',
        })
      }
      updates.email = email
    }

    if (Object.keys(updates).length === 1) {
      return sendJson(res, 400, { error: 'Nothing to update.' })
    }

    const [updated] = await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, user.id))
      .returning({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        role: schema.users.role,
      })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'settings.profile.update',
      entity: 'user',
      entityId: user.id,
    })

    return sendJson(res, 200, { profile: updated })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, {
        error: 'Another account already uses this email.',
      })
    }
    console.error('profile update error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
