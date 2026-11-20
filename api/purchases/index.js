/**
 * GET  /api/purchases  — list with supplier + item summary
 * POST /api/purchases  — create confirmed purchase; increases stock,
 *                        creates batches and movement rows in one transaction.
 *
 * Body: {
 *   purchaseDate, supplierId?, invoiceNumber?, notes?,
 *   paymentMethod, initialPaid (taka, optional),
 *   items: [{ ingredientId, quantity (display-unit number), displayUnit,
 *             lineTotal (taka), expiryDate? }]
 * }
 */
import { desc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { toBase, takaToPoisha } from '../../src/shared/units.js'

export async function applyPurchaseStock(tx, userId, purchaseId, items, sign) {
  // sign = +1 when applying a purchase, -1 when reversing it
  for (const item of items) {
    const [ingredient] = await tx
      .select()
      .from(schema.ingredients)
      .where(eq(schema.ingredients.id, item.ingredientId))
      .limit(1)
      .for('update')

    if (!ingredient) {
      const err = new Error('Ingredient not found for purchase item.')
      err.statusCode = 400
      throw err
    }

    const delta = sign * item.quantityBase
    const balanceAfter = ingredient.currentStockBase + delta
    if (balanceAfter < 0) {
      const err = new Error(
        `Reversal would make ${ingredient.name} stock negative. It may have been consumed already; adjust stock manually if needed.`,
      )
      err.statusCode = 400
      throw err
    }

    // Weighted average cost update only when adding stock.
    let avg = ingredient.avgCostPoisha
    if (sign > 0 && item.unitPricePoisha > 0) {
      const totalValue = ingredient.currentStockBase * ingredient.avgCostPoisha + item.quantityBase * item.unitPricePoisha
      avg = balanceAfter > 0 ? Math.round(totalValue / balanceAfter) : 0
    }

    await tx
      .update(schema.ingredients)
      .set({ currentStockBase: balanceAfter, avgCostPoisha: avg, updatedAt: new Date() })
      .where(eq(schema.ingredients.id, item.ingredientId))

    await tx.insert(schema.inventoryMovements).values({
      ingredientId: item.ingredientId,
      movementType: sign > 0 ? 'purchase' : 'purchase_reversal',
      quantityDeltaBase: delta,
      unitCostPoisha: item.unitPricePoisha,
      balanceAfterBase: balanceAfter,
      purchaseId,
      userId,
      notes:
        sign > 0
          ? `Purchase received (${item.quantityBase} base units)`
          : 'Purchase reversed (edit or cancellation)',
    })

    // Batches: consume on reversal (FEFO-ish: oldest first), create on apply.
    if (sign > 0) {
      await tx.insert(schema.inventoryBatches).values({
        ingredientId: item.ingredientId,
        purchaseId,
        purchaseDate: item.purchaseDate || null,
        expiryDate: item.expiryDate || null,
        quantityOriginalBase: item.quantityBase,
        quantityRemainingBase: item.quantityBase,
        unitCostPoisha: item.unitPricePoisha,
        supplierId: item.supplierId || null,
      })
    } else {
      let remaining = item.quantityBase
      const batches = await tx
        .select()
        .from(schema.inventoryBatches)
        .where(eq(schema.inventoryBatches.ingredientId, item.ingredientId))
        .orderBy(sql`expiry_date NULLS LAST, created_at ASC`)
      for (const batch of batches) {
        if (remaining <= 0) break
        if (batch.quantityRemainingBase <= 0) continue
        const take = Math.min(remaining, batch.quantityRemainingBase)
        await tx
          .update(schema.inventoryBatches)
          .set({
            quantityRemainingBase: batch.quantityRemainingBase - take,
            status: batch.quantityRemainingBase - take <= 0 ? 'depleted' : 'active',
          })
          .where(eq(schema.inventoryBatches.id, batch.id))
        remaining -= take
      }
    }
  }
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x')
      const status = url.searchParams.get('status') || 'all'
      const supplierId = url.searchParams.get('supplierId')

      const conditions = []
      if (status !== 'all') conditions.push(eq(schema.purchases.status, status))
      if (supplierId) conditions.push(eq(schema.purchases.supplierId, supplierId))

      const rows = await db
        .select({
          id: schema.purchases.id,
          purchaseDate: schema.purchases.purchaseDate,
          status: schema.purchases.status,
          totalPoisha: schema.purchases.totalPoisha,
          paidPoisha: schema.purchases.paidPoisha,
          invoiceNumber: schema.purchases.invoiceNumber,
          notes: schema.purchases.notes,
          createdAt: schema.purchases.createdAt,
          supplierName: schema.suppliers.name,
          creatorName: schema.users.name,
          itemCount: sql`(SELECT COUNT(*)::int FROM purchase_items pi WHERE pi.purchase_id = ${schema.purchases.id})`,
        })
        .from(schema.purchases)
        .leftJoin(schema.suppliers, eq(schema.purchases.supplierId, schema.suppliers.id))
        .leftJoin(schema.users, eq(schema.purchases.createdBy, schema.users.id))
        .where(conditions.length ? sql.join(conditions, sql` AND `) : undefined)
        .orderBy(desc(schema.purchases.purchaseDate), desc(schema.purchases.createdAt))
        .limit(200)

      return sendJson(res, 200, { purchases: rows })
    }

    // POST
    const body = await readJson(req)
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return sendJson(res, 400, { error: 'At least one purchase item is required.' })
    }

    const purchaseDate = body.purchaseDate
    if (!/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate || '')) {
      return sendJson(res, 400, { error: 'A valid purchase date is required.' })
    }

    // Normalize + validate items, converting display units to base units.
    const normalized = []
    for (const item of items) {
      const qtyBase = toBase(item.quantity, item.displayUnit)
      const lineTotal = takaToPoisha(item.lineTotal)
      if (qtyBase <= 0) {
        return sendJson(res, 400, { error: 'Item quantity must be greater than zero.' })
      }
      if (lineTotal < 0) {
        return sendJson(res, 400, { error: 'Item cost cannot be negative.' })
      }
      normalized.push({
        ingredientId: item.ingredientId,
        quantityBase: qtyBase,
        unitPricePoisha: Math.round(lineTotal / qtyBase),
        lineTotalPoisha: lineTotal,
        expiryDate: item.expiryDate || null,
        purchaseDate,
        supplierId: body.supplierId || null,
      })
    }

    const totalPoisha = normalized.reduce((sum, i) => sum + i.lineTotalPoisha, 0)
    const initialPaid = Math.min(takaToPoisha(body.initialPaid || 0), totalPoisha)

    const purchase = await db.transaction(async (tx) => {
      const [purchase] = await tx
        .insert(schema.purchases)
        .values({
          purchaseDate,
          supplierId: body.supplierId || null,
          status: 'confirmed',
          totalPoisha,
          paidPoisha: initialPaid,
          invoiceNumber: body.invoiceNumber?.trim() || null,
          notes: body.notes?.trim() || null,
          createdBy: user.id,
        })
        .returning()

      for (const item of normalized) {
        await tx.insert(schema.purchaseItems).values({ ...item, purchaseId: purchase.id })
      }

      await applyPurchaseStock(tx, user.id, purchase.id, normalized, +1)

      if (initialPaid > 0) {
        await tx.insert(schema.purchasePayments).values({
          purchaseId: purchase.id,
          amountPoisha: initialPaid,
          paymentMethod: body.paymentMethod || 'cash',
          paidAt: purchaseDate,
          recordedBy: user.id,
          notes: 'Payment recorded with purchase',
        })
      }

      return purchase
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'purchase.create',
      entity: 'purchase',
      entityId: purchase.id,
      details: { totalPoisha, items: normalized.length },
    })

    return sendJson(res, 201, { purchase })
  } catch (err) {
    console.error('purchase create error:', err)
    return sendJson(res, 500, { error: err.message || 'Something went wrong. Please try again.' })
  }
}
