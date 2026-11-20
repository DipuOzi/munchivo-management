/**
 * GET    /api/ingredients/:id   — detail incl. recent movements & batches
 * PATCH  /api/ingredients/:id   — edit fields (stock is NEVER changed silently)
 * DELETE /api/ingredients/:id   — archive (never hard-delete history)
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { toBase, takaToPoisha, unitTypeFor } from '../../src/shared/units.js'

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  // Vercel dynamic route param; local dev server sets req.params
  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Ingredient id is required.' })

  try {
    const [ingredient] = await db
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.id, id))
      .limit(1)

    if (!ingredient) return sendJson(res, 404, { error: 'Ingredient not found.' })

    if (req.method === 'GET') {
      const movements = await db
        .select({
          id: schema.inventoryMovements.id,
          movementType: schema.inventoryMovements.movementType,
          quantityDeltaBase: schema.inventoryMovements.quantityDeltaBase,
          unitCostPoisha: schema.inventoryMovements.unitCostPoisha,
          balanceAfterBase: schema.inventoryMovements.balanceAfterBase,
          notes: schema.inventoryMovements.notes,
          createdAt: schema.inventoryMovements.createdAt,
          userName: schema.users.name,
        })
        .from(schema.inventoryMovements)
        .leftJoin(schema.users, eq(schema.inventoryMovements.userId, schema.users.id))
        .where(eq(schema.inventoryMovements.ingredientId, id))
        .orderBy(desc(schema.inventoryMovements.createdAt))
        .limit(50)

      const batches = await db
        .select()
        .from(schema.inventoryBatches)
        .where(eq(schema.inventoryBatches.ingredientId, id))
        .orderBy(desc(schema.inventoryBatches.createdAt))
        .limit(20)

      return sendJson(res, 200, { ingredient, movements, batches })
    }

    if (req.method === 'DELETE') {
      await db
        .update(schema.ingredients)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(schema.ingredients.id, id))

      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'ingredient.archive',
        entity: 'ingredient',
        entityId: id,
        details: { name: ingredient.name },
      })
      return sendJson(res, 200, { ok: true, archived: true })
    }

    // PATCH — edit descriptive fields only. Stock changes must go
    // through purchases, adjustments, production, waste or sales so
    // every change has an audit trail.
    const body = await readJson(req)
    const updates = { updatedAt: new Date() }

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return sendJson(res, 400, { error: 'Name cannot be empty.' })
      updates.name = name
    }
    if (body.category !== undefined) updates.category = body.category.trim() || 'General'
    if (body.displayUnit !== undefined) {
      const displayUnit = body.displayUnit.trim()
      if (unitTypeFor(displayUnit) !== ingredient.unitType) {
        return sendJson(res, 400, {
          error: `Unit type cannot change (this ingredient measures ${ingredient.unitType}).`,
        })
      }
      updates.displayUnit = displayUnit
    }
    if (body.minStock !== undefined)
      updates.minStockBase = toBase(body.minStock, ingredient.displayUnit)
    if (body.lowStockThreshold !== undefined)
      updates.lowStockThresholdBase = toBase(
        body.lowStockThreshold,
        ingredient.displayUnit,
      )
    if (body.supplierId !== undefined) updates.supplierId = body.supplierId || null
    if (body.storageLocation !== undefined)
      updates.storageLocation = body.storageLocation.trim() || null
    if (body.trackExpiry !== undefined) updates.trackExpiry = Boolean(body.trackExpiry)
    if (body.notes !== undefined) updates.notes = body.notes.trim() || null
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(body.status))
        return sendJson(res, 400, { error: 'Invalid status.' })
      updates.status = body.status
    }

    const [updated] = await db
      .update(schema.ingredients)
      .set(updates)
      .where(eq(schema.ingredients.id, id))
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'ingredient.update',
      entity: 'ingredient',
      entityId: id,
    })

    return sendJson(res, 200, { ingredient: updated })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'An ingredient with this name already exists.' })
    }
    console.error('ingredient detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
