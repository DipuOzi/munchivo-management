// PHASE 4A QA TEST — full inventory/purchase lifecycle through the real API.
// Uses temporary QA records, all removed at the end.
import { config } from 'dotenv'
config({ path: '.env.local' })

const { neon } = await import('@neondatabase/serverless')
const bcrypt = await import('bcryptjs')
const sql = neon(process.env.DATABASE_URL)

const API = 'http://localhost:3001/api'
const stamp = Date.now()
const ING = `QA Potato ${stamp}`
const SUP = `QA Supplier ${stamp}`
const TEST_EMAIL = 'qa-test@munchivo-test.local'
const TEST_PASSWORD = 'qa-test-password-123'

function fail(msg) {
  throw new Error(`TEST FAILED: ${msg}`)
}

async function api(method, path, body, cookie) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error || '?'}`)
  return { status: res.status, data, setCookie: res.headers.get('set-cookie') }
}

// ── setup: temporary QA user + login ────────────────────────────────
await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`
const hash = await bcrypt.default.hash(TEST_PASSWORD, 12)
const [qaUser] = await sql`
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('QA Tester', ${TEST_EMAIL}, ${hash}, 'owner') RETURNING id`

let cookie
try {
  const loginRes = await api('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD })
  cookie = loginRes.setCookie.split(';')[0]
  console.log('✓ Logged in as QA user')

  // ── 1. create supplier ────────────────────────────────────────────
  const { data: supData } = await api('POST', '/suppliers', { name: SUP, phone: '01700000000' }, cookie)
  const supplierId = supData.supplier.id
  console.log('✓ Supplier created')

  // ── 2. create ingredient: 20 kg, ৳1,000, threshold 7 kg, min 5 kg ──
  const { data: ingData } = await api('POST', '/ingredients', {
    name: ING, category: 'Vegetables', displayUnit: 'kg',
    initialQuantity: 20, initialTotalCost: 1000,
    lowStockThreshold: 7, minStock: 5, supplierId, trackExpiry: false,
  }, cookie)
  const ingId = ingData.ingredient.id
  console.log('✓ Ingredient created (20 kg, ৳1,000 opening stock)')

  let [ing] = (await sql`SELECT current_stock_base, avg_cost_poisha FROM ingredients WHERE id = ${ingId}`)
  ing.current_stock_base === 20000 ? console.log('✓ Stock = 20,000 g (20 kg)')
    : fail(`Stock expected 20000, got ${ing.current_stock_base}`)
  ing.avg_cost_poisha === 5 ? console.log('✓ Avg cost = 5 poisha/g (৳50/kg)')
    : fail(`Avg cost expected 5, got ${ing.avg_cost_poisha}`)

  // ── 3. purchase 10 kg for ৳600 → stock 30 kg, weighted avg ────────
  const today = new Date().toISOString().slice(0, 10)
  const { data: purData } = await api('POST', '/purchases', {
    purchaseDate: today, supplierId, paymentMethod: 'bkash', initialPaid: 200,
    items: [{ ingredientId: ingId, quantity: 10, displayUnit: 'kg', lineTotal: 600 }],
  }, cookie)
  const purId = purData.purchase.id
  console.log('✓ Purchase created (10 kg, ৳600, ৳200 paid)')

  ;[ing] = (await sql`SELECT current_stock_base, avg_cost_poisha FROM ingredients WHERE id = ${ingId}`)
  ing.current_stock_base === 30000 ? console.log('✓ Stock after purchase = 30 kg')
    : fail(`Stock expected 30000, got ${ing.current_stock_base}`)
  // weighted avg: (20000*5 + 10000*6)/30000 = 5.333 -> 5
  ing.avg_cost_poisha === 5 ? console.log('✓ Weighted avg cost recalculated correctly')
    : fail(`Weighted avg expected 5, got ${ing.avg_cost_poisha}`)

  // due should be 400
  const { data: purDetail } = await api('GET', `/purchases/${purId}`, null, cookie)
  purDetail.purchase.paidPoisha === 20000 ? console.log('✓ Partial payment recorded (৳200 paid, ৳400 due)')
    : fail(`Paid expected 20000 poisha, got ${purDetail.purchase.paidPoisha}`)

  // ── 4. edit purchase: 10 kg -> 12 kg @ same rate (৳720) ───────────
  await api('PATCH', `/purchases/${purId}`, {
    purchaseDate: today, supplierId,
    items: [{ ingredientId: ingId, quantity: 12, displayUnit: 'kg', lineTotal: 720 }],
  }, cookie)
  ;[ing] = (await sql`SELECT current_stock_base FROM ingredients WHERE id = ${ingId}`)
  ing.current_stock_base === 32000 ? console.log('✓ Purchase edit: reversal + reapply correct (stock 32 kg)')
    : fail(`Stock after edit expected 32000, got ${ing.current_stock_base}`)

  const reversals = await sql`SELECT count(*)::int AS n FROM inventory_movements WHERE ingredient_id = ${ingId} AND movement_type = 'purchase_reversal'`
  reversals[0].n >= 1 ? console.log('✓ Reversal movement recorded for the edit')
    : fail('No purchase_reversal movement after edit')

  // ── 5. record another partial payment ৳300 ────────────────────────
  await api('POST', `/purchases/${purId}/payments`, { amount: 300, paymentMethod: 'cash' }, cookie)
  const [pur] = (await sql`SELECT paid_poisha, total_poisha FROM purchases WHERE id = ${purId}`)
  pur.paid_poisha === 50000 ? console.log('✓ Second payment recorded (৳500 paid of ৳720)')
    : fail(`Paid expected 50000, got ${pur.paid_poisha}`)

  // overpay must be rejected
  const overRes = await fetch(`${API}/purchases/${purId}/payments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ amount: 999 }),
  })
  overRes.status === 400 ? console.log('✓ Overpayment rejected')
    : fail(`Overpayment should 400, got ${overRes.status}`)

  // ── 6. supplier dues ──────────────────────────────────────────────
  const { data: supList } = await api('GET', '/suppliers', null, cookie)
  const sup = supList.suppliers.find((s) => s.id === supplierId)
  sup.duePoisha === 22000 ? console.log('✓ Supplier due = ৳220 (720 - 500)')
    : fail(`Supplier due expected 22000, got ${sup.duePoisha}`)

  // ── 7. cancel purchase → reversal, stock back to opening 20 kg ────
  await api('DELETE', `/purchases/${purId}`, { notes: 'QA cancel' }, cookie)
  ;[ing] = (await sql`SELECT current_stock_base FROM ingredients WHERE id = ${ingId}`)
  ing.current_stock_base === 20000 ? console.log('✓ Purchase cancelled: stock reversed to 20 kg opening')
    : fail(`Stock after cancel expected 20000, got ${ing.current_stock_base}`)

  // ── 8. negative-stock adjustment must be blocked ──────────────────
  await api('POST', '/stock/adjust', { ingredientId: ingId, quantity: -20, displayUnit: 'kg', notes: 'QA drain' }, cookie)
  const negRes = await fetch(`${API}/stock/adjust`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ ingredientId: ingId, quantity: -5, displayUnit: 'kg' }),
  })
  negRes.status === 400 ? console.log('✓ Negative stock adjustment blocked')
    : fail(`Negative adjust should 400, got ${negRes.status}`)

  // cancelling again must fail (already cancelled)
  const recancel = await fetch(`${API}/purchases/${purId}`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({}),
  })
  recancel.status === 400 ? console.log('✓ Double cancellation blocked')
    : fail(`Re-cancel should 400, got ${recancel.status}`)

  // ── 10. audit trail preserved (no hard deletes) ───────────────────
  const movements = await sql`SELECT count(*)::int AS n FROM inventory_movements WHERE ingredient_id = ${ingId}`
  movements[0].n >= 6 ? console.log(`✓ Full movement history preserved (${movements[0].n} rows)`)
    : fail(`Expected >= 6 movements, got ${movements[0].n}`)

  console.log('\nALL PHASE 4A INVENTORY TESTS PASSED.')
} finally {
  // ── cleanup: remove ALL QA data ───────────────────────────────────
  await sql`DELETE FROM purchases WHERE supplier_id = ${await sql`SELECT id FROM suppliers WHERE name = ${SUP}`.then((r) => r[0]?.id ?? '00000000-0000-0000-0000-000000000000')}`
  await sql`DELETE FROM ingredients WHERE name = ${ING}`
  await sql`DELETE FROM suppliers WHERE name = ${SUP}`
  await sql`DELETE FROM users WHERE id = ${qaUser.id}`
  const left = await sql`SELECT count(*)::int AS n FROM users`
  console.log(`✓ QA cleanup done. Partner accounts remaining: ${left[0].n}`)
}
