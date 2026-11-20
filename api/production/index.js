/**
 * GET  /api/production  — list production batches
 * POST /api/production  — create + confirm in one step:
 *   scales the recipe, deducts every ingredient, records prepared stock.
 *
 * Body: { recipeId, productId?, targetYield (number, recipe yield unit), notes? }
 */
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { deductStock, MOVEMENT_TYPES } from '../_lib/stock.js'
import { toBase } from '../../src/shared/units.js'

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
          id: schema.productionBatches.id,
          targetYieldBase: schema.productionBatches.targetYieldBase,
          status: schema.productionBatches.status,
          ingredientCostPoisha: schema.productionBatches.ingredientCostPoisha,
          notes: schema.productionBatches.notes,
          createdAt: schema.productionBatches.createdAt,
          recipeName: schema.recipes.name,
          recipeYieldUnit: schema.recipes.yieldUnit,
          productName: schema.products.name,
          creatorName: schema.users.name,
        })
        .from(schema.productionBatches)
        .innerJoin(schema.recipes, eq(schema.productionBatches.recipeId, schema.recipes.id))
        .leftJoin(schema.products, eq(schema.productionBatches.productId, schema.products.id))
        .leftJoin(schema.users, eq(schema.productionBatches.createdBy, schema.users.id))
        .orderBy(desc(schema.productionBatches.createdAt))
        .limit(100)
      return sendJson(res, 200, { batches: rows })
    }

    // POST
    const body = await readJson(req)
    const { recipeId, productId, notes } = body
    if (!recipeId) return sendJson(res, 400, { error: 'Recipe is required.' })

    const [recipe] = await db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, recipeId))
      .limit(1)
    if (!recipe) return sendJson(res, 404, { error: 'Recipe not found.' })

    const targetYieldBase = toBase(body.targetYield, recipe.yieldUnit)
    if (targetYieldBase <= 0) {
      return sendJson(res, 400, { error: 'Target production quantity must be greater than zero.' })
    }

    const factor = targetYieldBase / recipe.baseYieldBase

    const items = await db
      .select()
      .from(schema.recipeItems)
      .where(eq(schema.recipeItems.recipeId, recipeId))
    if (items.length === 0) {
      return sendJson(res, 400, { error: 'This recipe has no ingredients.' })
    }

    const batch = await db.transaction(async (tx) => {
      let totalCost = 0
      for (const item of items) {
        const need = Math.round(item.quantityBase * factor)
        if (need <= 0) continue
        const cogs = await deductStock(tx, {
          ingredientId: item.ingredientId,
          quantityBase: need,
          movementType: MOVEMENT_TYPES.PRODUCTION_CONSUMPTION,
          userId: user.id,
          notes: `Production batch (${recipe.name} ×${factor.toFixed(3)})`,
        })
        totalCost += cogs
      }

      const [batch] = await tx
        .insert(schema.productionBatches)
        .values({
          recipeId,
          productId: productId || null,
          targetYieldBase,
          ingredientCostPoisha: totalCost,
          notes: notes?.trim() || null,
          createdBy: user.id,
        })
        .returning()

      await tx.insert(schema.preparedStock).values({
        batchId: batch.id,
        productId: productId || null,
        recipeId,
        quantityOriginalBase: targetYieldBase,
        quantityRemainingBase: targetYieldBase,
        unitCostPoisha: Math.round(totalCost / targetYieldBase),
      })

      return batch
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'production.create',
      entity: 'production_batch',
      entityId: batch.id,
      details: { recipe: recipe.name, targetYieldBase },
    })

    return sendJson(res, 201, { batch })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('production error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
