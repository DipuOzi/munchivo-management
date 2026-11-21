/**
 * GET  /api/usage            — inventory usage dashboard for a date range
 * POST /api/usage            — record manual inventory usage (staff meal,
 *                              sample, testing, personal, other)
 *
 * Dashboard figures come from /api/_lib/usage.js (the movement ledger).
 */
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { deductStock, MOVEMENT_TYPES } from '../../_lib/stock.js'
import { toBase } from '../../../src/shared/units.js'
import { buildDashboard } from '../../_lib/usage.js'

const USAGE_REASONS = ['staff_meal', 'sample', 'testing', 'personal', 'other']

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x')
      const data = await buildDashboard({
        range: url.searchParams.get('range') || 'today',
        start: url.searchParams.get('start'),
        end: url.searchParams.get('end'),
      })
      return sendJson(res, 200, data)
    }

    // POST — manual usage
    const body = await readJson(req)
    if (!body.ingredientId) {
      return sendJson(res, 400, { error: 'An ingredient is required.' })
    }
    if (!body.reason || !USAGE_REASONS.includes(body.reason)) {
      return sendJson(res, 400, { error: 'Please choose a valid usage reason.' })
    }

    const record = await db.transaction(async (tx) => {
      const [ingredient] = await tx
        .select()
        .from(schema.ingredients)
        .where(eq(schema.ingredients.id, body.ingredientId))
        .limit(1)
      if (!ingredient) {
        const err = new Error('Ingredient not found.')
        err.statusCode = 400
        throw err
      }
      const unit = body.unit || ingredient.displayUnit
      const quantityBase = toBase(body.quantity, unit)
      if (quantityBase <= 0) {
        const err = new Error('Usage quantity must be greater than zero.')
        err.statusCode = 400
        throw err
      }

      const cost = await deductStock(tx, {
        ingredientId: ingredient.id,
        quantityBase,
        movementType: MOVEMENT_TYPES.MANUAL_USAGE,
        userId: user.id,
        notes: `Manual usage (${body.reason})`,
      })

      const [usage] = await tx
        .insert(schema.manualUsageRecords)
        .values({
          ingredientId: ingredient.id,
          quantityBase,
          unitCostPoisha: ingredient.avgCostPoisha,
          reason: body.reason,
          notes: body.notes?.trim() || null,
          recordedBy: user.id,
        })
        .returning()

      // Link the immutable movement row for traceability.
      const [movement] = await tx
        .select({ id: schema.inventoryMovements.id })
        .from(schema.inventoryMovements)
        .where(
          and(
            eq(schema.inventoryMovements.ingredientId, ingredient.id),
            eq(schema.inventoryMovements.movementType, MOVEMENT_TYPES.MANUAL_USAGE),
          ),
        )
        .orderBy(desc(schema.inventoryMovements.createdAt))
        .limit(1)
      if (movement) {
        await tx
          .update(schema.manualUsageRecords)
          .set({ movementId: movement.id })
          .where(eq(schema.manualUsageRecords.id, usage.id))
        usage.movementId = movement.id
      }

      return { ...usage, estimatedCostPoisha: cost }
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'usage.create',
      entity: 'manual_usage',
      entityId: record.id,
      details: { reason: body.reason, quantityBase: record.quantityBase },
    })

    return sendJson(res, 201, { record })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('usage error:', err)
    return sendJson(res, 500, { error: err.message || 'Something went wrong. Please try again.' })
  }
}