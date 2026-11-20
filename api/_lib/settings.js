/**
 * Business settings stored in the `system_settings` key/value table.
 * A single `business` key holds the JSON document; defaults are merged
 * so new fields can be added without breaking existing installs.
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'

export const BUSINESS_SETTINGS_KEY = 'business'

export const DEFAULT_BUSINESS_SETTINGS = {
  businessName: 'Munchivo',
  legalName: '',
  phone: '',
  address: '',
  currency: 'BDT',
  timezone: 'Asia/Dhaka',
  /** days before expiry to start alerting */
  expiryAlertDays: 7,
  receiptFooter: 'Thank you for choosing Munchivo!',
}

export async function getBusinessSettings() {
  const rows = await db
    .select()
    .from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, BUSINESS_SETTINGS_KEY))
    .limit(1)

  const stored = rows[0]?.value
  return {
    ...DEFAULT_BUSINESS_SETTINGS,
    ...(stored && typeof stored === 'object' && !Array.isArray(stored)
      ? stored
      : {}),
  }
}

export async function saveBusinessSettings(patch) {
  const current = await getBusinessSettings()
  const next = { ...current, ...patch }

  await db
    .insert(schema.systemSettings)
    .values({ key: BUSINESS_SETTINGS_KEY, value: next, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: schema.systemSettings.key,
      set: { value: next, updatedAt: new Date() },
    })

  return next
}
