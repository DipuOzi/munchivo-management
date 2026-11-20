/**
 * GET|POST /api/cron/daily
 *
 * Vercel Cron entry point (configured in vercel.json). Runs once a day
 * and keeps alerting in sync:
 *   - creates expiry alerts for batches inside the configured window
 *   - resolves expiry alerts whose batch is gone or used up
 *   - creates ageing alerts for prepared stock older than 48 hours
 *   - re-checks low stock and auto-resolves replenished ingredients
 *   - removes expired session rows
 *
 * Authentication: when CRON_SECRET is set, the request must send
 * `Authorization: Bearer <CRON_SECRET>` (Vercel does this automatically)
 * or `x-cron-secret`. Without a configured secret the endpoint is open,
 * which is fine for local development but not recommended in production.
 */
import { and, eq, isNotNull, lt, lte, gt } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { sendJson } from '../../_lib/http.js'
import { getBusinessSettings } from '../../_lib/settings.js'
import { checkLowStockTx } from '../../_lib/stock.js'
import { sendPushToAll } from '../push/test.js'
import { formatQty } from '../../../src/shared/units.js'

function isAuthorized(req) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  const auth = req.headers.authorization || ''
  return (
    auth === `Bearer ${secret}` ||
    req.headers['x-cron-secret'] === secret
  )
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

