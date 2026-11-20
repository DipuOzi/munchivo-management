/**
 * GET    /api/sales/:id  — detail with items + refunds
 * DELETE /api/sales/:id  — cancel: reverses all inventory deductions
 */
import { eq } from 'drizzle-orm'
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
        // Direct sales deducted the product's recipe ingredients — return them.
        if (item.recipeId) {
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
