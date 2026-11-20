/**
 * POST /api/stock/adjust
 * Body: { ingredientId, quantity (display unit, signed), notes }
 * Records a positive or negative stock adjustment with a movement row.
 * Prevents negative stock.
 */
import { eq, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { toBase } from '../../../src/shared/units.js'
import { checkLowStockTx } from '../../_lib/stock.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const body = await readJson(req)
    const { ingredientId, quantity, notes } = body
    if (!ingredientId || !Number.isFinite(Number(quantity)) || Number(quantity) === 0) {
      return sendJson(res, 400, { error: 'Ingredient and a non-zero quantity are required.' })
    }

    const result = await db.transaction(async (tx) => {
      const [ingredient] = await tx
        .select()
        .from(schema.ingredients)
        .where(eq(schema.ingredients.id, ingredientId))
        .limit(1)
        .for('update')

      if (!ingredient) {
        const err = new Error('Ingredient not found.')
        err.statusCode = 404
        throw err
      }

      const delta = toBase(quantity, ingredient.displayUnit)
      const balanceAfter = ingredient.currentStockBase + delta

      if (balanceAfter < 0) {
        const err = new Error(
          `Adjustment would make stock negative (current: ${ingredient.currentStockBase} ${ingredient.displayUnit}).`,
        )
        err.statusCode = 400
        throw err
      }

      await tx
        .update(schema.ingredients)
        .set({ currentStockBase: balanceAfter, updatedAt: new Date() })
        .where(eq(schema.ingredients.id, ingredientId))

      // Low-stock alerts: create/resolve as part of the adjustment.
      await checkLowStockTx(tx, { ...ingredient, currentStockBase: balanceAfter })

      const [movement] = await tx
        .insert(schema.inventoryMovements)
        .values({
          ingredientId,
          movementType: 'adjustment',
          quantityDeltaBase: delta,
          unitCostPoisha: ingredient.avgCostPoisha,
          balanceAfterBase: balanceAfter,
          userId: user.id,
          notes: notes?.trim() || (delta > 0 ? 'Positive adjustment' : 'Negative adjustment'),
        })
        .returning()

      return { ingredient: { ...ingredient, currentStockBase: balanceAfter }, movement }
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'stock.adjust',
      entity: 'ingredient',
      entityId: ingredientId,
      details: { delta: result.movement.quantityDeltaBase },
    })

    return sendJson(res, 200, result)
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('stock adjust error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
