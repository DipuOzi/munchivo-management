/**
 * GET  /api/suppliers  — list with outstanding dues
 * POST /api/suppliers  — create
 */
import { asc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'

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
          id: schema.suppliers.id,
          name: schema.suppliers.name,
          phone: schema.suppliers.phone,
          address: schema.suppliers.address,
          category: schema.suppliers.category,
          notes: schema.suppliers.notes,
          isActive: schema.suppliers.isActive,
          createdAt: schema.suppliers.createdAt,
          // outstanding due = confirmed purchases total - payments made
          totalPurchasedPoisha: sql`COALESCE(purch.total, 0)::int`,
          paidPoisha: sql`COALESCE(purch.paid, 0)::int`,
          duePoisha: sql`(COALESCE(purch.total, 0) - COALESCE(purch.paid, 0))::int`,
        })
        .from(schema.suppliers)
        .leftJoin(
          sql`(
            SELECT supplier_id,
                   SUM(total_poisha) AS total,
                   SUM(paid_poisha) AS paid
            FROM purchases
            WHERE status = 'confirmed'
            GROUP BY supplier_id
          ) AS purch`,
          sql`purch.supplier_id = ${schema.suppliers.id}`,
        )
        .orderBy(asc(schema.suppliers.name))
      return sendJson(res, 200, { suppliers: rows })
    }

    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Supplier name is required.' })

    const [supplier] = await db
      .insert(schema.suppliers)
      .values({
        name,
        phone: body.phone?.trim() || null,
        address: body.address?.trim() || null,
        category: body.category?.trim() || null,
        notes: body.notes?.trim() || null,
      })
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'supplier.create',
      entity: 'supplier',
      entityId: supplier.id,
    })

    return sendJson(res, 201, { supplier })
  } catch (err) {
    console.error('suppliers error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
