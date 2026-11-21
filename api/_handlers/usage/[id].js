/**
 * DELETE /api/usage/:id — cancel a manual usage record.
 * Reverses the stock deduction with an immutable `manual_usage_reversal`
 * movement and marks the record cancelled (never hard-deleted).
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { addStock, MOVEMENT_TYPES } from '../../_lib/stock.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Usage id is required.' })

  try {
    const [record] = await db
      .select()
      .from(schema.manualUsageRecords)
      .where(eq(schema.manualUsageRecords.id, id))
      .limit(1)
    if (!record) return sendJson(res, 404, { error: 'Usage record not found.' })
    if (record.status === 'cancelled') {
      return sendJson(res, 400, { error: 'This usage record is already cancelled.' })
    }

    await db.transaction(async (tx) => {
      await addStock(tx, {
        ingredientId: record.ingredientId,
        quantityBase: record.quantityBase,
        movementType: MOVEMENT_TYPES.MANUAL_USAGE_REVERSAL,
        userId: user.id,
        notes: `Manual usage cancelled (${record.reason})`,
        unitCostPoisha: record.unitCostPoisha,
      })
      await tx
        .update(schema.manualUsageRecords)
        .set({ status: 'cancelled', cancelledBy: user.id, cancelledAt: new Date() })
        .where(eq(schema.manualUsageRecords.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'usage.cancel',
      entity: 'manual_usage',
      entityId: id,
    })

    return sendJson(res, 200, { ok: true })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('usage cancel error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}