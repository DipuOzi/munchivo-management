/**
 * LOCAL DEVELOPMENT API SERVER
 *
 * In production on Vercel, every file in /api becomes a serverless
 * function automatically. Locally, Vite cannot run those functions,
 * so this tiny Node server mounts the exact same handlers on the
 * exact same routes — no extra framework, dev-only.
 *
 * The Vite dev server proxies /api/* to http://localhost:3001.
 * Supports Vercel-style dynamic params: /api/ingredients/:id.
 */
import { createServer } from 'node:http'
import { config } from 'dotenv'

// Load env BEFORE importing any module that touches the database.
// (Static ESM imports are hoisted, so we must import dynamically.)
config({ path: '.env.local' })
config({ path: '.env' })

if (!process.env.DATABASE_URL) {
  console.error(
    '✗ DATABASE_URL is not set. Create .env.local in the project root first.',
  )
  process.exit(1)
}

const { default: login } = await import('../api/auth/login.js')
const { default: logout } = await import('../api/auth/logout.js')
const { default: me } = await import('../api/auth/me.js')
const { default: ingredientsIndex } = await import('../api/ingredients/index.js')
const { default: ingredientDetail } = await import('../api/ingredients/[id].js')
const { default: stockAdjust } = await import('../api/stock/adjust.js')
const { default: suppliersIndex } = await import('../api/suppliers/index.js')
const { default: supplierDetail } = await import('../api/suppliers/[id].js')
const { default: purchasesIndex } = await import('../api/purchases/index.js')
const { default: purchaseDetail } = await import('../api/purchases/[id].js')
const { default: purchasePayments } = await import('../api/purchases/[id]/payments.js')
const { default: recipesIndex } = await import('../api/recipes/index.js')
const { default: recipeDetail } = await import('../api/recipes/[id].js')
const { default: productsIndex } = await import('../api/products/index.js')
const { default: productDetail } = await import('../api/products/[id].js')
const { default: categories } = await import('../api/categories.js')
const { default: productionIndex } = await import('../api/production/index.js')
const { default: productionDetail } = await import('../api/production/[id].js')
const { default: salesIndex } = await import('../api/sales/index.js')
const { default: saleDetail } = await import('../api/sales/[id].js')
const { default: saleRefunds } = await import('../api/sales/[id]/refunds.js')
const { default: wasteIndex } = await import('../api/waste/index.js')
const { default: wasteDetail } = await import('../api/waste/[id].js')
const { default: expiry } = await import('../api/expiry.js')
const { default: dashboard } = await import('../api/dashboard.js')
const { default: notifications } = await import('../api/notifications.js')
const { default: vapidPublic } = await import('../api/push/vapid-public.js')
const { default: pushSubscribe } = await import('../api/push/subscribe.js')
const { default: pushTest } = await import('../api/push/test.js')
const { default: expensesIndex } = await import('../api/expenses/index.js')
const { default: expenseDetail } = await import('../api/expenses/[id].js')
const { default: expenseCategories } = await import('../api/expense-categories.js')
const { default: partnersIndex } = await import('../api/partners/index.js')
const { default: partnerDetail } = await import('../api/partners/[id].js')
const { default: partnerTransactions } = await import(
  '../api/partners/[id]/transactions.js'
)
const { default: partnerTransactionDetail } = await import(
  '../api/partners/[id]/transactions/[transactionId].js'
)
const { default: reports } = await import('../api/reports.js')
const { default: settingsIndex } = await import('../api/settings/index.js')
const { default: settingsProfile } = await import('../api/settings/profile.js')
const { default: settingsBusiness } = await import('../api/settings/business.js')
const { default: settingsPassword } = await import('../api/settings/password.js')
const { default: cronDaily } = await import('../api/cron/daily.js')

const PORT = process.env.API_DEV_PORT || 3001

