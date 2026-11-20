/**
 * GET  /api/partners — partners with ledger totals and ownership
 * POST /api/partners — add a partner
 *
 * Ownership is stored in basis points (100% = 10000). The API accepts
 * `ownershipPercent` from the UI (e.g. 33.33).
 */
import { asc, eq, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'

export function percentToBasisPoints(value) {
  const pct = Number(value)
  if (!Number.isFinite(pct)) return null
  return Math.round(pct * 100)
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const confirmed = (type) =>
        sql`COALESCE(SUM(CASE WHEN ${schema.partnerTransactions.type} = ${type} AND ${schema.partnerTransactions.status} = 'confirmed' THEN ${schema.partnerTransactions.amountPoisha} ELSE 0 END), 0)::int`

      const rows = await db
        .select({
          id: schema.partners.id,
          userId: schema.partners.userId,
          name: schema.partners.name,
          email: schema.partners.email,
          phone: schema.partners.phone,
          ownershipBasisPoints: schema.partners.ownershipBasisPoints,
          notes: schema.partners.notes,
          isActive: schema.partners.isActive,
          createdAt: schema.partners.createdAt,
          capitalPoisha: confirmed('capital_contribution'),
          drawingsPoisha: confirmed('drawing'),
          profitSharePoisha: confirmed('profit_share'),
          loansPoisha: confirmed('loan'),
          loanRepaymentsPoisha: confirmed('loan_repayment'),
          transactionCount: sql`COUNT(${schema.partnerTransactions.id}) FILTER (WHERE ${schema.partnerTransactions.status} = 'confirmed')::int`,
          netPoisha: sql`(
            ${confirmed('capital_contribution')}
            + ${confirmed('profit_share')}
            + ${confirmed('loan')}
            - ${confirmed('drawing')}
            - ${confirmed('loan_repayment')}
          )::int`,
        })
        .from(schema.partners)
        .leftJoin(
          schema.partnerTransactions,
          eq(schema.partners.id, schema.partnerTransactions.partnerId),
        )
        .groupBy(schema.partners.id)
        .orderBy(asc(schema.partners.name))

      const ownershipTotalBasisPoints = rows
        .filter((p) => p.isActive)
        .reduce((sum, p) => sum + p.ownershipBasisPoints, 0)

      return sendJson(res, 200, {
        partners: rows,
        ownershipTotalBasisPoints,
      })
    }

    // POST — create partner
    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Partner name is required.' })

    const ownershipBasisPoints = percentToBasisPoints(body.ownershipPercent ?? 0)
    if (
      ownershipBasisPoints === null ||
      ownershipBasisPoints < 0 ||
      ownershipBasisPoints > 10000
    ) {
      return sendJson(res, 400, { error: 'Ownership must be between 0% and 100%.' })
    }

    const existing = await db
      .select({ ownershipBasisPoints: schema.partners.ownershipBasisPoints })
      .from(schema.partners)
      .where(eq(schema.partners.isActive, true))
    const currentTotal = existing.reduce(
      (sum, p) => sum + p.ownershipBasisPoints,
      0,
    )
    if (currentTotal + ownershipBasisPoints > 10000) {
      return sendJson(res, 400, {
        error: `Ownership would exceed 100%. Current active total is ${(
          currentTotal / 100
        ).toFixed(2)}%.`,
      })
    }

    const email = body.email?.trim().toLowerCase() || null
    let userId = null
    if (email) {
      const [matchedUser] = await db
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(eq(schema.users.email, email))
        .limit(1)
      userId = matchedUser?.id || null
    }

    const [partner] = await db
      .insert(schema.partners)
      .values({
        userId,
        name,
        email,
        phone: body.phone?.trim() || null,
        ownershipBasisPoints,
        notes: body.notes?.trim() || null,
        createdBy: user.id,
      })
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'partner.create',
      entity: 'partner',
      entityId: partner.id,
      details: { name, ownershipBasisPoints },
    })

    return sendJson(res, 201, { partner })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'A partner with this email already exists.' })
    }
    console.error('partners error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
