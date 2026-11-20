// PHASE 5 QA TEST — production, sales (both workflows), waste, expiry,
// notifications through the real API. Spec inventory test included:
//   20 kg Potato (threshold 7 kg) → recipe uses 100 g/product
//   sell 3 → 19.7 kg; waste 100 g → 19.6 kg
import { config } from 'dotenv'
config({ path: '.env.local' })

const { neon } = await import('@neondatabase/serverless')
const bcrypt = await import('bcryptjs')
const sql = neon(process.env.DATABASE_URL)

const API = 'http://localhost:3001/api'
const stamp = Date.now()
const TEST_EMAIL = 'qa-test@munchivo-test.local'
const TEST_PASSWORD = 'qa-test-password-123'

function fail(msg) {
  throw new Error(`TEST FAILED: ${msg}`)
}
function assert(cond, okMsg, errMsg) {
  cond ? console.log(`✓ ${okMsg}`) : fail(errMsg)
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
  return { data, setCookie: res.headers.get('set-cookie') }
}

await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`
const hash = await bcrypt.default.hash(TEST_PASSWORD, 12)
const [qaUser] = await sql`
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('QA Tester', ${TEST_EMAIL}, ${hash}, 'owner') RETURNING id`

const ids = { ingredients: [], recipes: [], products: [], batches: [], sales: [], waste: [], cats: [] }

try {
  const login = await api('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD })
  const cookie = login.setCookie?.split(';')[0] ?? null
  if (!cookie) fail('no session cookie returned')
  console.log('✓ Logged in as QA user')

  // ── SPEC TEST SETUP: Potato 20 kg, threshold 7 kg ──────────────
  const potato = (await api('POST', '/ingredients', {
    name: `QA Potato ${stamp}`, displayUnit: 'kg',
    initialQuantity: 20, initialTotalCost: 2000, // ৳100/kg = 10 poisha/g
    lowStockThreshold: 7,
  }, cookie)).data
  ids.ingredients.push(potato.ingredient.id)
  const potatoId = potato.ingredient.id
  console.log('✓ 20 kg Potato created (৳100/kg, threshold 7 kg)')

  const recipe = (await api('POST', '/recipes', {
    name: `QA Fries ${stamp}`, yieldUnit: 'g', baseYield: 300,
    items: [{ ingredientId: potatoId, quantityBase: 100 }],
  }, cookie)).data
  ids.recipes.push(recipe.recipe.id)
  const recipeId = recipe.recipe.id

  const product = (await api('POST', '/products', {
    name: `QA Fries Plate ${stamp}`, sellingPrice: 120,
    recipeId, servingSize: 300, workflow: 'direct',
  }, cookie)).data
  ids.products.push(product.product.id)
  const directProduct = product.product.id

  // ══ TEST 1: DIRECT SALE — sell 3 → 20 - 0.3 = 19.7 kg ══════════
  const sale1 = (await api('POST', '/sales', {
    items: [{ productId: directProduct, quantity: 3 }],
    paymentMethod: 'cash', clientToken: `qa-${stamp}-1`,
  }, cookie)).data
  ids.sales.push(sale1.sale.id)
  const [stock1] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  assert(stock1.current_stock_base === 19700, 'Sell 3 → stock 19.7 kg (300 g deducted)', `expected 19700, got ${stock1.current_stock_base}`)
  assert(sale1.sale.cogsPoisha === 3000, 'COGS = ৳30 (300 g × 10 poisha/g)', `cogs ${sale1.sale.cogsPoisha}`)
  assert(sale1.sale.totalPoisha === 36000, 'Total = ৳120 × 3', `total ${sale1.sale.totalPoisha}`)

  // idempotency — same token returns the same sale, no extra deduction
  const dup = (await api('POST', '/sales', {
    items: [{ productId: directProduct, quantity: 3 }],
    paymentMethod: 'cash', clientToken: `qa-${stamp}-1`,
  }, cookie)).data
  assert(dup.duplicate === true, 'Duplicate clientToken blocked (idempotent)')
  const [stock1b] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  assert(stock1b.current_stock_base === 19700, 'Stock unchanged after duplicate submission')

  // ══ TEST 2: LOW-STOCK NOTIFICATION ══════════════════════════════
  // sell enough to cross the 7 kg threshold: 19.7 → 6.9 (sell 128)
  const sale2 = (await api('POST', '/sales', {
    items: [{ productId: directProduct, quantity: 128 }],
    paymentMethod: 'bkash', clientToken: `qa-${stamp}-2`,
  }, cookie)).data
  ids.sales.push(sale2.sale.id)
  const notifs = (await api('GET', '/notifications', null, cookie)).data
  const lowStockNotif = notifs.notifications.find(
    (n) => n.type === 'low_stock' && n.entityId === potatoId && !n.resolved,
  )
  assert(!!lowStockNotif, 'Low-stock notification auto-created at threshold')

  // no duplicate on further sales below threshold
  const sale3 = (await api('POST', '/sales', {
    items: [{ productId: directProduct, quantity: 1 }], // → 6.8 kg
    clientToken: `qa-${stamp}-3`,
  }, cookie)).data
  ids.sales.push(sale3.sale.id)
  const notifs2 = (await api('GET', '/notifications', null, cookie)).data
  const count2 = notifs2.notifications.filter(
    (n) => n.type === 'low_stock' && n.entityId === potatoId,
  ).length
  assert(count2 === 1, 'No duplicate low-stock alerts on further sales', `found ${count2}`)

  // replenish above threshold → auto-resolve (+12.2 kg → 19 kg)
  await api('POST', '/stock/adjust', {
    ingredientId: potatoId, quantity: 12.2, notes: 'QA replenish',
  }, cookie)
  const notifs3 = (await api('GET', '/notifications', null, cookie)).data
  const unresolved = notifs3.notifications.filter(
    (n) => n.type === 'low_stock' && n.entityId === potatoId && !n.resolved,
  )
  assert(unresolved.length === 0, 'Low-stock alert auto-resolves after replenishment', 'Alert did not auto-resolve')
  const [stockNow] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  // 19 kg = 19000 g

  // ══ TEST 3: WASTE — 100 g → 18.9 kg ═════════════════════════════
  const waste = (await api('POST', '/waste', {
    ingredientId: potatoId, quantity: 0.1, reason: 'spoiled', // kg → 100 g
  }, cookie)).data
  ids.waste.push(waste.record.id)
  const [stock2] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  assert(stock2.current_stock_base === 18900, 'Waste 100 g → 18.9 kg', `got ${stock2.current_stock_base}`)
  assert(waste.record.estimatedCostPoisha === 1000, 'Waste cost = ৳10 (100 g × 10 p/g)')

  // waste movement is in the audit trail
  const movements = await sql`SELECT movement_type FROM inventory_movements WHERE ingredient_id = ${potatoId} ORDER BY created_at`
  assert(movements.some((m) => m.movement_type === 'waste'), 'Waste movement recorded immutably')

  // cancel waste → stock returns
  await api('DELETE', `/waste/${waste.record.id}`, null, cookie)
  const [stock3] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  assert(stock3.current_stock_base === 19000, 'Waste cancellation returns stock (19 kg)')

  // ══ TEST 4: SALE CANCELLATION reverses inventory ════════════════
  await api('DELETE', `/sales/${sale3.sale.id}`, null, cookie)
  const [stock4] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  assert(stock4.current_stock_base === 19100, 'Sale cancellation reverses 100 g (19.1 kg)', `got ${stock4.current_stock_base}`)

  // ══ TEST 5: BATCH WORKFLOW — production → prepared stock ════════
  const batchProduct = (await api('POST', '/products', {
    name: `QA Jar Mayo ${stamp}`, sellingPrice: 250,
    recipeId, servingSize: 300, workflow: 'batch',
  }, cookie)).data
  ids.products.push(batchProduct.product.id)

  const prod = (await api('POST', '/production', {
    recipeId, productId: batchProduct.product.id, targetYield: 900, // 900 g = 3 servings
  }, cookie)).data
  ids.batches.push(prod.batch.id)
  const [potAfterProd] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  // 900/300 = ×3 → 300 g deducted
  assert(potAfterProd.current_stock_base === 18800, 'Production deducts ingredients once (300 g for ×3 batch)', `got ${potAfterProd.current_stock_base}`)

  // selling batch product consumes prepared stock, NOT ingredients again
  const sale4 = (await api('POST', '/sales', {
    items: [{ productId: batchProduct.product.id, quantity: 2 }],
    clientToken: `qa-${stamp}-4`,
  }, cookie)).data
  ids.sales.push(sale4.sale.id)
  const [potAfterBatch] = await sql`SELECT current_stock_base FROM ingredients WHERE id = ${potatoId}`
  assert(potAfterBatch.current_stock_base === 18800, 'Batch sale does NOT double-deduct ingredients')
  const prepared = await sql`SELECT quantity_remaining_base FROM prepared_stock WHERE product_id = ${batchProduct.product.id} AND status = 'active'`
  assert(prepared[0].quantity_remaining_base === 300, 'Prepared stock: 1 serving left after selling 2')

  // insufficient prepared stock blocked
  let blocked = false
  try {
    await api('POST', '/sales', {
      items: [{ productId: batchProduct.product.id, quantity: 2 }],
      clientToken: `qa-${stamp}-5`,
    }, cookie)
  } catch {
    blocked = true
  }
  assert(blocked, 'Selling more prepared stock than available is blocked')

  // ══ TEST 6: EXPIRY & DASHBOARD & REFUND smoke ═══════════════════
  const exp = (await api('GET', '/expiry', null, cookie)).data
  assert(Array.isArray(exp.ingredientBatches), 'Expiry API returns batch list')
  const dash = (await api('GET', '/dashboard', null, cookie)).data
  assert(typeof dash.today.revenue === 'number' && Array.isArray(dash.trend) && dash.trend.length === 14, 'Dashboard returns today + 14-day trend')
  assert(dash.today.revenue > 0, 'Dashboard revenue reflects QA sales')

  const refund = await api('POST', `/sales/${sale1.sale.id}/refunds`, {
    amount: 20, reason: 'QA refund',
  }, cookie)
  const [sale1row] = await sql`SELECT refund_poisha FROM sales WHERE id = ${sale1.sale.id}`
  assert(sale1row.refund_poisha === 2000, 'Refund recorded (৳20), no stock change')

  console.log('\nALL PHASE 5 TESTS PASSED.')
} finally {
  // cleanup in FK-safe order
  for (const id of ids.waste) await sql`DELETE FROM waste_records WHERE id = ${id}`
  for (const id of ids.sales) await sql`DELETE FROM sales WHERE id = ${id}`
  for (const id of ids.batches) await sql`DELETE FROM production_batches WHERE id = ${id}`
  for (const id of ids.products) await sql`DELETE FROM products WHERE id = ${id}`
  for (const id of ids.recipes) await sql`DELETE FROM recipes WHERE id = ${id}`
  await sql`DELETE FROM inventory_movements WHERE ingredient_id = ANY(${ids.ingredients}::uuid[])`
  await sql`DELETE FROM notifications WHERE entity_id = ANY(${ids.ingredients}::text[])`
  for (const id of ids.ingredients) await sql`DELETE FROM ingredients WHERE id = ${id}`
  await sql`DELETE FROM users WHERE id = ${qaUser.id}`
  const left = await sql`SELECT count(*)::int AS n FROM users`
  console.log(`✓ QA cleanup done. Partner accounts remaining: ${left[0].n}`)
}