/** route: [method, '/api/path/:id', handler] */
const routes = [
  ['POST', '/api/auth/login', login],
  ['POST', '/api/auth/logout', logout],
  ['GET', '/api/auth/me', me],
  ['GET', '/api/ingredients', ingredientsIndex],
  ['POST', '/api/ingredients', ingredientsIndex],
  ['GET', '/api/ingredients/:id', ingredientDetail],
  ['PATCH', '/api/ingredients/:id', ingredientDetail],
  ['DELETE', '/api/ingredients/:id', ingredientDetail],
  ['POST', '/api/stock/adjust', stockAdjust],
  ['GET', '/api/suppliers', suppliersIndex],
  ['POST', '/api/suppliers', suppliersIndex],
  ['PATCH', '/api/suppliers/:id', supplierDetail],
  ['DELETE', '/api/suppliers/:id', supplierDetail],
  ['GET', '/api/purchases', purchasesIndex],
  ['POST', '/api/purchases', purchasesIndex],
  ['GET', '/api/purchases/:id', purchaseDetail],
  ['PATCH', '/api/purchases/:id', purchaseDetail],
  ['DELETE', '/api/purchases/:id', purchaseDetail],
  ['POST', '/api/purchases/:id/payments', purchasePayments],
  ['GET', '/api/recipes', recipesIndex],
  ['POST', '/api/recipes', recipesIndex],
  ['GET', '/api/recipes/:id', recipeDetail],
  ['PATCH', '/api/recipes/:id', recipeDetail],
  ['DELETE', '/api/recipes/:id', recipeDetail],
  ['GET', '/api/products', productsIndex],
  ['POST', '/api/products', productsIndex],
  ['PATCH', '/api/products/:id', productDetail],
  ['DELETE', '/api/products/:id', productDetail],
  ['GET', '/api/categories', categories],
  ['POST', '/api/categories', categories],
  ['GET', '/api/production', productionIndex],
  ['POST', '/api/production', productionIndex],
  ['GET', '/api/production/:id', productionDetail],
  ['DELETE', '/api/production/:id', productionDetail],
  ['GET', '/api/sales', salesIndex],
  ['POST', '/api/sales', salesIndex],
  ['GET', '/api/sales/:id', saleDetail],
  ['DELETE', '/api/sales/:id', saleDetail],
  ['POST', '/api/sales/:id/refunds', saleRefunds],
  ['GET', '/api/waste', wasteIndex],
  ['POST', '/api/waste', wasteIndex],
  ['DELETE', '/api/waste/:id', wasteDetail],
  ['GET', '/api/expiry', expiry],
  ['GET', '/api/dashboard', dashboard],
  ['GET', '/api/notifications', notifications],
  ['POST', '/api/notifications', notifications],
  ['GET', '/api/push/vapid-public', vapidPublic],
  ['POST', '/api/push/subscribe', pushSubscribe],
  ['DELETE', '/api/push/subscribe', pushSubscribe],
  ['POST', '/api/push/test', pushTest],
  ['GET', '/api/expenses', expensesIndex],
  ['POST', '/api/expenses', expensesIndex],
  ['PATCH', '/api/expenses/:id', expenseDetail],
  ['DELETE', '/api/expenses/:id', expenseDetail],
  ['GET', '/api/expense-categories', expenseCategories],
  ['POST', '/api/expense-categories', expenseCategories],
  ['GET', '/api/partners', partnersIndex],
  ['POST', '/api/partners', partnersIndex],
  ['PATCH', '/api/partners/:id', partnerDetail],
  ['DELETE', '/api/partners/:id', partnerDetail],
  ['GET', '/api/partners/:id/transactions', partnerTransactions],
  ['POST', '/api/partners/:id/transactions', partnerTransactions],
  ['DELETE', '/api/partners/:id/transactions/:transactionId', partnerTransactionDetail],
  ['GET', '/api/reports', reports],
  ['GET', '/api/settings', settingsIndex],
  ['PATCH', '/api/settings/profile', settingsProfile],
  ['PATCH', '/api/settings/business', settingsBusiness],
  ['PUT', '/api/settings/business', settingsBusiness],
  ['POST', '/api/settings/password', settingsPassword],
  ['GET', '/api/cron/daily', cronDaily],
  ['POST', '/api/cron/daily', cronDaily],
]

function match(method, pathname) {
  for (const [routeMethod, routePath, handler] of routes) {
    if (routeMethod !== method) continue
    const routeSegs = routePath.split('/')
    const pathSegs = pathname.split('/')
    if (routeSegs.length !== pathSegs.length) continue
    const params = {}
    const matched = routeSegs.every((seg, i) => {
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = decodeURIComponent(pathSegs[i])
        return true
      }
      return seg === pathSegs[i]
    })
    if (matched) return { handler, params }
  }
  return null
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const matched = match(req.method, url.pathname)

  if (!matched) {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Not found.' }))
    return
  }

  req.params = matched.params
  try {
    await matched.handler(req, res)
  } catch (err) {
    console.error(`[api] ${url.pathname} failed:`, err)
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json' })
    }
    res.end(JSON.stringify({ error: 'Internal server error.' }))
  }
})

server.listen(PORT, () => {
  console.log(`[api] Local API server running at http://localhost:${PORT}`)
})
