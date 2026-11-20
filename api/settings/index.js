/**
 * GET /api/settings — profile, business preferences and team accounts.
 */
import { asc } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { getBusinessSettings } from '../_lib/settings.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const [business, team] = await Promise.all([
      getBusinessSettings(),
      db
        .select({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,
          role: schema.users.role,
          isActive: schema.users.isActive,
          createdAt: schema.users.createdAt,
        })
        .from(schema.users)
        .orderBy(asc(schema.users.name)),
    ])

    return sendJson(res, 200, {
      profile: user,
      business,
      team,
    })
  } catch (err) {
    console.error('settings error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
