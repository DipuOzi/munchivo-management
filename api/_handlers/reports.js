/**
 * GET /api/reports?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * One consolidated financial report:
 *   P&L summary, daily trend, payment mix, top products, expense
 *   breakdown, partner equity and balance-sheet-ish totals.
 */
import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { getBusinessSettings } from '../_lib/settings.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MAX_DAYS = 366

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

function monthStart() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function parseRange(url) {
  const start = url.searchParams.get('start') || monthStart()
  const end = url.searchParams.get('end') || isoToday()
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: 'Dates must use the YYYY-MM-DD format.' }
  }
  if (start > end) {
    return { error: 'Start date must be on or before the end date.' }
  }
  const days =
    Math.floor(
      (new Date(`${end}T00:00:00Z`) - new Date(`${start}T00:00:00Z`)) /
        (24 * 60 * 60 * 1000),
    ) + 1
  if (days > MAX_DAYS) {
    return { error: 'Please choose a range of one year or less.' }
  }
  return { start, end, days }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const url = new URL(req.url, 'http://x')
    const range = parseRange(url)
    if (range.error) return sendJson(res, 400, { error: range.error })

    const { start, end } = range
    const startStamp = new Date(`${start}T00:00:00`)
    const endStamp = new Date(`${end}T23:59:59.999`)

    const salesWhere = and(
      gte(schema.sales.saleDate, startStamp),
      lte(schema.sales.saleDate, endStamp),
      eq(schema.sales.status, 'confirmed'),
    )
    const expensesWhere = and(
      gte(schema.expenses.expenseDate, start),
      lte(schema.expenses.expenseDate, end),
      eq(schema.expenses.status, 'confirmed'),
    )
    const wasteWhere = and(
      gte(schema.wasteRecords.createdAt, startStamp),
      lte(schema.wasteRecords.createdAt, endStamp),
      eq(schema.wasteRecords.status, 'confirmed'),
    )

    const [[sales], [expense], [waste], [purchase]] = await Promise.all([
      db
        .select({
          grossSalesPoisha: sql`COALESCE(SUM(${schema.sales.subtotalPoisha}), 0)::int`,
          discountsPoisha: sql`COALESCE(SUM(${schema.sales.discountPoisha}), 0)::int`,
          refundsPoisha: sql`COALESCE(SUM(${schema.sales.refundPoisha}), 0)::int`,
          revenuePoisha: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
          cogsPoisha: sql`COALESCE(SUM(${schema.sales.cogsPoisha}), 0)::int`,
          orders: sql`COUNT(*)::int`,
        })
        .from(schema.sales)
        .where(salesWhere),
      db
        .select({
          totalPoisha: sql`COALESCE(SUM(${schema.expenses.amountPoisha}), 0)::int`,
          count: sql`COUNT(*)::int`,
          unpaidPoisha: sql`COALESCE(SUM(CASE WHEN NOT ${schema.expenses.isPaid} THEN ${schema.expenses.amountPoisha} ELSE 0 END), 0)::int`,
        })
        .from(schema.expenses)
        .where(expensesWhere),
      db
        .select({
          totalPoisha: sql`COALESCE(SUM(${schema.wasteRecords.estimatedCostPoisha}), 0)::int`,
          count: sql`COUNT(*)::int`,
        })
        .from(schema.wasteRecords)
        .where(wasteWhere),
      db
        .select({
          totalPoisha: sql`COALESCE(SUM(${schema.purchases.totalPoisha}), 0)::int`,
          count: sql`COUNT(*)::int`,
        })
        .from(schema.purchases)
        .where(
          and(
            gte(schema.purchases.purchaseDate, start),
            lte(schema.purchases.purchaseDate, end),
            eq(schema.purchases.status, 'confirmed'),
          ),
        ),
    ])

    const [[inventory], [dues]] = await Promise.all([
      db
        .select({
          valuePoisha: sql`COALESCE(SUM(${schema.ingredients.currentStockBase} * ${schema.ingredients.avgCostPoisha}), 0)::int`,
          itemCount: sql`COUNT(*)::int`,
        })
        .from(schema.ingredients)
        .where(eq(schema.ingredients.status, 'active')),
      db
        .select({
          totalPoisha: sql`COALESCE(SUM(${schema.purchases.totalPoisha} - ${schema.purchases.paidPoisha}), 0)::int`,
        })
        .from(schema.purchases)
        .where(eq(schema.purchases.status, 'confirmed')),
    ])

    // Daily trend — sales, expenses and waste grouped by calendar day.
    const [saleDays, expenseDays, wasteDays] = await Promise.all([
      db
        .select({
          day: sql`TO_CHAR(${schema.sales.saleDate}, 'YYYY-MM-DD')`,
          revenuePoisha: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
          cogsPoisha: sql`COALESCE(SUM(${schema.sales.cogsPoisha}), 0)::int`,
          orders: sql`COUNT(*)::int`,
        })
        .from(schema.sales)
        .where(salesWhere)
        .groupBy(sql`TO_CHAR(${schema.sales.saleDate}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${schema.sales.saleDate}, 'YYYY-MM-DD')`),
      db
        .select({
          day: sql`TO_CHAR(${schema.expenses.expenseDate}, 'YYYY-MM-DD')`,
          amountPoisha: sql`COALESCE(SUM(${schema.expenses.amountPoisha}), 0)::int`,
        })
        .from(schema.expenses)
        .where(expensesWhere)
        .groupBy(sql`TO_CHAR(${schema.expenses.expenseDate}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${schema.expenses.expenseDate}, 'YYYY-MM-DD')`),
      db
        .select({
          day: sql`TO_CHAR(${schema.wasteRecords.createdAt}, 'YYYY-MM-DD')`,
          amountPoisha: sql`COALESCE(SUM(${schema.wasteRecords.estimatedCostPoisha}), 0)::int`,
        })
        .from(schema.wasteRecords)
        .where(wasteWhere)
        .groupBy(sql`TO_CHAR(${schema.wasteRecords.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`TO_CHAR(${schema.wasteRecords.createdAt}, 'YYYY-MM-DD')`),
    ])

    const saleDayMap = new Map(saleDays.map((d) => [d.day, d]))
    const expenseDayMap = new Map(expenseDays.map((d) => [d.day, d]))
    const wasteDayMap = new Map(wasteDays.map((d) => [d.day, d]))

    const daily = []
    let cursor = new Date(`${start}T00:00:00Z`)
    const last = new Date(`${end}T00:00:00Z`)
    while (cursor <= last) {
      const day = cursor.toISOString().slice(0, 10)
      const s = saleDayMap.get(day)
      const e = expenseDayMap.get(day)
      const w = wasteDayMap.get(day)
      const revenue = s?.revenuePoisha || 0
      const cogs = s?.cogsPoisha || 0
      const expensesTotal = e?.amountPoisha || 0
      const wasteTotal = w?.amountPoisha || 0
      daily.push({
        day,
        revenuePoisha: revenue,
        cogsPoisha: cogs,
        expensesPoisha: expensesTotal,
        wastePoisha: wasteTotal,
        profitPoisha: revenue - cogs - expensesTotal - wasteTotal,
        orders: s?.orders || 0,
      })
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
    }

    const paymentMethods = await db
      .select({
        method: schema.sales.paymentMethod,
        revenuePoisha: sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)::int`,
        orders: sql`COUNT(*)::int`,
      })
      .from(schema.sales)
      .where(salesWhere)
      .groupBy(schema.sales.paymentMethod)
      .orderBy(
        desc(
          sql`COALESCE(SUM(${schema.sales.totalPoisha} - ${schema.sales.refundPoisha}), 0)`,
        ),
      )

    const topProducts = await db
      .select({
        productId: schema.saleItems.productId,
        name: schema.saleItems.productName,
        units: sql`COALESCE(SUM(${schema.saleItems.quantity}), 0)::int`,
        revenuePoisha: sql`COALESCE(SUM(${schema.saleItems.lineTotalPoisha}), 0)::int`,
        cogsPoisha: sql`COALESCE(SUM(${schema.saleItems.cogsPoisha}), 0)::int`,
      })
      .from(schema.saleItems)
      .innerJoin(schema.sales, eq(schema.saleItems.saleId, schema.sales.id))
      .where(salesWhere)
      .groupBy(schema.saleItems.productId, schema.saleItems.productName)
      .orderBy(desc(sql`COALESCE(SUM(${schema.saleItems.lineTotalPoisha}), 0)`))
      .limit(10)

    const expenseBreakdown = await db
      .select({
        categoryId: schema.expenseCategories.id,
        category: sql`COALESCE(${schema.expenseCategories.name}, 'Uncategorised')`,
        amountPoisha: sql`COALESCE(SUM(${schema.expenses.amountPoisha}), 0)::int`,
        count: sql`COUNT(*)::int`,
      })
      .from(schema.expenses)
      .leftJoin(
        schema.expenseCategories,
        eq(schema.expenses.categoryId, schema.expenseCategories.id),
      )
      .where(expensesWhere)
      .groupBy(schema.expenseCategories.id, schema.expenseCategories.name)
      .orderBy(desc(sql`COALESCE(SUM(${schema.expenses.amountPoisha}), 0)`))

    const partnerRows = await db
      .select({
        id: schema.partners.id,
        name: schema.partners.name,
        ownershipBasisPoints: schema.partners.ownershipBasisPoints,
        capitalPoisha: sql`COALESCE(SUM(CASE WHEN ${schema.partnerTransactions.type} = 'capital_contribution' AND ${schema.partnerTransactions.status} = 'confirmed' THEN ${schema.partnerTransactions.amountPoisha} ELSE 0 END), 0)::int`,
        drawingsPoisha: sql`COALESCE(SUM(CASE WHEN ${schema.partnerTransactions.type} = 'drawing' AND ${schema.partnerTransactions.status} = 'confirmed' THEN ${schema.partnerTransactions.amountPoisha} ELSE 0 END), 0)::int`,
        profitSharePoisha: sql`COALESCE(SUM(CASE WHEN ${schema.partnerTransactions.type} = 'profit_share' AND ${schema.partnerTransactions.status} = 'confirmed' THEN ${schema.partnerTransactions.amountPoisha} ELSE 0 END), 0)::int`,
        loansPoisha: sql`COALESCE(SUM(CASE WHEN ${schema.partnerTransactions.type} = 'loan' AND ${schema.partnerTransactions.status} = 'confirmed' THEN ${schema.partnerTransactions.amountPoisha} ELSE 0 END), 0)::int`,
        loanRepaymentsPoisha: sql`COALESCE(SUM(CASE WHEN ${schema.partnerTransactions.type} = 'loan_repayment' AND ${schema.partnerTransactions.status} = 'confirmed' THEN ${schema.partnerTransactions.amountPoisha} ELSE 0 END), 0)::int`,
      })
      .from(schema.partners)
      .leftJoin(
        schema.partnerTransactions,
        eq(schema.partners.id, schema.partnerTransactions.partnerId),
      )
      .where(eq(schema.partners.isActive, true))
      .groupBy(
        schema.partners.id,
        schema.partners.name,
        schema.partners.ownershipBasisPoints,
      )
      .orderBy(asc(schema.partners.name))

    const partners = partnerRows.map((p) => ({
      ...p,
      netPoisha:
        p.capitalPoisha +
        p.profitSharePoisha +
        p.loansPoisha -
        p.drawingsPoisha -
        p.loanRepaymentsPoisha,
    }))

    const grossProfitPoisha = sales.revenuePoisha - sales.cogsPoisha
    const netProfitPoisha =
      grossProfitPoisha - expense.totalPoisha - waste.totalPoisha
    const marginPct =
      sales.revenuePoisha > 0
        ? Math.round((netProfitPoisha / sales.revenuePoisha) * 1000) / 10
        : 0
    const grossMarginPct =
      sales.revenuePoisha > 0
        ? Math.round((grossProfitPoisha / sales.revenuePoisha) * 1000) / 10
        : 0

    const business = await getBusinessSettings()

    return sendJson(res, 200, {
      business: {
        businessName: business.businessName,
        currency: business.currency,
        timezone: business.timezone,
      },
      range: { start, end, days: range.days },
      summary: {
        ...sales,
        revenuePoisha: sales.revenuePoisha,
        grossProfitPoisha,
        grossMarginPct,
        expensesPoisha: expense.totalPoisha,
        expenseCount: expense.count,
        unpaidExpensesPoisha: expense.unpaidPoisha,
        wastePoisha: waste.totalPoisha,
        wasteCount: waste.count,
        netProfitPoisha,
        marginPct,
        purchasesPoisha: purchase.totalPoisha,
        purchaseCount: purchase.count,
        inventoryValuePoisha: inventory.valuePoisha,
        inventoryItemCount: inventory.itemCount,
        supplierDuesPoisha: dues.totalPoisha,
        averageOrderPoisha:
          sales.orders > 0 ? Math.round(sales.revenuePoisha / sales.orders) : 0,
      },
      daily,
      paymentMethods,
      topProducts,
      expenseBreakdown,
      partners,
    })
  } catch (err) {
    console.error('reports error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
