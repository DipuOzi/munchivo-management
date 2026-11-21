/**
 * GET|POST /api/cron/daily
 *
 * Vercel Cron entry point (configured in vercel.json). Runs once a day
 * and keeps alerting in sync:
 *   - creates expiry alerts for batches inside the configured window
 *   - resolves expiry alerts whose batch is gone or used up
 *   - re-checks low stock and auto-resolves replenished ingredients
 *   - removes expired session rows
 *
 * Authentication: when CRON_SECRET is set, the request must send
 * `Authorization: Bearer <CRON_SECRET>` (Vercel does this automatically)
 * or `x-cron-secret`. Without a configured secret the endpoint is open,
 * which is fine for local development but not recommended in production.
 */
import { and, eq, gt, gte, inArray, isNotNull, lt, lte, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { sendJson } from '../../_lib/http.js'
import { getBusinessSettings } from '../../_lib/settings.js'
import { checkLowStockTx } from '../../_lib/stock.js'
import { formatQty } from '../../../src/shared/units.js'

async function sendPushToAll(payload) {
  try {
    const webPush = await import('web-push')
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:hello@munchivo.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY,
    )
    const subs = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(eq(schema.pushSubscriptions.isActive, true))
    const jobs = subs.map((sub) =>
      (async () => {
        try {
          await webPush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dhKey,
                auth: sub.authKey,
              },
            },
            JSON.stringify(payload),
          )
          await db
            .update(schema.pushSubscriptions)
            .set({ failureCount: 0, lastSuccessAt: new Date() })
            .where(eq(schema.pushSubscriptions.id, sub.id))
        } catch {
          // Best effort; never crash the cron job.
        }
      })(),
    )
    await Promise.allSettled(jobs)
  } catch {
    // Push is best effort and must never crash the cron job.
  }
}

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

    /* ---------------- Unusual consumption (yesterday vs 30-day avg) -------- */
    let consumptionAlertsCreated = 0
    {
      const now = new Date()
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const DAY = 24 * 60 * 60 * 1000
      const yStart = new Date(todayStart.getTime() - DAY)
      const tStart = new Date(todayStart.getTime() - 31 * DAY)
      const types = [
        'sale_consumption',
        'sale_reversal',
        'waste',
        'waste_reversal',
        'manual_usage',
        'manual_usage_reversal',
        'expiry',
      ]
      const aggregate = (start, end) =>
        db
          .select({
            ingredientId: schema.ingredients.id,
            name: schema.ingredients.name,
            displayUnit: schema.ingredients.displayUnit,
            qty: sql`COALESCE(SUM(-${schema.inventoryMovements.quantityDeltaBase}), 0)::int`,
            cost: sql`COALESCE(SUM(-${schema.inventoryMovements.quantityDeltaBase} * COALESCE(${schema.inventoryMovements.unitCostPoisha}, 0)), 0)::bigint`,
          })
          .from(schema.inventoryMovements)
          .innerJoin(
            schema.ingredients,
            eq(schema.inventoryMovements.ingredientId, schema.ingredients.id),
          )
          .where(
            and(
              inArray(schema.inventoryMovements.movementType, types),
              gte(schema.inventoryMovements.createdAt, start),
              lt(schema.inventoryMovements.createdAt, end),
            ),
          )
          .groupBy(
            schema.ingredients.id,
            schema.ingredients.name,
            schema.ingredients.displayUnit,
          )

      const [yRows, tRows] = await Promise.all([
        aggregate(yStart, todayStart),
        aggregate(tStart, yStart),
      ])
      const avgById = new Map(
        tRows.map((r) => [
          r.ingredientId,
          { qty: (r.qty || 0) / 30, cost: Number(r.cost || 0) / 30 },
        ]),
      )
      const yKey = `${yStart.getFullYear()}-${String(yStart.getMonth() + 1).padStart(
        2,
        '0',
      )}-${String(yStart.getDate()).padStart(2, '0')}`

      for (const r of yRows) {
        const yQty = r.qty || 0
        const yCost = Number(r.cost || 0)
        const avg = avgById.get(r.ingredientId) || { qty: 0, cost: 0 }
        if (avg.cost <= 0) continue
        if (yCost >= 10000 && yQty > avg.qty * 2 && yCost > avg.cost * 2) {
          const entityId = `consumption:${r.ingredientId}:${yKey}`
          const existing = await db
            .select({ id: schema.notifications.id })
            .from(schema.notifications)
            .where(
              and(
                eq(schema.notifications.type, 'consumption'),
                eq(schema.notifications.entityId, entityId),
                eq(schema.notifications.resolved, false),
              ),
            )
            .limit(1)
          if (existing.length === 0) {
            const ratio = Math.round((yCost / avg.cost) * 10) / 10
            await db.insert(schema.notifications).values({
              type: 'consumption',
              severity: 'warning',
              title: 'UNUSUAL CONSUMPTION',
              body: `${r.name}: ${formatQty(
                yQty,
                r.displayUnit,
              )} used yesterday — about ${ratio}× its usual daily usage.`,
              entityType: 'consumption',
              entityId,
            })
            consumptionAlertsCreated += 1
          }
        }
      }
    }

    /* ---------------- Session housekeeping ---------------- */
    const deletedSessions = await db
      .delete(schema.sessions)
      .where(lt(schema.sessions.expiresAt, new Date()))
      .returning({ id: schema.sessions.id })

    const newAlerts = batchAlertsCreated
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
      lowStockAlertsCreated,
      consumptionAlertsCreated,
      resolvedAlerts,
      sessionsDeleted: deletedSessions.length,
    })
  } catch (err) {
    console.error('daily cron error:', err)
    return sendJson(res, 500, { error: 'Cron job failed.' })
  }
}
