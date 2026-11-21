/**
 * GET /api/usage/daily-report?date=YYYY-MM-DD
 *   &ingredientId=...&search=...
 * Per-ingredient consumption for one day, derived from the movement ledger.
 */
import { sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { buildDaySheet } from '../../_lib/usage.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const url = new URL(req.url, 'http://x')
    const date = url.searchParams.get('date')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return sendJson(res, 400, { error: 'A valid date (YYYY-MM-DD) is required.' })
    }
    const data = await buildDaySheet(date, {
      ingredientId: url.searchParams.get('ingredientId') || undefined,
      search: url.searchParams.get('search') || undefined,
    })
    return sendJson(res, 200, data)
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('daily report error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}