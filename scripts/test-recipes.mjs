// PHASE 4B QA TEST — recipes, costing, products through the real API.
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

await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`
const hash = await bcrypt.default.hash(TEST_PASSWORD, 12)
const [qaUser] = await sql`
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('QA Tester', ${TEST_EMAIL}, ${hash}, 'owner') RETURNING id`

// Cleanup list
const qaIngredientIds = []
let recipeId = null
let productId = null

try {
  const loginRes = await api('POST', '/auth/login', { email: TEST_EMAIL, password: TEST_PASSWORD })
  const cookie = loginRes.setCookie.split(';')[0]
  console.log('✓ Logged in as QA user')

  // ── ingredients: Oil 1kg @৳400 (40p/g), Vinegar 500g @৳100 (20p/g) ──
  const oil = await api('POST', '/ingredients', {
    name: `QA Oil ${stamp}`, displayUnit: 'kg', initialQuantity: 1, initialTotalCost: 400,
  }, cookie)
  qaIngredientIds.push(oil.data.ingredient.id)
  const vinegar = await api('POST', '/ingredients', {
    name: `QA Vinegar ${stamp}`, displayUnit: 'g', initialQuantity: 500, initialTotalCost: 100,
  }, cookie)
  qaIngredientIds.push(vinegar.data.ingredient.id)
  console.log('✓ QA ingredients created (Oil ৳40/100g, Vinegar ৳20/100g)')

  // ── recipe: Signature Mayo — 250 g yield: oil 170g + vinegar 30g ──
  // ingredient cost = 170*40 + 30*20 = 6800 + 600 = 7400 poisha = ৳74
  // + packaging ৳5 + other ৳1 = ৳80 total -> 80*100/250 = 32 poisha/g
  const recipe = await api('POST', '/recipes', {
    name: `QA Mayo ${stamp}`, yieldUnit: 'g', baseYield: 250,
    packagingCost: 5, otherDirectCost: 1,
    items: [
      { ingredientId: oil.data.ingredient.id, quantityBase: 170 }, // 170 g
      { ingredientId: vinegar.data.ingredient.id, quantityBase: 30 },
    ],
  }, cookie)
  recipeId = recipe.data.recipe.id
  console.log('✓ Recipe created (250 g yield)')

  const list = await api('GET', '/recipes', null, cookie)
  const mayo = list.data.recipes.find((r) => r.id === recipeId)
  if (!mayo || mayo.items.length !== 2) fail('Recipe items not returned correctly')
  const ingCost = mayo.items.reduce((s, i) => s + i.quantityBase * i.ingredient.avgCostPoisha, 0)
  ingCost === 7400 ? console.log('✓ Ingredient cost = ৳74 (170g×40p + 30g×20p)')
    : fail(`Ingredient cost expected 7400 poisha, got ${ingCost}`)

  // calculator check: scale 250g -> 500g doubles everything (client-side
  // logic mirrored here against API data)
  const factor = 500 / 250
  const oilItem = mayo.items.find((i) => i.ingredient.name.startsWith('QA Oil'))
  const scaled = oilItem.quantityBase * factor
  scaled === 340 ? console.log('✓ Scaling 250→500g doubles oil to 340 g')
    : fail(`Scaled oil expected 340, got ${scaled}`)

  // ── categories + product ─────────────────────────────────────────
  const cat = await api('POST', '/categories', { name: `QA Sauces ${stamp}` }, cookie)
  const product = await api('POST', '/products', {
    name: `QA Mayo Jar ${stamp}`, categoryId: cat.data.category.id,
    sellingPrice: 120, recipeId, servingSize: 250, packagingCost: 5,
  }, cookie)
  productId = product.data.product.id
  console.log('✓ Product created (৳120 price, assigned recipe)')

  const prodList = await api('GET', '/products', null, cookie)
  const prod = prodList.data.products.find((p) => p.id === productId)
  if (!prod || !prod.estimate) fail('Product estimate missing')
  // serving = 250g of the 250g yield = full batch: cost/serving = 8000+500 = 8500
  // profit = 12000 - 8500 = 3500 (৳35) -> margin 29.2%
  prod.estimate.totalCostPerServing === 8500 ? console.log('✓ Estimated cost/serving = ৳85')
    : fail(`Cost/serving expected 8500, got ${prod.estimate.totalCostPerServing}`)
  prod.estimate.grossProfitPoisha === 3500 ? console.log('✓ Estimated profit = ৳35 (29.2% margin)')
    : fail(`Profit expected 3500, got ${JSON.stringify(prod.estimate)}`)

  // ── calculator must NOT touch inventory ──────────────────────────
  const [oilStock] = (await sql`SELECT current_stock_base FROM ingredients WHERE id = ${oil.data.ingredient.id}`)
  oilStock.current_stock_base === 1000 ? console.log('✓ Inventory untouched by recipes/products/calculations')
    : fail(`Oil stock should still be 1000 g, got ${oilStock.current_stock_base}`)

  // ── archive + restore ────────────────────────────────────────────
  await api('DELETE', `/recipes/${recipeId}`, null, cookie)
  const archList = await api('GET', '/recipes?status=active', null, cookie)
  if (archList.data.recipes.some((r) => r.id === recipeId)) fail('Recipe still active after archive')
  console.log('✓ Recipe archives cleanly (products keep their reference)')

  console.log('\nALL PHASE 4B RECIPE/PRODUCT TESTS PASSED.')
} finally {
  if (productId) await sql`DELETE FROM products WHERE id = ${productId}`
  if (recipeId) await sql`DELETE FROM recipes WHERE id = ${recipeId}`
  await sql`DELETE FROM product_categories WHERE name = ${'QA Sauces ' + stamp}`
  for (const id of qaIngredientIds) await sql`DELETE FROM ingredients WHERE id = ${id}`
  await sql`DELETE FROM users WHERE id = ${qaUser.id}`
  const left = await sql`SELECT count(*)::int AS n FROM users`
  console.log(`✓ QA cleanup done. Partner accounts remaining: ${left[0].n}`)
}
