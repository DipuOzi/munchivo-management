/**
 * GET  /api/categories  — product categories (with product counts)
 * POST /api/categories  — create custom category
 */
import { asc, eq, sql } from 'drizzle-orm'
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
      const rows = await db
        .select({
          id: schema.productCategories.id,
          name: schema.productCategories.name,
          productCount: sql`(
            SELECT COUNT(*)::int FROM products p
            WHERE p.category_id = ${schema.productCategories.id} AND p.status = 'active'
          )`,
        })
        .from(schema.productCategories)
        .orderBy(asc(schema.productCategories.name))
      return sendJson(res, 200, { categories: rows })
    }

    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Category name is required.' })

    const [category] = await db
      .insert(schema.productCategories)
      .values({ name })
      .returning()

    return sendJson(res, 201, { category })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'This category already exists.' })
    }
    console.error('categories error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
