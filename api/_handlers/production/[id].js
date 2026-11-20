/**
 * GET    /api/production/:id  — detail
 * DELETE /api/production/:id  — cancel: reverses ingredient deductions.
 *   Blocked if any prepared stock from this batch was already consumed.
 */
import { eq, ne, and } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { addStock, MOVEMENT_TYPES } from '../../_lib/stock.js'

export default async function handler(req, res) {
  if (!['GET', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Batch id is required.' })

  try {
    const [batch] = await db
      .select()
      .from(schema.productionBatches)
      .where(eq(schema.productionBatches.id, id))
      .limit(1)
    if (!batch) return sendJson(res, 404, { error: 'Production batch not found.' })

    if (req.method === 'GET') {
      const items = await db
        .select({
          id: schema.preparedStock.id,
          remaining: schema.preparedStock.quantityRemainingBase,
          original: schema.preparedStock.quantityOriginalBase,
          unitCost: schema.preparedStock.unitCostPoisha,
          status: schema.preparedStock.status,
        })
        .from(schema.preparedStock)
        .where(eq(schema.preparedStock.batchId, id))
      return sendJson(res, 200, { batch, prepared: items })
    }

    if (batch.status === 'cancelled') {
      return sendJson(res, 400, { error: 'This batch is already cancelled.' })
    }

    const [prepared] = await db
      .select()
      .from(schema.preparedStock)
      .where(eq(schema.preparedStock.batchId, id))
      .limit(1)

    if (prepared && prepared.quantityRemainingBase < prepared.quantityOriginalBase) {
      return sendJson(res, 400, {
        error:
          'Some output from this batch was already sold/consumed — it cannot be cancelled. Record waste instead if needed.',
      })
    }

    const factor = batch.targetYieldBase / 1 // recompute per-item from recipe
    const items = await db
      .select()
      .from(schema.recipeItems)
      .where(eq(schema.recipeItems.recipeId, batch.recipeId))

    await db.transaction(async (tx) => {
      const scale = batch.targetYieldBase / (await getRecipeYield(tx, batch.recipeId))
      for (const item of items) {
        const need = Math.round(item.quantityBase * scale)
        if (need <= 0) continue
        await addStock(tx, {
          ingredientId: item.ingredientId,
          quantityBase: need,
          movementType: MOVEMENT_TYPES.PRODUCTION_REVERSAL,
          userId: user.id,
          notes: 'Production batch cancelled',
        })
      }

      if (prepared) {
        await tx
          .update(schema.preparedStock)
          .set({ quantityRemainingBase: 0, status: 'depleted' })
          .where(eq(schema.preparedStock.id, prepared.id))
      }

      await tx
        .update(schema.productionBatches)
        .set({
          status: 'cancelled',
          cancelledBy: user.id,
          cancelledAt: new Date(),
        })
        .where(eq(schema.productionBatches.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'production.cancel',
      entity: 'production_batch',
      entityId: id,
    })
    return sendJson(res, 200, { ok: true })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('production detail error:', err)
    return sendJson(res, 500, { error: err.message || 'Something went wrong. Please try again.' })
  }
}

async function getRecipeYield(tx, recipeId) {
  const [recipe] = await tx
    .select({ baseYieldBase: schema.recipes.baseYieldBase })
    .from(schema.recipes)
    .where(eq(schema.recipes.id, recipeId))
    .limit(1)
  return recipe?.baseYieldBase || 1
}
