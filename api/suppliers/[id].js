/**
 * PATCH  /api/suppliers/:id  — edit
 * DELETE /api/suppliers/:id  — deactivate (history preserved)
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'

export default async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Supplier id is required.' })

  try {
    if (req.method === 'DELETE') {
      await db
        .update(schema.suppliers)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(schema.suppliers.id, id))
      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'supplier.deactivate',
        entity: 'supplier',
        entityId: id,
      })
      return sendJson(res, 200, { ok: true })
    }

    const body = await readJson(req)
    const updates = { updatedAt: new Date() }
    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return sendJson(res, 400, { error: 'Name cannot be empty.' })
      updates.name = name
    }
    for (const field of ['phone', 'address', 'category', 'notes']) {
      if (body[field] !== undefined) updates[field] = body[field]?.trim() || null
    }
    if (body.isActive !== undefined) updates.isActive = Boolean(body.isActive)

    const [supplier] = await db
      .update(schema.suppliers)
      .set(updates)
      .where(eq(schema.suppliers.id, id))
      .returning()

    if (!supplier) return sendJson(res, 404, { error: 'Supplier not found.' })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'supplier.update',
      entity: 'supplier',
      entityId: id,
    })
    return sendJson(res, 200, { supplier })
  } catch (err) {
    console.error('supplier detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
