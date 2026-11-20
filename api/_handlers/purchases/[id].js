/**
 * GET    /api/purchases/:id  — detail incl. items, payments, movements
 * PATCH  /api/purchases/:id  — edit; safely reverses old item effects and
 *                              applies new ones inside one transaction
 * DELETE /api/purchases/:id  — cancel; reverses all stock effects
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { applyPurchaseStock } from './index.js'
import { toBase, takaToPoisha } from '../../../src/shared/units.js'

async function loadItems(purchaseId) {
  return db
    .select()
    .from(schema.purchaseItems)
    .where(eq(schema.purchaseItems.purchaseId, purchaseId))
}

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Purchase id is required.' })

  try {
    const [purchase] = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.id, id))
      .limit(1)

    if (!purchase) return sendJson(res, 404, { error: 'Purchase not found.' })

    if (req.method === 'GET') {
      const items = await db
        .select({
          id: schema.purchaseItems.id,
          ingredientId: schema.purchaseItems.ingredientId,
          ingredientName: schema.ingredients.name,
          displayUnit: schema.ingredients.displayUnit,
          quantityBase: schema.purchaseItems.quantityBase,
          unitPricePoisha: schema.purchaseItems.unitPricePoisha,
          lineTotalPoisha: schema.purchaseItems.lineTotalPoisha,
          expiryDate: schema.purchaseItems.expiryDate,
        })
        .from(schema.purchaseItems)
        .innerJoin(schema.ingredients, eq(schema.purchaseItems.ingredientId, schema.ingredients.id))
        .where(eq(schema.purchaseItems.purchaseId, id))
      const payments = await db
        .select({
          id: schema.purchasePayments.id,
          amountPoisha: schema.purchasePayments.amountPoisha,
          paymentMethod: schema.purchasePayments.paymentMethod,
          paidAt: schema.purchasePayments.paidAt,
          notes: schema.purchasePayments.notes,
          recordedBy: schema.users.name,
        })
        .from(schema.purchasePayments)
        .leftJoin(schema.users, eq(schema.purchasePayments.recordedBy, schema.users.id))
        .where(eq(schema.purchasePayments.purchaseId, id))
        .orderBy(desc(schema.purchasePayments.createdAt))
      return sendJson(res, 200, { purchase, items, payments })
    }

    if (purchase.status === 'cancelled') {
      return sendJson(res, 400, { error: 'This purchase is already cancelled.' })
    }

    if (req.method === 'DELETE') {
      const body = await readJson(req).catch(() => ({}))
      await db.transaction(async (tx) => {
        const items = await tx
          .select()
          .from(schema.purchaseItems)
          .where(eq(schema.purchaseItems.purchaseId, id))
        // Reverse stock in one transaction; aborts entirely if any
        // reversal would push stock negative.
        await applyPurchaseStock(tx, user.id, id, items, -1)

        await tx
          .update(schema.purchases)
          .set({
            status: 'cancelled',
            cancelledBy: user.id,
            cancelledAt: new Date(),
            cancelNotes: body.notes?.trim() || 'Cancelled',
            updatedAt: new Date(),
          })
          .where(eq(schema.purchases.id, id))
      })

      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'purchase.cancel',
        entity: 'purchase',
        entityId: id,
      })
      return sendJson(res, 200, { ok: true })
    }

    // PATCH — full edit: reverse old stock effects, apply new ones.
    const body = await readJson(req)
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return sendJson(res, 400, { error: 'At least one purchase item is required.' })
    }
    const purchaseDate = body.purchaseDate || purchase.purchaseDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate)) {
      return sendJson(res, 400, { error: 'A valid purchase date is required.' })
    }

    const normalized = []
    for (const item of items) {
      const qtyBase = toBase(item.quantity, item.displayUnit)
      const lineTotal = takaToPoisha(item.lineTotal)
      if (qtyBase <= 0 || lineTotal < 0) {
        return sendJson(res, 400, { error: 'Invalid item quantity or cost.' })
      }
      normalized.push({
        ingredientId: item.ingredientId,
        quantityBase: qtyBase,
        unitPricePoisha: Math.round(lineTotal / qtyBase),
        lineTotalPoisha: lineTotal,
        expiryDate: item.expiryDate || null,
        purchaseDate,
        supplierId: body.supplierId ?? purchase.supplierId,
      })
    }
    const totalPoisha = normalized.reduce((sum, i) => sum + i.lineTotalPoisha, 0)
    if (totalPoisha < purchase.paidPoisha) {
      return sendJson(res, 400, {
        error: 'New total is less than the amount already paid for this purchase.',
      })
    }

    const oldItems = await loadItems(id)

    await db.transaction(async (tx) => {
      await applyPurchaseStock(tx, user.id, id, oldItems, -1)
      await applyPurchaseStock(tx, user.id, id, normalized, +1)

      await tx
        .delete(schema.purchaseItems)
        .where(eq(schema.purchaseItems.purchaseId, id))
      for (const item of normalized) {
        await tx.insert(schema.purchaseItems).values({ ...item, purchaseId: id })
      }

      await tx
        .update(schema.purchases)
        .set({
          purchaseDate,
          supplierId: body.supplierId ?? purchase.supplierId,
          totalPoisha,
          invoiceNumber: body.invoiceNumber?.trim() || null,
          notes: body.notes?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(schema.purchases.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'purchase.update',
      entity: 'purchase',
      entityId: id,
    })

    return sendJson(res, 200, { ok: true })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('purchase detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
