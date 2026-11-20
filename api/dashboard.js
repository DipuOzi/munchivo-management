/**
 * GET /api/dashboard — everything the dashboard needs in one call:
 *   today's sales/profit, 14-day revenue trend, low stock, expiring
 *   soon, recent orders, top products (30 days), waste this month,
 *   supplier dues outstanding.
 */
import { and, desc, eq, gt, gte, isNotNull, lte, sql } from 'drizzle-orm'
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
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
    const trendStart = new Date(todayStart.getTime() - 13 * 24 * 60 * 60 * 1000)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthStartISO = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}-01`
    const topStart = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000)

    // Today's confirmed sales
    const [today] = await db
      .select({
        revenue: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
        cogs: sql`COALESCE(SUM(${schema.sales.cogsPoisha}), 0)::int`,
        orderCount: sql`COUNT(*)::int`,
      })
      .from(schema.sales)
      .where(
        and(
          gte(schema.sales.saleDate, todayStart),
          lte(schema.sales.saleDate, todayEnd),
          eq(schema.sales.status, 'confirmed'),
        ),
      )

    // 14-day trend (per day: revenue + cogs)
    const trendRows = await db
      .select({
        day: sql`TO_CHAR(${schema.sales.saleDate}, 'YYYY-MM-DD')`,
        revenue: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
        cogs: sql`COALESCE(SUM(${schema.sales.cogsPoisha}), 0)::int`,
        orders: sql`COUNT(*)::int`,
      })
      .from(schema.sales)
      .where(
        and(
          gte(schema.sales.saleDate, trendStart),
          eq(schema.sales.status, 'confirmed'),
        ),
      )
      .groupBy(sql`TO_CHAR(${schema.sales.saleDate}, 'YYYY-MM-DD')`)
      .orderBy(sql`TO_CHAR(${schema.sales.saleDate}, 'YYYY-MM-DD')`)

    // Fill missing days with zeros
    const trend = []
    for (let i = 0; i < 14; i++) {
      const d = new Date(trendStart.getTime() + i * 24 * 60 * 60 * 1000)
      const key = d.toISOString().slice(0, 10)
      const found = trendRows.find((r) => r.day === key)
      trend.push({
        day: key,
        revenue: found?.revenue || 0,
        profit: (found?.revenue || 0) - (found?.cogs || 0),
        orders: found?.orders || 0,
      })
    }

    // Low stock: active ingredients at/below threshold
    const lowStock = await db
      .select({
        id: schema.ingredients.id,
        name: schema.ingredients.name,
        displayUnit: schema.ingredients.displayUnit,
        currentStockBase: schema.ingredients.currentStockBase,
        lowStockThresholdBase: schema.ingredients.lowStockThresholdBase,
      })
      .from(schema.ingredients)
      .where(
        and(
          eq(schema.ingredients.status, 'active'),
          sql`${schema.ingredients.lowStockThresholdBase} > 0 AND ${schema.ingredients.currentStockBase} <= ${schema.ingredients.lowStockThresholdBase}`,
        ),
      )
      .orderBy(schema.ingredients.currentStockBase)

    // Expiring inside the configured alert window.
    const alertDays = business.expiryAlertDays || 7
    const in7Str = new Date(now.getTime() + alertDays * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)
    const expiringBatches = await db
      .select({
        id: schema.inventoryBatches.id,
        name: schema.ingredients.name,
        displayUnit: schema.ingredients.displayUnit,
        quantityRemainingBase: schema.inventoryBatches.quantityRemainingBase,
        expiryDate: schema.inventoryBatches.expiryDate,
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
      .orderBy(schema.inventoryBatches.expiryDate)
      .limit(10)

    // Waste this month
    const [wasteMonth] = await db
      .select({
        totalCost: sql`COALESCE(SUM(${schema.wasteRecords.estimatedCostPoisha}), 0)::int`,
        count: sql`COUNT(*)::int`,
      })
      .from(schema.wasteRecords)
      .where(
        and(
          gte(schema.wasteRecords.createdAt, monthStart),
          eq(schema.wasteRecords.status, 'confirmed'),
        ),
      )

    // This month's revenue / COGS / expenses — used for the net profit card.
    const [monthSales] = await db
      .select({
        revenue: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
        cogs: sql`COALESCE(SUM(${schema.sales.cogsPoisha}), 0)::int`,
        orders: sql`COUNT(*)::int`,
      })
      .from(schema.sales)
      .where(
        and(
          gte(schema.sales.saleDate, monthStart),
          eq(schema.sales.status, 'confirmed'),
        ),
      )

    const [monthExpenses] = await db
      .select({
        total: sql`COALESCE(SUM(${schema.expenses.amountPoisha}), 0)::int`,
        count: sql`COUNT(*)::int`,
      })
      .from(schema.expenses)
      .where(
        and(
          gte(schema.expenses.expenseDate, monthStartISO),
          eq(schema.expenses.status, 'confirmed'),
        ),
      )

    const monthNetProfit =
      monthSales.revenue -
      monthSales.cogs -
      monthExpenses.total -
      wasteMonth.totalCost

    // Top products (30 days by units sold)
    const topProducts = await db
      .select({
        productId: schema.saleItems.productId,
        name: schema.saleItems.productName,
        unitsSold: sql`COALESCE(SUM(${schema.saleItems.quantity}), 0)::int`,
        revenue: sql`COALESCE(SUM(${schema.saleItems.lineTotalPoisha}), 0)::int`,
      })
      .from(schema.saleItems)
      .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
      .where(and(gte(schema.sales.saleDate, topStart), eq(schema.sales.status, 'confirmed')))
      .groupBy(schema.saleItems.productId, schema.saleItems.productName)
      .orderBy(sql`COALESCE(SUM(${schema.saleItems.quantity}), 0) DESC`)
      .limit(5)

    // Recent orders
    const recentOrders = await db
      .select({
        id: schema.sales.id,
        orderNumber: schema.sales.orderNumber,
        saleDate: schema.sales.saleDate,
        totalPoisha: schema.sales.totalPoisha,
        status: schema.sales.status,
        paymentMethod: schema.sales.paymentMethod,
        creatorName: schema.users.name,
      })
      .from(schema.sales)
      .leftJoin(schema.users, eq(schema.sales.createdBy, schema.users.id))
      .orderBy(desc(schema.sales.saleDate))
      .limit(6)

    // Supplier dues outstanding
    const [dues] = await db
      .select({
        totalDue: sql`COALESCE(SUM(${schema.purchases.totalPoisha} - ${schema.purchases.paidPoisha}), 0)::int`,
      })
      .from(schema.purchases)
      .where(eq(schema.purchases.status, 'confirmed'))

    return sendJson(res, 200, {
      today: {
        revenue: today.revenue,
        profit: today.revenue - today.cogs,
        orders: today.orderCount,
      },
      trend,
      lowStock,
      expiringBatches,
      wasteMonth: wasteMonth.totalCost,
      wasteCount: wasteMonth.count,
      month: {
        revenue: monthSales.revenue,
        orders: monthSales.orders,
        expenses: monthExpenses.total,
        expenseCount: monthExpenses.count,
        waste: wasteMonth.totalCost,
        netProfit: monthNetProfit,
      },
      monthExpenses: {
        total: monthExpenses.total,
        count: monthExpenses.count,
      },
      topProducts,
      recentOrders,
      supplierDues: dues.totalDue,
    })
  } catch (err) {
    console.error('dashboard error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