function addDays(dateISO, days) {
  const d = new Date(`${dateISO}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'Cron secret is invalid.' })
  }

  try {
    const business = await getBusinessSettings()
    const today = isoToday()
    const alertDays = business.expiryAlertDays || 7
    const windowEnd = addDays(today, alertDays)

    /* ---------------- Ingredient batch expiry ---------------- */
    const expiringBatches = await db
      .select({
        id: schema.inventoryBatches.id,
        quantityRemainingBase: schema.inventoryBatches.quantityRemainingBase,
        expiryDate: schema.inventoryBatches.expiryDate,
        ingredientName: schema.ingredients.name,
        displayUnit: schema.ingredients.displayUnit,
      })
      .from(schema.inventoryBatches)
      .innerJoin(
        schema.ingredients,
        eq(schema.inventoryBatches.ingredientId, schema.ingredients.id),
      )
      .where(
        and(
          isNotNull(schema.inventoryBatches.expiryDate),
          gt(schema.inventoryBatches.quantityRemainingBase, 0),
          lte(schema.inventoryBatches.expiryDate, windowEnd),
        ),
      )

    const existingBatchAlerts = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.type, 'expiry'),
          eq(schema.notifications.entityType, 'batch'),
          eq(schema.notifications.resolved, false),
        ),
      )
    const alertedBatchIds = new Set(existingBatchAlerts.map((n) => n.entityId))

    let batchAlertsCreated = 0
    for (const batch of expiringBatches) {
      if (alertedBatchIds.has(batch.id)) continue
      const expired = batch.expiryDate < today
      await db.insert(schema.notifications).values({
        type: 'expiry',
        severity: expired ? 'critical' : 'warning',
        title: expired ? 'EXPIRED STOCK' : 'EXPIRY ALERT',
        body: `${batch.ingredientName} — ${formatQty(
          batch.quantityRemainingBase,
          batch.displayUnit,
        )} ${expired ? 'expired on' : 'expires on'} ${batch.expiryDate}. Record it as waste or use it first.`,
        entityType: 'batch',
        entityId: batch.id,
      })
      batchAlertsCreated += 1
    }

    /* Resolve batch alerts that no longer apply. */
    let resolvedAlerts = 0
    const activeBatchIds = new Set(expiringBatches.map((b) => b.id))
    for (const alert of existingBatchAlerts) {
      if (activeBatchIds.has(alert.entityId)) continue
      await db
        .update(schema.notifications)
        .set({ resolved: true, resolvedAt: new Date() })
        .where(eq(schema.notifications.id, alert.id))
      resolvedAlerts += 1
    }

    /* ---------------- Prepared stock ageing ---------------- */
    const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
    const oldPrepared = await db
      .select({
        id: schema.preparedStock.id,
        quantityRemainingBase: schema.preparedStock.quantityRemainingBase,
        createdAt: schema.preparedStock.createdAt,
        productName: schema.products.name,
        recipeName: schema.recipes.name,
      })
      .from(schema.preparedStock)
      .leftJoin(
        schema.products,
        eq(schema.preparedStock.productId, schema.products.id),
      )
      .innerJoin(
        schema.recipes,
        eq(schema.preparedStock.recipeId, schema.recipes.id),
      )
      .where(
        and(
          eq(schema.preparedStock.status, 'active'),
          gt(schema.preparedStock.quantityRemainingBase, 0),
          lte(schema.preparedStock.createdAt, cutoff),
        ),
      )

    const existingPreparedAlerts = await db
      .select()
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.type, 'expiry'),
          eq(schema.notifications.entityType, 'prepared_stock'),
          eq(schema.notifications.resolved, false),
        ),
      )
    const alertedPreparedIds = new Set(
      existingPreparedAlerts.map((n) => n.entityId),
    )

    let preparedAlertsCreated = 0
    for (const batch of oldPrepared) {
      if (alertedPreparedIds.has(batch.id)) continue
      const ageDays = Math.floor(
        (Date.now() - new Date(batch.createdAt).getTime()) /
          (24 * 60 * 60 * 1000),
      )
      await db.insert(schema.notifications).values({
        type: 'expiry',
        severity: 'warning',
        title: 'PREPARED STOCK AGEING',
        body: `${
          batch.productName || batch.recipeName
        } has been in prepared stock for ${ageDays} day${
          ageDays === 1 ? '' : 's'
        } (${batch.quantityRemainingBase} base units left). Use or waste it.`,
        entityType: 'prepared_stock',
        entityId: batch.id,
      })
      preparedAlertsCreated += 1
    }

    const activePreparedIds = new Set(oldPrepared.map((b) => b.id))
    for (const alert of existingPreparedAlerts) {
      if (activePreparedIds.has(alert.entityId)) continue
      await db
        .update(schema.notifications)
        .set({ resolved: true, resolvedAt: new Date() })
        .where(eq(schema.notifications.id, alert.id))
      resolvedAlerts += 1
    }

    /* ---------------- Low stock re-check ---------------- */
    const thresholdIngredients = await db
      .select()
      .from(schema.ingredients)
      .where(
        and(
          eq(schema.ingredients.status, 'active'),
          gt(schema.ingredients.lowStockThresholdBase, 0),
        ),
      )

    let lowStockAlertsCreated = 0
    await db.transaction(async (tx) => {
      for (const ingredient of thresholdIngredients) {
        const created = await checkLowStockTx(tx, ingredient)
        if (created) lowStockAlertsCreated += 1
      }
    })

    /* ---------------- Session housekeeping ---------------- */
    const deletedSessions = await db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()))
      .returning({ id: schema.sessions.id })

    const newAlerts = batchAlertsCreated + preparedAlertsCreated
    if (newAlerts > 0) {
      sendPushToAll({
        title: 'Munchivo expiry alert',
        body: `${newAlerts} new expiry warning${
          newAlerts === 1 ? '' : 's'
        }. Open the dashboard to review.`,
        url: '/expiry',
        tag: 'munchivo-expiry',
      }).catch(() => {})
    }

    return sendJson(res, 200, {
      ok: true,
      ranAt: new Date().toISOString(),
      expiryAlertDays: alertDays,
      batchAlertsCreated,
      preparedAlertsCreated,
      lowStockAlertsCreated,
      resolvedAlerts,
      sessionsDeleted: deletedSessions.length,
    })
  } catch (err) {
    console.error('daily cron error:', err)
    return sendJson(res, 500, { error: 'Cron job failed.' })
  }
}
