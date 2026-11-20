/**
 * PATCH /api/settings/business — update business preferences.
 */
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { saveBusinessSettings } from '../_lib/settings.js'

const TEXT_FIELDS = {
  businessName: 120,
  legalName: 160,
  phone: 60,
  address: 300,
  timezone: 60,
  receiptFooter: 240,
}

export default async function handler(req, res) {
  if (!['PATCH', 'PUT'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    const body = await readJson(req)
    const patch = {}

    for (const [field, max] of Object.entries(TEXT_FIELDS)) {
      if (body[field] === undefined) continue
      const value = (body[field] || '').trim()
      if (value.length > max) {
        return sendJson(res, 400, {
          error: `${field} must be ${max} characters or fewer.`,
        })
      }
      patch[field] = value
    }

    if (patch.businessName !== undefined && !patch.businessName) {
      return sendJson(res, 400, { error: 'Business name is required.' })
    }
    if (patch.timezone !== undefined && !patch.timezone) {
      return sendJson(res, 400, { error: 'Timezone is required.' })
    }

    if (body.currency !== undefined) {
      if (body.currency !== 'BDT') {
        return sendJson(res, 400, {
          error: 'Only BDT is supported by this installation.',
        })
      }
      patch.currency = 'BDT'
    }

    if (body.expiryAlertDays !== undefined) {
      const days = Number(body.expiryAlertDays)
      if (!Number.isInteger(days) || days < 1 || days > 60) {
        return sendJson(res, 400, {
          error: 'Expiry alert days must be a whole number between 1 and 60.',
        })
      }
      patch.expiryAlertDays = days
    }

    if (Object.keys(patch).length === 0) {
      return sendJson(res, 400, { error: 'Nothing to update.' })
    }

    const business = await saveBusinessSettings(patch)

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'settings.business.update',
      entity: 'system_setting',
      entityId: 'business',
      details: patch,
    })

    return sendJson(res, 200, { business })
  } catch (err) {
    console.error('business settings update error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
