/**
 * PATCH  /api/partners/:id — edit a partner or reactivate/deactivate
 * DELETE /api/partners/:id — deactivate (ledger history is preserved)
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'

export default async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Partner id is required.' })

  try {
    const [existing] = await db
      .select()
      .from(schema.partners)
      .where(eq(schema.partners.id, id))
      .limit(1)
    if (!existing) return sendJson(res, 404, { error: 'Partner not found.' })

    if (req.method === 'DELETE') {
      await db
        .update(schema.partners)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.partners.id, id))

      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'partner.deactivate',
        entity: 'partner',
        entityId: id,
      })
      return sendJson(res, 200, { ok: true })
    }

    const body = await readJson(req)
    const updates = { updatedAt: new Date() }

    if (body.name !== undefined) {
      const name = (body.name || '').trim()
      if (!name) return sendJson(res, 400, { error: 'Name cannot be empty.' })
      updates.name = name
    }

    if (body.email !== undefined) {
      const email = body.email?.trim().toLowerCase() || null
      if (email) {
        const [clash] = await db
          .select({ id: schema.partners.id })
          .from(schema.partners)
          .where(eq(schema.partners.email, email))
          .limit(1)
        if (clash && clash.id !== id) {
          return sendJson(res, 409, {
            error: 'Another partner already uses this email.',
          })
        }
        const [matchedUser] = await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1)
        updates.userId = matchedUser?.id || null
      } else {
        updates.userId = null
      }
      updates.email = email
    }

    if (body.phone !== undefined) {
      updates.phone = body.phone?.trim() || null
    }
    if (body.notes !== undefined) {
      updates.notes = body.notes?.trim() || null
    }

    let nextActive = existing.isActive
    if (body.isActive !== undefined) {
      nextActive = Boolean(body.isActive)
      updates.isActive = nextActive
    }

    let desiredOwnership = existing.ownershipBasisPoints
    if (body.ownershipPercent !== undefined) {
      const pct = Number(body.ownershipPercent)
      const ownershipBasisPoints = Math.round(pct * 100)
      if (
        !Number.isFinite(pct) ||
        ownershipBasisPoints < 0 ||
        ownershipBasisPoints > 10000
      ) {
        return sendJson(res, 400, {
          error: 'Ownership must be between 0% and 100%.',
        })
      }
      desiredOwnership = ownershipBasisPoints
      updates.ownershipBasisPoints = ownershipBasisPoints
    }

    // Validate the total whenever the partner ends up active — including
    // reactivating an old partner whose percentage is still on record.
    if (nextActive) {
      const allActive = await db
        .select({
          id: schema.partners.id,
          ownershipBasisPoints: schema.partners.ownershipBasisPoints,
        })
        .from(schema.partners)
        .where(eq(schema.partners.isActive, true))

      const total = allActive
        .filter((p) => p.id !== id)
        .reduce((sum, p) => sum + p.ownershipBasisPoints, 0)
      if (total + desiredOwnership > 10000) {
        return sendJson(res, 400, {
          error: `Ownership would exceed 100%. Other active partners total ${(
            total / 100
          ).toFixed(2)}%.`,
        })
      }
    }

    const [partner] = await db
      .update(schema.partners)
      .set(updates)
      .where(eq(schema.partners.id, id))
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'partner.update',
      entity: 'partner',
      entityId: id,
    })

    return sendJson(res, 200, { partner })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, {
        error: 'A partner with this email already exists.',
      })
    }
    console.error('partner detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
