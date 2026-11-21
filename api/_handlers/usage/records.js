/**
 * GET /api/usage/records — recent manual inventory usage records.
 */
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const url = new URL(req.url, 'http://x')
    const status = url.searchParams.get('status') || 'all'

    const conditions = []
    if (status !== 'all') conditions.push(eq(schema.manualUsageRecords.status, status))

    const rows = await db
      .select({
        id: schema.manualUsageRecords.id,
        quantityBase: schema.manualUsageRecords.quantityBase,
        unitCostPoisha: schema.manualUsageRecords.unitCostPoisha,
        reason: schema.manualUsageRecords.reason,
        notes: schema.manualUsageRecords.notes,
        status: schema.manualUsageRecords.status,
        createdAt: schema.manualUsageRecords.createdAt,
        ingredientName: schema.ingredients.name,
        ingredientUnit: schema.ingredients.displayUnit,
        recorderName: schema.users.name,
      })
      .from(schema.manualUsageRecords)
      .leftJoin(
        schema.ingredients,
        eq(schema.manualUsageRecords.ingredientId, schema.ingredients.id),
      )
      .leftJoin(
        schema.users,
        eq(schema.manualUsageRecords.recordedBy, schema.users.id),
      )
      .where(conditions.length ? conditions[0] : undefined)
      .orderBy(desc(schema.manualUsageRecords.createdAt))
      .limit(200)

    return sendJson(res, 200, { records: rows })
  } catch (err) {
    console.error('usage records error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}