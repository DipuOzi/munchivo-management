/**
 * GET  /api/expense-categories — list active categories with usage counts
 * POST /api/expense-categories — create a category
 */
import { asc, eq, ilike, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const categories = await db
        .select({
          id: schema.expenseCategories.id,
          name: schema.expenseCategories.name,
          isActive: schema.expenseCategories.isActive,
          expenseCount: sql`(
            SELECT COUNT(*)::int FROM expenses e
            WHERE e.category_id = ${schema.expenseCategories.id}
              AND e.status = 'confirmed'
          )`,
        })
        .from(schema.expenseCategories)
        .where(eq(schema.expenseCategories.isActive, true))
        .orderBy(asc(schema.expenseCategories.name))

      return sendJson(res, 200, { categories })
    }

    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Category name is required.' })
    if (name.length > 80) {
      return sendJson(res, 400, { error: 'Category name is too long.' })
    }

    const existing = await db
      .select({ id: schema.expenseCategories.id })
      .from(schema.expenseCategories)
      .where(ilike(schema.expenseCategories.name, name))
      .limit(1)
    if (existing.length > 0) {
      return sendJson(res, 409, { error: 'This category already exists.' })
    }

    const [category] = await db
      .insert(schema.expenseCategories)
      .values({ name })
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'expense_category.create',
      entity: 'expense_category',
      entityId: category.id,
      details: { name },
    })

    return sendJson(res, 201, { category })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'This category already exists.' })
    }
    console.error('expense categories error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
