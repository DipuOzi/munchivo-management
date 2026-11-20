/**
 * PATCH  /api/expenses/:id — edit an expense (or mark it paid/unpaid)
 * DELETE /api/expenses/:id — cancel an expense (history is preserved)
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { takaToPoisha } from '../../src/shared/units.js'

const PAYMENT_METHODS = ['cash', 'bkash', 'nagad', 'bank', 'other']

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '')
}

export default async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Expense id is required.' })

  try {
    const [existing] = await db
      .select()
      .from(schema.expenses)
      .where(eq(schema.expenses.id, id))
      .limit(1)
    if (!existing) return sendJson(res, 404, { error: 'Expense not found.' })

    if (req.method === 'DELETE') {
      if (existing.status === 'cancelled') {
        return sendJson(res, 400, { error: 'This expense is already cancelled.' })
      }
      await db
        .update(schema.expenses)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(schema.expenses.id, id))

      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'expense.cancel',
        entity: 'expense',
        entityId: id,
      })
      return sendJson(res, 200, { ok: true })
    }

    if (existing.status === 'cancelled') {
      return sendJson(res, 400, { error: 'Cancelled expenses cannot be edited.' })
    }

    const body = await readJson(req)
    const updates = { updatedAt: new Date() }

    if (body.description !== undefined) {
      const description = (body.description || '').trim()
      if (!description) {
        return sendJson(res, 400, { error: 'Description cannot be empty.' })
      }
      updates.description = description
    }

    if (body.expenseDate !== undefined) {
      if (!isDate(body.expenseDate)) {
        return sendJson(res, 400, { error: 'A valid expense date is required.' })
      }
      updates.expenseDate = body.expenseDate
    }

    if (body.amount !== undefined) {
      const amountPoisha = takaToPoisha(body.amount)
      if (!Number.isInteger(amountPoisha) || amountPoisha <= 0) {
        return sendJson(res, 400, { error: 'Amount must be greater than zero.' })
      }
      updates.amountPoisha = amountPoisha
    }

    if (body.categoryId !== undefined) {
      if (body.categoryId) {
        const [category] = await db
          .select({ id: schema.expenseCategories.id })
          .from(schema.expenseCategories)
          .where(eq(schema.expenseCategories.id, body.categoryId))
          .limit(1)
        if (!category) {
          return sendJson(res, 400, { error: 'Expense category not found.' })
        }
        updates.categoryId = body.categoryId
      } else {
        updates.categoryId = null
      }
    }

    if (body.paymentMethod !== undefined) {
      updates.paymentMethod = PAYMENT_METHODS.includes(body.paymentMethod)
        ? body.paymentMethod
        : 'cash'
    }

    if (body.isPaid !== undefined) {
      const isPaid = Boolean(body.isPaid)
      updates.isPaid = isPaid
      updates.paidAt = isPaid
        ? isDate(body.paidAt)
          ? body.paidAt
          : updates.expenseDate || existing.expenseDate
        : null
    } else if (body.paidAt !== undefined) {
      updates.paidAt = isDate(body.paidAt) ? body.paidAt : null
    }

    if (body.notes !== undefined) {
      updates.notes = body.notes?.trim() || null
    }

    const [expense] = await db
      .update(schema.expenses)
      .set(updates)
      .where(eq(schema.expenses.id, id))
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'expense.update',
      entity: 'expense',
      entityId: id,
    })

    return sendJson(res, 200, { expense })
  } catch (err) {
    console.error('expense detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
