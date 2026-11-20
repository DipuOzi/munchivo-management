/**
 * GET  /api/expenses  — list + summary for a date range
 * POST /api/expenses  — record an operating expense
 *
 * Query: start, end (YYYY-MM-DD), categoryId, status, paid, search
 * Body: { expenseDate, categoryId, description, amount (taka),
 *         paymentMethod, isPaid, paidAt?, notes? }
 */
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { takaToPoisha } from '../../../src/shared/units.js'

const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'bank', 'other']

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
}

function buildConditions(url, options = {}) {
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const categoryId = url.searchParams.get('categoryId')
  const status =
    options.statusOverride || url.searchParams.get('status') || 'all'
  const paid = url.searchParams.get('paid') || 'all'
  const search = (url.searchParams.get('search') || '').trim()

  const conditions = []
  if (start) conditions.push(gte(schema.expenses.expenseDate, start))
  if (end) conditions.push(lte(schema.expenses.expenseDate, end))
  if (categoryId) conditions.push(eq(schema.expenses.categoryId, categoryId))
  if (status !== 'all') conditions.push(eq(schema.expenses.status, status))
  if (paid === 'paid') conditions.push(eq(schema.expenses.isPaid, true))
  if (paid === 'unpaid') conditions.push(eq(schema.expenses.isPaid, false))
  if (search) {
    conditions.push(
      or(
        ilike(schema.expenses.description, `%${search}%`),
        ilike(schema.expenses.notes, `%${search}%`),
      ),
    )
  }
  return conditions
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
      const conditions = buildConditions(url)
      const where = conditions.length ? and(...conditions) : undefined

      // Summary always excludes cancelled records, even when the list is
      // showing cancelled history.
      const summaryConditions = buildConditions(url, {
        statusOverride: 'confirmed',
      })
      const summaryWhere = summaryConditions.length
        ? and(...summaryConditions)
        : undefined

      const rows = await db
        .select({
          id: schema.expenses.id,
          expenseDate: schema.expenses.expenseDate,
          categoryId: schema.expenses.categoryId,
          categoryName: schema.expenseCategories.name,
          description: schema.expenses.description,
          amountPoisha: schema.expenses.amountPoisha,
          paymentMethod: schema.expenses.paymentMethod,
          isPaid: schema.expenses.isPaid,
          paidAt: schema.expenses.paidAt,
          notes: schema.expenses.notes,
          status: schema.expenses.status,
          createdAt: schema.expenses.createdAt,
          creatorName: schema.users.name,
        })
        .from(schema.expenses)
        .leftJoin(
          schema.expenseCategories,
          eq(schema.expenses.categoryId, schema.expenseCategories.id),
        )
        .leftJoin(schema.users, eq(schema.expenses.createdBy, schema.users.id))
        .where(where)
        .orderBy(desc(schema.expenses.expenseDate), desc(schema.expenses.createdAt))
        .limit(500)

      const [summary] = await db
        .select({
          totalPoisha: sql`COALESCE(SUM(${schema.expenses.amountPoisha}), 0)::int`,
          paidPoisha: sql`COALESCE(SUM(CASE WHEN ${schema.expenses.isPaid} THEN ${schema.expenses.amountPoisha} ELSE 0 END), 0)::int`,
          unpaidPoisha: sql`COALESCE(SUM(CASE WHEN NOT ${schema.expenses.isPaid} THEN ${schema.expenses.amountPoisha} ELSE 0 END), 0)::int`,
          count: sql`COUNT(*)::int`,
          unpaidCount: sql`COUNT(*) FILTER (WHERE NOT ${schema.expenses.isPaid})::int`,
        })
        .from(schema.expenses)
        .where(summaryWhere)

      return sendJson(res, 200, { expenses: rows, summary })
    }

    // POST
    const body = await readJson(req)
    const description = (body.description || '').trim()
    if (!description) {
      return sendJson(res, 400, { error: 'Expense description is required.' })
    }

    const expenseDate = body.expenseDate
    if (!isDate(expenseDate)) {
      return sendJson(res, 400, { error: 'A valid expense date is required.' })
    }

    const amountPoisha = takaToPoisha(body.amount)
    if (!Number.isInteger(amountPoisha) || amountPoisha <= 0) {
      return sendJson(res, 400, { error: 'Amount must be greater than zero.' })
    }

    const paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod)
      ? body.paymentMethod
      : 'cash'
    const isPaid = body.isPaid !== false
    const paidAt = isPaid
      ? isDate(body.paidAt)
        ? body.paidAt
        : expenseDate
      : null

    let categoryId = body.categoryId || null
    if (categoryId) {
      const [category] = await db
        .select({ id: schema.expenseCategories.id })
        .from(schema.expenseCategories)
        .where(eq(schema.expenseCategories.id, categoryId))
        .limit(1)
      if (!category) {
        return sendJson(res, 400, { error: 'Expense category not found.' })
      }
    } else {
      categoryId = null
    }

    const [expense] = await db
      .insert(schema.expenses)
      .values({
        expenseDate,
        categoryId,
        description,
        amountPoisha,
        paymentMethod,
        isPaid,
        paidAt,
        notes: body.notes?.trim() || null,
        createdBy: user.id,
      })
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'expense.create',
      entity: 'expense',
      entityId: expense.id,
      details: { description, amountPoisha, expenseDate },
    })

    return sendJson(res, 201, { expense })
  } catch (err) {
    console.error('expenses error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
