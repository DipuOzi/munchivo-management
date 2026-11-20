/**
 * SINGLE-ENTRY API ROUTER
 *
 * Vercel's Hobby plan allows at most 12 serverless functions per
 * deployment, and every file inside /api becomes its own function.
 * The whole back office therefore ships as ONE function: api/index.js.
 *
 * vercel.json rewrites /api/<anything> to /api?__route=<anything>, and
 * this router maps that path onto the matching handler module, exactly
 * like the local dev server does. Handlers live in api/_handlers/ and
 * api/_lib/ — directories prefixed with "_" are ignored by Vercel, so
 * they do not create extra functions.
 *
 * Route handlers are `export default async function handler(req, res)`
 * with Node's request/response objects, i.e. the Vercel Node signature.
 */
import { sendJson } from './http.js'

/** [method, '/api/path/:id', () => import(handler module)] */
const routes = [
  ['POST', '/api/auth/login', () => import('../_handlers/auth/login.js')],
  ['POST', '/api/auth/logout', () => import('../_handlers/auth/logout.js')],
  ['GET', '/api/auth/me', () => import('../_handlers/auth/me.js')],
  ['GET', '/api/ingredients', () => import('../_handlers/ingredients/index.js')],
  ['POST', '/api/ingredients', () => import('../_handlers/ingredients/index.js')],
  ['GET', '/api/ingredients/:id', () => import('../_handlers/ingredients/[id].js')],
  ['PATCH', '/api/ingredients/:id', () => import('../_handlers/ingredients/[id].js')],
  ['DELETE', '/api/ingredients/:id', () => import('../_handlers/ingredients/[id].js')],
  ['POST', '/api/stock/adjust', () => import('../_handlers/stock/adjust.js')],

  ['GET', '/api/purchases', () => import('../_handlers/purchases/index.js')],
  ['POST', '/api/purchases', () => import('../_handlers/purchases/index.js')],
  ['GET', '/api/purchases/:id', () => import('../_handlers/purchases/[id].js')],
  ['PATCH', '/api/purchases/:id', () => import('../_handlers/purchases/[id].js')],
  ['DELETE', '/api/purchases/:id', () => import('../_handlers/purchases/[id].js')],
  ['POST', '/api/purchases/:id/payments', () => import('../_handlers/purchases/[id]/payments.js')],
  ['GET', '/api/recipes', () => import('../_handlers/recipes/index.js')],
  ['POST', '/api/recipes', () => import('../_handlers/recipes/index.js')],
  ['GET', '/api/recipes/:id', () => import('../_handlers/recipes/[id].js')],
  ['PATCH', '/api/recipes/:id', () => import('../_handlers/recipes/[id].js')],
  ['DELETE', '/api/recipes/:id', () => import('../_handlers/recipes/[id].js')],
  ['GET', '/api/products', () => import('../_handlers/products/index.js')],
  ['POST', '/api/products', () => import('../_handlers/products/index.js')],
  ['PATCH', '/api/products/:id', () => import('../_handlers/products/[id].js')],
  ['DELETE', '/api/products/:id', () => import('../_handlers/products/[id].js')],
  ['GET', '/api/categories', () => import('../_handlers/categories.js')],
  ['POST', '/api/categories', () => import('../_handlers/categories.js')],
  ['GET', '/api/production', () => import('../_handlers/production/index.js')],
  ['POST', '/api/production', () => import('../_handlers/production/index.js')],
  ['GET', '/api/production/:id', () => import('../_handlers/production/[id].js')],
  ['DELETE', '/api/production/:id', () => import('../_handlers/production/[id].js')],
  ['GET', '/api/sales', () => import('../_handlers/sales/index.js')],
  ['POST', '/api/sales', () => import('../_handlers/sales/index.js')],
  ['GET', '/api/sales/:id', () => import('../_handlers/sales/[id].js')],
  ['DELETE', '/api/sales/:id', () => import('../_handlers/sales/[id].js')],
  ['POST', '/api/sales/:id/refunds', () => import('../_handlers/sales/[id]/refunds.js')],
  ['GET', '/api/waste', () => import('../_handlers/waste/index.js')],
  ['POST', '/api/waste', () => import('../_handlers/waste/index.js')],
  ['DELETE', '/api/waste/:id', () => import('../_handlers/waste/[id].js')],
  ['GET', '/api/expiry', () => import('../_handlers/expiry.js')],
  ['GET', '/api/dashboard', () => import('../_handlers/dashboard.js')],
  ['GET', '/api/notifications', () => import('../_handlers/notifications.js')],
  ['POST', '/api/notifications', () => import('../_handlers/notifications.js')],
  ['GET', '/api/push/vapid-public', () => import('../_handlers/push/vapid-public.js')],
  ['POST', '/api/push/subscribe', () => import('../_handlers/push/subscribe.js')],
  ['DELETE', '/api/push/subscribe', () => import('../_handlers/push/subscribe.js')],
  ['POST', '/api/push/test', () => import('../_handlers/push/test.js')],
  ['GET', '/api/expenses', () => import('../_handlers/expenses/index.js')],
  ['POST', '/api/expenses', () => import('../_handlers/expenses/index.js')],
  ['PATCH', '/api/expenses/:id', () => import('../_handlers/expenses/[id].js')],
  ['DELETE', '/api/expenses/:id', () => import('../_handlers/expenses/[id].js')],
  ['GET', '/api/expense-categories', () => import('../_handlers/expense-categories.js')],
  ['POST', '/api/expense-categories', () => import('../_handlers/expense-categories.js')],
  ['GET', '/api/partners', () => import('../_handlers/partners/index.js')],
  ['POST', '/api/partners', () => import('../_handlers/partners/index.js')],
  ['PATCH', '/api/partners/:id', () => import('../_handlers/partners/[id].js')],
  ['DELETE', '/api/partners/:id', () => import('../_handlers/partners/[id].js')],
  [
    'GET',
    '/api/partners/:id/transactions',
    () => import('../_handlers/partners/[id]/transactions.js'),
  ],
  [
    'POST',
    '/api/partners/:id/transactions',
    () => import('../_handlers/partners/[id]/transactions.js'),
  ],
  [
    'DELETE',
    '/api/partners/:id/transactions/:transactionId',
    () => import('../_handlers/partners/[id]/transactions/[transactionId].js'),
  ],
  ['GET', '/api/reports', () => import('../_handlers/reports.js')],
  ['GET', '/api/settings', () => import('../_handlers/settings/index.js')],
  ['PATCH', '/api/settings/profile', () => import('../_handlers/settings/profile.js')],
  ['PATCH', '/api/settings/business', () => import('../_handlers/settings/business.js')],
  ['PUT', '/api/settings/business', () => import('../_handlers/settings/business.js')],
  ['POST', '/api/settings/password', () => import('../_handlers/settings/password.js')],
  ['GET', '/api/cron/daily', () => import('../_handlers/cron/daily.js')],
  ['POST', '/api/cron/daily', () => import('../_handlers/cron/daily.js')],
]

