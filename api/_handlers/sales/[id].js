/**
 * GET    /api/sales/:id  — detail with items + refunds
 * DELETE /api/sales/:id  — cancel: reverses all inventory deductions
 */
import { eq, and } from 'drizzle-orm'
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
  if (!id) return sendJson(res, 400, { error: 'Sale id is required.' })

  try {
    const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, id)).limit(1)
    if (!sale) return sendJson(res, 404, { error: 'Sale not found.' })

    if (req.method === 'GET') {
      const items = await db
        .select()
        .from(schema.saleItems)
        .where(eq(schema.saleItems.saleId, id))
      const refunds = await db
        .select()
        .from(schema.saleRefunds)
        .where(eq(schema.saleRefunds.saleId, id))
      return sendJson(res, 200, { sale, items, refunds })
    }

    if (sale.status === 'cancelled') {
      return sendJson(res, 400, { error: 'This sale is already cancelled.' })
    }

    // Cancel: reverse every inventory effect recorded at sale time.
    await db.transaction(async (tx) => {
      const items = await tx
        .select()
        .from(schema.saleItems)
        .where(eq(schema.saleItems.saleId, id))

      for (const item of items) {
        if (item.workflow === 'batch') {
          // Return quantity to prepared stock (no batch identity kept in
          // sale items — return via a reversal batch row is avoided by
          // restoring the newest active batch of the product).
          const [batch] = await tx
            .select()
            .from(schema.preparedStock)
            .where(and(eq(schema.preparedStock.productId, item.productId), eq(schema.preparedStock.status, 'active')))
            .limit(1)
          const recipe = item.recipeId
            ? (await tx.select().from(schema.recipes).where(eq(schema.recipes.id, item.recipeId)).limit(1))[0]
            : null
          const perServing = await productServingBase(tx, item, recipe)
          if (perServing) {
            const qty = perServing * item.quantity
            if (batch) {
              await tx
                .update(schema.preparedStock)
                .set({
                  quantityRemainingBase: batch.quantityRemainingBase + qty,
                  status: 'active',
                })
                .where(eq(schema.preparedStock.id, batch.id))
            } else {
              await tx.insert(schema.preparedStock).values({
                batchId: null,
                productId: item.productId,
                recipeId: item.recipeId,
                quantityOriginalBase: qty,
                quantityRemainingBase: qty,
                unitCostPoisha: item.cogsPoisha > 0 ? Math.round(item.cogsPoisha / qty) : 0,
              })
            }
          }
        } else if (item.recipeId) {
          const recipeItems = await tx
            .select()
            .from(schema.recipeItems)
            .where(eq(schema.recipeItems.recipeId, item.recipeId))
          for (const rItem of recipeItems) {
            const qty = Math.round(rItem.quantityBase * item.quantity)
            if (qty <= 0) continue
            await addStock(tx, {
              ingredientId: rItem.ingredientId,
              quantityBase: qty,
              movementType: MOVEMENT_TYPES.SALE_REVERSAL,
              userId: user.id,
              notes: `Sale ${sale.orderNumber} cancelled`,
            })
          }
        }
      }

      await tx
        .update(schema.sales)
        .set({ status: 'cancelled', cancelledBy: user.id, cancelledAt: new Date() })
        .where(eq(schema.sales.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'sale.cancel',
      entity: 'sale',
      entityId: id,
    })
    return sendJson(res, 200, { ok: true })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('sale detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}

async function productServingBase(tx, saleItem, recipe) {
  const [product] = await tx
    .select({ servingSizeBase: schema.products.servingSizeBase })
    .from(schema.products)
    .where(eq(schema.products.id, saleItem.productId))
    .limit(1)
  return product?.servingSizeBase || recipe?.baseYieldBase || null
}
