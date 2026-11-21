/**
 * GET  /api/usage/reconciliation?date=YYYY-MM-DD
 *        — reconciliation sheet (expected vs counted) + recent history
 * POST /api/usage/reconciliation
 *        — confirm physical counts for today; each non-zero difference
 *          creates an explicit `adjustment` movement (stock is never
 *          silently overwritten). One confirmation per date+ingredient.
 *
 * Body: { date, counts: [{ ingredientId, actualQuantity, explanation }] }
 */
import { and, desc, eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import {
  addStock,
  deductStock,
  MOVEMENT_TYPES,
} from '../../_lib/stock.js'
import { toBase } from '../../../src/shared/units.js'
import { buildDaySheet } from '../../_lib/usage.js'

function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`
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
      const date = url.searchParams.get('date') || todayStr()
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendJson(res, 400, { error: 'A valid date (YYYY-MM-DD) is required.' })
      }
      const sheet = await buildDaySheet(date)
      const history = await db
        .select({
          id: schema.stockReconciliations.id,
          date: schema.stockReconciliations.reconciliationDate,
          expectedBase: schema.stockReconciliations.expectedBase,
          actualBase: schema.stockReconciliations.actualBase,
          differenceBase: schema.stockReconciliations.differenceBase,
          explanation: schema.stockReconciliations.explanation,
          confirmedAt: schema.stockReconciliations.confirmedAt,
          ingredientName: schema.ingredients.name,
          ingredientUnit: schema.ingredients.displayUnit,
          userName: schema.users.name,
        })
        .from(schema.stockReconciliations)
        .leftJoin(
          schema.ingredients,
          eq(schema.stockReconciliations.ingredientId, schema.ingredients.id),
        )
        .leftJoin(
          schema.users,
          eq(schema.stockReconciliations.confirmedBy, schema.users.id),
        )
        .orderBy(desc(schema.stockReconciliations.confirmedAt))
        .limit(100)
      return sendJson(res, 200, { ...sheet, today: todayStr(), history })
    }

    // POST — confirm counts
    const body = await readJson(req)
    const date = body.date
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendJson(res, 400, { error: 'A valid date (YYYY-MM-DD) is required.' })
    }
    if (date !== todayStr()) {
      return sendJson(res, 400, {
        error: 'Only today’s stock can be reconciled. Past days are view-only.',
      })
    }
    const counts = Array.isArray(body.counts) ? body.counts : []
    if (counts.length === 0) {
      return sendJson(res, 400, { error: 'Enter at least one counted quantity.' })
    }

    // Expected values are computed once, before any adjustment is applied.
    const sheet = await buildDaySheet(date)
    const expectedById = new Map(
      sheet.ingredients.map((i) => [i.ingredientId, i]),
    )

    const results = await db.transaction(async (tx) => {
      const out = []
      for (const c of counts) {
        if (!c.ingredientId) continue
        const meta = expectedById.get(c.ingredientId)
        if (!meta) {
          out.push({ ingredientId: c.ingredientId, skipped: true, reason: 'Unknown ingredient' })
          continue
        }
        const actualBase = toBase(c.actualQuantity, meta.displayUnit)
        const expectedBase = meta.expectedClosingBase
        const differenceBase = actualBase - expectedBase

        let adjustmentMovementId = null
        if (differenceBase !== 0) {
          const notes = `Reconciliation ${date}`
          if (differenceBase < 0) {
            await deductStock(tx, {
              ingredientId: c.ingredientId,
              quantityBase: -differenceBase,
              movementType: MOVEMENT_TYPES.ADJUSTMENT,
              userId: user.id,
              notes,
            })
          } else {
            await addStock(tx, {
              ingredientId: c.ingredientId,
              quantityBase: differenceBase,
              movementType: MOVEMENT_TYPES.ADJUSTMENT,
              userId: user.id,
              notes,
            })
          }
          const [movement] = await tx
            .select({ id: schema.inventoryMovements.id })
            .from(schema.inventoryMovements)
            .where(
              and(
                eq(schema.inventoryMovements.ingredientId, c.ingredientId),
                eq(schema.inventoryMovements.movementType, MOVEMENT_TYPES.ADJUSTMENT),
              ),
            )
            .orderBy(desc(schema.inventoryMovements.createdAt))
            .limit(1)
          adjustmentMovementId = movement?.id || null
        }

        const [inserted] = await tx
          .insert(schema.stockReconciliations)
          .values({
            reconciliationDate: date,
            ingredientId: c.ingredientId,
            expectedBase,
            actualBase,
            differenceBase,
            explanation: c.explanation?.trim() || null,
            adjustmentMovementId,
            confirmedBy: user.id,
          })
          .onConflictDoNothing()
          .returning()

        out.push({
          ingredientId: c.ingredientId,
          name: meta.name,
          expectedBase,
          actualBase,
          differenceBase,
          inserted: Boolean(inserted),
          adjustmentMovementId,
        })
      }
      return out
    })

    // Raise / resolve reconciliation notifications.
    for (const r of results) {
      if (r.inserted === false || r.skipped) continue
      const entityId = `${date}:${r.ingredientId}`
      if (r.differenceBase !== 0) {
        const existing = await db
          .select({ id: schema.notifications.id })
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.type, 'reconciliation'),
              eq(schema.notifications.entityId, entityId),
              eq(schema.notifications.resolved, false),
            ),
          )
          .limit(1)
        if (existing.length === 0) {
          await db.insert(schema.notifications).values({
            type: 'reconciliation',
            severity: 'warning',
            title: 'STOCK DISCREPANCY',
            body: `${r.name} counted ${r.actualBase} vs expected ${r.expectedBase} (difference ${r.differenceBase}).`,
            entityType: 'reconciliation',
            entityId,
          })
        }
      } else {
        await db
          .update(schema.notifications)
          .set({ resolved: true, resolvedAt: new Date() })
          .where(
            and(
              eq(schema.notifications.type, 'reconciliation'),
              eq(schema.notifications.entityId, entityId),
            ),
          )
      }
    }

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'reconciliation.confirm',
      entity: 'stock_reconciliation',
      entityId: date,
      details: { count: results.length },
    })

    return sendJson(res, 201, { ok: true, results })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('reconciliation error:', err)
    return sendJson(res, 500, { error: err.message || 'Something went wrong. Please try again.' })
  }
}