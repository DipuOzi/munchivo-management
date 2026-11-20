/**
 * DELETE /api/waste/:id — cancel a waste record: stock is returned and
 * the record is marked cancelled (history kept — audit trail is immutable).
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { addStock, MOVEMENT_TYPES } from '../_lib/stock.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Waste record id is required.' })

  try {
    const [record] = await db
      .select()
      .from(schema.wasteRecords)
      .where(eq(schema.wasteRecords.id, id))
      .limit(1)
    if (!record) return sendJson(res, 404, { error: 'Waste record not found.' })
    if (record.status === 'cancelled') {
      return sendJson(res, 400, { error: 'This waste record is already cancelled.' })
    }

    await db.transaction(async (tx) => {
      if (record.ingredientId) {
        await addStock(tx, {
          ingredientId: record.ingredientId,
          quantityBase: record.quantityBase,
          movementType: MOVEMENT_TYPES.WASTE_REVERSAL,
          userId: user.id,
          notes: 'Waste record cancelled',
        })
      } else if (record.productId) {
        // Return to prepared stock — attach to the newest active batch.
        const [batch] = await tx
          .select()
          .from(schema.preparedStock)
          .where(eq(schema.preparedStock.productId, record.productId))
          .limit(1)
        if (batch) {
          await tx
            .update(schema.preparedStock)
            .set({
              quantityRemainingBase: batch.quantityRemainingBase + record.quantityBase,
              status: 'active',
            })
            .where(eq(schema.preparedStock.id, batch.id))
        }
      }

      await tx
        .update(schema.wasteRecords)
        .set({ status: 'cancelled', cancelledAt: new Date() })
        .where(eq(schema.wasteRecords.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'waste.cancel',
      entity: 'waste_record',
      entityId: id,
    })
    return sendJson(res, 200, { ok: true })
  } catch (err) {
    console.error('waste detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
