/**
 * POST /api/sales/:id/refunds — record a full or partial refund.
 * Financial effect only (reduces revenue); perishable goods are not
 * returned to inventory (documented rule).
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../../src/db/index.js'
import { readJson, sendJson } from '../../../_lib/http.js'
import { withAuth } from '../../../_lib/guard.js'
import { takaToPoisha } from '../../../../src/shared/units.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Sale id is required.' })

  try {
    const body = await readJson(req)
    const amount = takaToPoisha(body.amount)
    if (amount <= 0) return sendJson(res, 400, { error: 'Refund amount must be greater than zero.' })

    const [sale] = await db.select().from(schema.sales).where(eq(schema.sales.id, id)).limit(1)
    if (!sale) return sendJson(res, 404, { error: 'Sale not found.' })
    if (sale.status !== 'confirmed') {
      return sendJson(res, 400, { error: 'Cancelled sales cannot be refunded.' })
    }

    const refundable = sale.totalPoisha - sale.refundPoisha
    if (amount > refundable) {
      return sendJson(res, 400, {
        error: `Refund exceeds the refundable amount (৳${(refundable / 100).toLocaleString()}).`,
      })
    }

    await db.transaction(async (tx) => {
      await tx.insert(schema.saleRefunds).values({
        saleId: id,
        amountPoisha: amount,
        reason: body.reason?.trim() || null,
        recordedBy: user.id,
      })
      await tx
        .update(schema.sales)
        .set({ refundPoisha: sale.refundPoisha + amount })
        .where(eq(schema.sales.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'sale.refund',
      entity: 'sale',
      entityId: id,
      details: { amountPoisha: amount },
    })
    return sendJson(res, 201, { ok: true })
  } catch (err) {
    console.error('refund error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
