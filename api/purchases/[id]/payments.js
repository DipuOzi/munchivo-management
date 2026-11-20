/**
 * POST /api/purchases/:id/payments — record a partial payment
 * Body: { amount (taka), paymentMethod, paidAt, notes? }
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { takaToPoisha } from '../../../src/shared/units.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Purchase id is required.' })

  try {
    const body = await readJson(req)
    const amount = takaToPoisha(body.amount)
    if (amount <= 0) {
      return sendJson(res, 400, { error: 'Payment amount must be greater than zero.' })
    }

    const [purchase] = await db
      .select()
      .from(schema.purchases)
      .where(eq(schema.purchases.id, id))
      .limit(1)

    if (!purchase) return sendJson(res, 404, { error: 'Purchase not found.' })
    if (purchase.status !== 'confirmed') {
      return sendJson(res, 400, { error: 'Cannot pay a cancelled purchase.' })
    }

    const due = purchase.totalPoisha - purchase.paidPoisha
    if (amount > due) {
      return sendJson(res, 400, {
        error: `Payment exceeds the outstanding due (৳${(due / 100).toLocaleString()}).`,
      })
    }

    const paidAt = /^\d{4}-\d{2}-\d{2}$/.test(body.paidAt || '')
      ? body.paidAt
      : new Date().toISOString().slice(0, 10)

    await db.transaction(async (tx) => {
      await tx.insert(schema.purchasePayments).values({
        purchaseId: id,
        amountPoisha: amount,
        paymentMethod: body.paymentMethod || 'cash',
        paidAt,
        recordedBy: user.id,
        notes: body.notes?.trim() || null,
      })
      await tx
        .update(schema.purchases)
        .set({ paidPoisha: purchase.paidPoisha + amount, updatedAt: new Date() })
        .where(eq(schema.purchases.id, id))
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'purchase.payment',
      entity: 'purchase',
      entityId: id,
      details: { amountPoisha: amount },
    })

    return sendJson(res, 201, { ok: true })
  } catch (err) {
    console.error('payment error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
