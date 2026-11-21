/**
 * GET /api/overview
 *
 * One call with sales performance at every scale, all computed live from
 * recorded (confirmed) sales so the database remains the single source of
 * truth and nothing needs to be "reset":
 *   - daily   → today (resets automatically at midnight)
 *   - monthly → current calendar month
 *   - yearly  → current calendar year
 *   - lifetime→ all time
 *
 * For each period: revenue (after refunds), cost of goods sold (COGS),
 * gross profit (revenue − COGS), order count and items sold.
 *
 * Also returns `todayItems`: what was sold today, grouped by product
 * (quantity, revenue, cost, profit).
 */
import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'

async function totals(where) {
  const [salesAgg] = await db
    .select({
      revenue: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
      cogs: sql`COALESCE(SUM(${schema.sales.cogsPoisha}), 0)::int`,
      orders: sql`COUNT(*)::int`,
    })
    .from(schema.sales)
    .where(where)

  const [itemAgg] = await db
    .select({
      items: sql`COALESCE(SUM(${schema.saleItems.quantity}), 0)::int`,
    })
    .from(schema.saleItems)
    .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
    .where(where)

  const revenue = salesAgg?.revenue || 0
  const cogs = salesAgg?.cogs || 0
  return {
    revenuePoisha: revenue,
    cogsPoisha: cogs,
    profitPoisha: revenue - cogs,
    orders: salesAgg?.orders || 0,
    items: itemAgg?.items || 0,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const now = new Date()
    const y = now.getFullYear()
    const m = now.getMonth()
    const d = now.getDate()

    const dayStart = new Date(y, m, d)
    const dayEnd = new Date(y, m, d + 1)
    const monthStart = new Date(y, m, 1)
    const monthEnd = new Date(y, m + 1, 1)
    const yearStart = new Date(y, 0, 1)
    const yearEnd = new Date(y + 1, 0, 1)

    const confirmed = eq(schema.sales.status, 'confirmed')
    const dayWhere = and(gte(schema.sales.saleDate, dayStart), lt(schema.sales.saleDate, dayEnd), confirmed)
    const monthWhere = and(gte(schema.sales.saleDate, monthStart), lt(schema.sales.saleDate, monthEnd), confirmed)
    const yearWhere = and(gte(schema.sales.saleDate, yearStart), lt(schema.sales.saleDate, yearEnd), confirmed)

    const [daily, monthly, yearly, lifetime] = await Promise.all([
      totals(dayWhere),
      totals(monthWhere),
      totals(yearWhere),
      totals(confirmed),
    ])

    // What sold today, grouped by product.
    const todayItems = await db
      .select({
        productName: schema.saleItems.productName,
        quantity: sql`COALESCE(SUM(${schema.saleItems.quantity}), 0)::int`,
        revenuePoisha: sql`COALESCE(SUM(${schema.saleItems.lineTotalPoisha}), 0)::int`,
        cogsPoisha: sql`COALESCE(SUM(${schema.saleItems.cogsPoisha}), 0)::int`,
      })
      .from(schema.saleItems)
      .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
      .where(dayWhere)
      .groupBy(schema.saleItems.productName)
      .orderBy(desc(sql`COALESCE(SUM(${schema.saleItems.lineTotalPoisha}), 0)`))

    const todayItemsOut = todayItems.map((it) => ({
      productName: it.productName,
      quantity: it.quantity,
      revenuePoisha: it.revenuePoisha,
      cogsPoisha: it.cogsPoisha,
      profitPoisha: it.revenuePoisha - it.cogsPoisha,
    }))

    return sendJson(res, 200, {
      asOf: now.toISOString(),
      periods: {
        daily: { key: 'daily', label: 'Today', period: `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, ...daily },
        monthly: { key: 'monthly', label: 'This month', period: `${y}-${String(m + 1).padStart(2, '0')}`, ...monthly },
        yearly: { key: 'yearly', label: 'This year', period: String(y), ...yearly },
        lifetime: { key: 'lifetime', label: 'All time', period: 'All time', ...lifetime },
      },
      todayItems: todayItemsOut,
    })
  } catch (err) {
    console.error('overview error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}