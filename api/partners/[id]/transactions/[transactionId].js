/**
 * DELETE /api/partners/:id/transactions/:transactionId
 * Cancels a ledger entry; history is preserved.
 */
import { and, eq } from 'drizzle-orm'
import { db, schema } from '../../../../src/db/index.js'
import { sendJson } from '../../../_lib/http.js'
import { withAuth } from '../../../_lib/guard.js'

export default async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const partnerId = req.params?.id || req.query?.id
  const transactionId =
    req.params?.transactionId || req.query?.transactionId
  if (!partnerId || !transactionId) {
    return sendJson(res, 400, { error: 'Partner and transaction are required.' })
  }

  try {
    const [transaction] = await db
      .select()
      .from(schema.partnerTransactions)
      .where(
        and(
          eq(schema.partnerTransactions.id, transactionId),
          eq(schema.partnerTransactions.partnerId, partnerId),
        ),
      )
      .limit(1)

    if (!transaction) {
      return sendJson(res, 404, { error: 'Ledger entry not found.' })
    }
    if (transaction.status === 'cancelled') {
      return sendJson(res, 400, { error: 'This entry is already cancelled.' })
    }

    await db
      .update(schema.partnerTransactions)
      .set({
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: user.id,
      })
      .where(eq(schema.partnerTransactions.id, transactionId))

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'partner_transaction.cancel',
      entity: 'partner_transaction',
      entityId: transactionId,
      details: { partnerId },
    })

    return sendJson(res, 200, { ok: true })
  } catch (err) {
    console.error('partner transaction cancel error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
