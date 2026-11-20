/**
 * POST /api/settings/password — change the signed-in user's password.
 *
 * On success every existing session for this user is revoked and a new
 * session cookie is issued, so other devices must sign in again.
 */
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { createSession, setSessionCookie } from '../_lib/session.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const body = await readJson(req)
    const currentPassword =
      typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword =
      typeof body.newPassword === 'string' ? body.newPassword : ''

    if (!currentPassword || !newPassword) {
      return sendJson(res, 400, {
        error: 'Current and new password are required.',
      })
    }
    if (newPassword.length < 8) {
      return sendJson(res, 400, {
        error: 'New password must be at least 8 characters.',
      })
    }
    if (newPassword.length > 200) {
      return sendJson(res, 400, { error: 'New password is too long.' })
    }
    if (currentPassword === newPassword) {
      return sendJson(res, 400, {
        error: 'New password must be different from the current password.',
      })
    }

    const [row] = await db
      .select({ passwordHash: schema.users.passwordHash })
      .from(schema.users)
      .where(eq(schema.users.id, user.id))
      .limit(1)
    if (!row) return sendJson(res, 404, { error: 'Account not found.' })

    const ok = await bcrypt.compare(currentPassword, row.passwordHash)
    if (!ok) {
      return sendJson(res, 400, { error: 'Current password is incorrect.' })
    }

    const passwordHash = await bcrypt.hash(newPassword, 12)
    await db
      .update(schema.users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(schema.users.id, user.id))

    // Revoke every session, then issue a fresh one for this browser.
    await db.delete(schema.sessions).where(eq(schema.sessions.userId, user.id))
    const token = await createSession(user.id, req)
    setSessionCookie(res, token, req)

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'settings.password.change',
      entity: 'user',
      entityId: user.id,
    })

    return sendJson(res, 200, {
      ok: true,
      message: 'Password updated. Other devices have been signed out.',
    })
  } catch (err) {
    console.error('password change error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
