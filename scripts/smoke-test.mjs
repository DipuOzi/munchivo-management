/**
 * End-to-end smoke test for the API.
 *
 * Usage:
 *   1. npm run api:dev        (in one terminal)
 *   2. npm run smoke           (in another)
 *
 * Creates a temporary session for the first active user, exercises every
 * module (expenses, partners, reports, settings), removes all test data,
 * and leaves business settings exactly as they were.
 */
import { createHash, randomBytes } from 'node:crypto'
import { config } from 'dotenv'
import { eq, inArray } from 'drizzle-orm'

config({ path: '.env.local' })
config({ path: '.env' })

const BASE = process.env.SMOKE_BASE_URL || 'http://localhost:3001'
const { db, schema } = await import('../src/db/index.js')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/auth/me`)
      if (res.status) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`API server did not start at ${BASE}`)
}

const token = randomBytes(48).toString('base64url')
const tokenHash = createHash('sha256').update(token).digest('hex')
let userId = null
let businessBackup = null
let businessExisted = false

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `mv_session=${token}`,
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  let data = null
  try {
    data = await res.json()
  } catch {
    data = null
  }
  return { status: res.status, data }
}

async function main() {
  await waitForServer()

  const [user] = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.isActive, true))
    .limit(1)
  if (!user) throw new Error('No active user found to test with.')
  userId = user.id

  await db.insert(schema.sessions).values({
    userId,
    tokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    userAgent: 'munchivo-smoke-test',
  })

  // Preserve any existing business settings document.
  const [settingsRow] = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'business'))
    .limit(1)
  businessExisted = Boolean(settingsRow)
  businessBackup = settingsRow?.value || null

  /* ---------------- reads ---------------- */
  const me = await call('/api/auth/me')
  check('GET /api/auth/me', me.status === 200 && me.data?.user?.id === userId)

  const settings = await call('/api/settings')
  check(
    'GET /api/settings',
    settings.status === 200 && Array.isArray(settings.data?.team),
  )

  const categories = await call('/api/expense-categories')
  check(
    'GET /api/expense-categories',
    categories.status === 200 && categories.data?.categories?.length >= 10,
  )

  const partners = await call('/api/partners')
  check(
    'GET /api/partners',
    partners.status === 200 && Array.isArray(partners.data?.partners),
  )

  const reports = await call('/api/reports')
  check(
    'GET /api/reports',
    reports.status === 200 && Array.isArray(reports.data?.daily),
    reports.data?.summary
      ? `net ${reports.data.summary.netProfitPoisha} poisha`
      : reports.data?.error,
  )

  const dashboard = await call('/api/dashboard')
  check(
    'GET /api/dashboard',
    dashboard.status === 200 && typeof dashboard.data?.month?.netProfit === 'number',
    dashboard.data?.error,
  )

  const expiryData = await call('/api/expiry')
  check(
    'GET /api/expiry',
    expiryData.status === 200 && Array.isArray(expiryData.data?.ingredientBatches),
    expiryData.data?.error,
  )

  const notifications = await call('/api/notifications')
  check(
    'GET /api/notifications',
    notifications.status === 200 && Array.isArray(notifications.data?.notifications),
    notifications.data?.error,
  )

  /* ---------------- expenses ---------------- */
  const catName = `Smoke test ${Date.now()}`
  const cat = await call('/api/expense-categories', {
    method: 'POST',
    body: { name: catName },
  })
  check('POST /api/expense-categories', cat.status === 201)
  const categoryId = cat.data?.category?.id

  const expense = await call('/api/expenses', {
    method: 'POST',
    body: {
      description: 'Smoke test expense',
      amount: 123.45,
      expenseDate: new Date().toISOString().slice(0, 10),
      categoryId,
      paymentMethod: 'cash',
      isPaid: false,
      notes: 'Temporary QA record',
    },
  })
  check(
    'POST /api/expenses',
    expense.status === 201 && expense.data?.expense?.amountPoisha === 12345,
  )
  const expenseId = expense.data?.expense?.id

  const patched = await call(`/api/expenses/${expenseId}`, {
    method: 'PATCH',
    body: { isPaid: true, amount: 150 },
  })
  check(
    'PATCH /api/expenses/:id',
    patched.status === 200 &&
      patched.data?.expense?.isPaid === true &&
      patched.data.expense.amountPoisha === 15000,
  )

  const expenseList = await call('/api/expenses?search=Smoke%20test%20expense')
  check(
    'GET /api/expenses (search + summary)',
    expenseList.status === 200 &&
      expenseList.data?.expenses?.length === 1 &&
      expenseList.data?.summary?.totalPoisha === 15000,
  )

  const cancelled = await call(`/api/expenses/${expenseId}`, { method: 'DELETE' })
  check('DELETE /api/expenses/:id (soft cancel)', cancelled.status === 200)

  /* ---------------- partners ---------------- */
  const partner = await call('/api/partners', {
    method: 'POST',
    body: {
      name: `Smoke Partner ${Date.now()}`,
      email: `smoke-${Date.now()}@example.com`,
      ownershipPercent: 0,
      notes: 'Temporary QA record',
    },
  })
  check('POST /api/partners', partner.status === 201)
  const partnerId = partner.data?.partner?.id

  const txn = await call(`/api/partners/${partnerId}/transactions`, {
    method: 'POST',
    body: {
      type: 'capital_contribution',
      amount: 5000,
      transactionDate: new Date().toISOString().slice(0, 10),
      description: 'Smoke test capital',
    },
  })
  check(
    'POST /api/partners/:id/transactions',
    txn.status === 201 && txn.data?.transaction?.amountPoisha === 500000,
  )
  const txnId = txn.data?.transaction?.id

  const partnerList = await call('/api/partners')
  const listed = partnerList.data?.partners?.find((p) => p.id === partnerId)
  check(
    'GET /api/partners (ledger totals)',
    listed?.capitalPoisha === 500000 && listed?.netPoisha === 500000,
  )

  const txnList = await call(`/api/partners/${partnerId}/transactions`)
  check(
    'GET /api/partners/:id/transactions',
    txnList.status === 200 && txnList.data?.transactions?.length === 1,
  )

  const txnCancel = await call(
    `/api/partners/${partnerId}/transactions/${txnId}`,
    { method: 'DELETE' },
  )
  check('DELETE partner ledger entry', txnCancel.status === 200)

  const partnerOff = await call(`/api/partners/${partnerId}`, {
    method: 'PATCH',
    body: { isActive: false },
  })
  check('PATCH /api/partners/:id', partnerOff.status === 200)

  /* ---------------- settings ---------------- */
  const business = await call('/api/settings/business', {
    method: 'PATCH',
    body: { businessName: 'Munchivo QA', expiryAlertDays: 9 },
  })
  check(
    'PATCH /api/settings/business',
    business.status === 200 &&
      business.data?.business?.businessName === 'Munchivo QA' &&
      business.data.business.expiryAlertDays === 9,
  )

  const badDays = await call('/api/settings/business', {
    method: 'PATCH',
    body: { expiryAlertDays: 0 },
  })
  check('Business validation rejects 0 alert days', badDays.status === 400)

  const reportsAfter = await call(
    `/api/reports?start=${new Date().toISOString().slice(0, 10)}&end=${new Date()
      .toISOString()
      .slice(0, 10)}`,
  )
  check(
    'GET /api/reports (date range)',
    reportsAfter.status === 200 && reportsAfter.data?.range?.days === 1,
  )

  /* ---------------- cleanup ---------------- */
  if (partnerId) {
    await db
      .delete(schema.partnerTransactions)
      .where(eq(schema.partnerTransactions.partnerId, partnerId))
    await db.delete(schema.partners).where(eq(schema.partners.id, partnerId))
  }
  if (expenseId) {
    await db.delete(schema.expenses).where(eq(schema.expenses.id, expenseId))
  }
  if (categoryId) {
    await db
      .delete(schema.expenseCategories)
      .where(inArray(schema.expenseCategories.id, [categoryId]))
  }
  if (businessExisted) {
    await db
      .update(schema.systemSettings)
      .set({ value: businessBackup, updatedAt: new Date() })
      .where(eq(schema.systemSettings.key, 'business'))
  } else {
    await db
      .delete(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'business'))
  }
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash))

  const failed = results.filter((r) => !r.ok)
  console.log(
    `\n${failed.length === 0 ? '✓ All checks passed' : `✗ ${failed.length} check(s) failed`} (${results.length} total)`,
  )
  if (failed.length > 0) process.exitCode = 1
}

try {
  await main()
} catch (err) {
  console.error('\n✗ Smoke test crashed:', err)
  process.exitCode = 1
  // Best-effort cleanup of the temporary session.
  try {
    await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash))
  } catch {
    // ignore
  }
} finally {
  process.exit(process.exitCode || 0)
}