function match(method, pathname) {
  for (const [routeMethod, routePath, load] of routes) {
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
    if (matched) return { load, params }
  }
  return null
}

/**
 * Recover the real request path. When Vercel forwards /api/foo/1 to this
 * function through the vercel.json rewrite, the path arrives as
 * /api?__route=foo/1; the original query string is preserved. Handlers
 * read filters from `new URL(req.url)`, so req.url is rebuilt to the real
 * path plus the untouched query string.
 */
function resolvePath(req) {
  const url = new URL(req.url || '/', 'http://localhost')
  let pathname = url.pathname
  const forwarded = url.searchParams.get('__route')
  if (
    forwarded &&
    (pathname === '/api' || pathname === '/api/' || pathname === '/api/index' || pathname === '/api/index.js')
  ) {
    pathname = `/api/${forwarded.replace(/^\/+/, '')}`
  }
  url.searchParams.delete('__route')
  const query = url.searchParams.toString()
  req.url = pathname + (query ? `?${query}` : '')
  return pathname
}

export async function dispatch(req, res) {
  let pathname = resolvePath(req)
  if (pathname.length > 1) pathname = pathname.replace(/\/+$/, '')

  const matched = match(req.method, pathname)
  if (!matched) {
    return sendJson(res, 404, { error: 'Not found.' })
  }

  req.params = matched.params
  try {
    const { default: handler } = await matched.load()
    await handler(req, res)
  } catch (err) {
    console.error(`[api] ${pathname} failed:`, err)
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'Internal server error.' })
    } else if (!res.writableEnded) {
      res.end()
    }
  }
}
