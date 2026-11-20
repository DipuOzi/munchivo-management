/**
 * GET  /api/partners/:id/transactions — ledger entries for one partner
 * POST /api/partners/:id/transactions — add capital, drawing, profit share,
 *                                        loan or loan repayment
 */
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { takaToPoisha } from '../../../src/shared/units.js'

export const TRANSACTION_TYPES = [
  'capital_contribution',
  'drawing',
  'profit_share',
  'loan',
  'loan_repayment',
]

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const partnerId = req.params?.id || req.query?.id
  if (!partnerId) return sendJson(res, 400, { error: 'Partner id is required.' })

  try {
    const [partner] = await db
      .select()
      .from(schema.partners)
      .where(eq(schema.partners.id, partnerId))
      .limit(1)
    if (!partner) return sendJson(res, 404, { error: 'Partner not found.' })

    if (req.method === 'GET') {
      const transactions = await db
        .select({
          id: schema.partnerTransactions.id,
          partnerId: schema.partnerTransactions.partnerId,
          type: schema.partnerTransactions.type,
          amountPoisha: schema.partnerTransactions.amountPoisha,
          transactionDate: schema.partnerTransactions.transactionDate,
          description: schema.partnerTransactions.description,
          status: schema.partnerTransactions.status,
          cancelledAt: schema.partnerTransactions.cancelledAt,
          createdAt: schema.partnerTransactions.createdAt,
          recorderName: schema.users.name,
        })
        .from(schema.partnerTransactions)
        .leftJoin(
          schema.users,
          eq(schema.partnerTransactions.recordedBy, schema.users.id),
        )
        .where(eq(schema.partnerTransactions.partnerId, partnerId))
        .orderBy(
          desc(schema.partnerTransactions.transactionDate),
          desc(schema.partnerTransactions.createdAt),
        )
        .limit(300)

      return sendJson(res, 200, { partner, transactions })
    }

    if (!partner.isActive) {
      return sendJson(res, 400, {
        error: 'Reactivate this partner before adding ledger entries.',
      })
    }

    const body = await readJson(req)
    if (!TRANSACTION_TYPES.includes(body.type)) {
      return sendJson(res, 400, { error: 'Please choose a valid ledger type.' })
    }

    const amountPoisha = takaToPoisha(body.amount)
    if (!Number.isInteger(amountPoisha) || amountPoisha <= 0) {
      return sendJson(res, 400, { error: 'Amount must be greater than zero.' })
    }

    const transactionDate = body.transactionDate
    if (!isDate(transactionDate)) {
      return sendJson(res, 400, { error: 'A valid transaction date is required.' })
    }

    const [transaction] = await db
      .insert(schema.partnerTransactions)
      .values({
        partnerId,
        type: body.type,
        amountPoisha,
        transactionDate,
        description: body.description?.trim() || null,
        recordedBy: user.id,
      })
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'partner_transaction.create',
      entity: 'partner_transaction',
      entityId: transaction.id,
      details: { partnerId, type: body.type, amountPoisha },
    })

    return sendJson(res, 201, { transaction })
  } catch (err) {
    console.error('partner transactions error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
