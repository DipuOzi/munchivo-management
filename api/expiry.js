/**
 * GET /api/expiry — everything expiring soon or already expired:
 *   - ingredient purchase batches (inventory_batches with expiry dates)
 *   - prepared stock older than 2 days (perishable, no explicit expiry)
 *
 * Used by the Expiry page and the daily expiry notification cron.
 */
import { and, asc, eq, gt, isNotNull, lte, sql } from 'drizzle-orm'
import { db, schema } from '../src/db/index.js'
import { sendJson } from './_lib/http.js'
import { withAuth } from './_lib/guard.js'
import { getBusinessSettings } from './_lib/settings.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const business = await getBusinessSettings()
    const alertDays = business.expiryAlertDays || 7
    const today = new Date()
    const in7 = new Date(today.getTime() + alertDays * 24 * 60 * 60 * 1000)
    const todayStr = today.toISOString().slice(0, 10)
    const in7Str = in7.toISOString().slice(0, 10)

    // Ingredient batches with expiry within 7 days (or expired, still in stock)
    const ingredientBatches = await db
      .select({
        id: schema.inventoryBatches.id,
        kind: sql`'ingredient'`.as('kind'),
        ingredientId: schema.ingredients.id,
        name: schema.ingredients.name,
        displayUnit: schema.ingredients.displayUnit,
        quantityRemainingBase: schema.inventoryBatches.quantityRemainingBase,
        expiryDate: schema.inventoryBatches.expiryDate,
        purchaseId: schema.inventoryBatches.purchaseId,
      })
      .from(schema.inventoryBatches)
      .innerJoin(schema.ingredients, eq(schema.inventoryBatches.ingredientId, schema.ingredients.id))
      .where(
        and(
          isNotNull(schema.inventoryBatches.expiryDate),
          gt(schema.inventoryBatches.quantityRemainingBase, 0),
          lte(schema.inventoryBatches.expiryDate, in7Str),
        ),
      )
      .orderBy(asc(schema.inventoryBatches.expiryDate))

    // Prepared stock older than 48h (perishables) still unconsumed
    const cutoff = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000)
    const prepared = await db
      .select({
        id: schema.preparedStock.id,
        kind: sql`'prepared'`.as('kind'),
        name: schema.products.name,
        recipeName: schema.recipes.name,
        quantityRemainingBase: schema.preparedStock.quantityRemainingBase,
        unitCostPoisha: schema.preparedStock.unitCostPoisha,
        createdAt: schema.preparedStock.createdAt,
      })
      .from(schema.preparedStock)
      .leftJoin(schema.products, eq(schema.preparedStock.productId, schema.products.id))
      .innerJoin(schema.recipes, eq(schema.preparedStock.recipeId, schema.recipes.id))
      .where(
        and(
          eq(schema.preparedStock.status, 'active'),
          gt(schema.preparedStock.quantityRemainingBase, 0),
          lte(schema.preparedStock.createdAt, cutoff),
        ),
      )
      .orderBy(asc(schema.preparedStock.createdAt))

    return sendJson(res, 200, {
      ingredientBatches,
      prepared,
      today: todayStr,
      alertDays,
    })
  } catch (err) {
    console.error('expiry error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
