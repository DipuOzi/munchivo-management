/**
 * Seed the standard operating-expense categories.
 * Run: npm run db:seed
 *
 * Safe to run repeatedly — existing names are skipped.
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

const CATEGORIES = [
  'Cleaning',
  'Electricity',
  'Gas',
  'Maintenance',
  'Marketing',
  'Other',
  'Packaging',
  'Rent',
  'Staff salary',
  'Transport',
]

const { db, schema } = await import('../src/db/index.js')

try {
  const inserted = await db
    .insert(schema.expenseCategories)
    .values(CATEGORIES.map((name) => ({ name })))
    .onConflictDoNothing()
    .returning({ id: schema.expenseCategories.id, name: schema.expenseCategories.name })

  console.log(
    `✓ Expense categories ready (${inserted.length} new, ${
      CATEGORIES.length - inserted.length
    } already existed).`,
  )
} catch (err) {
  console.error('✗ Seeding failed:', err.message)
  process.exitCode = 1
} finally {
  process.exit(process.exitCode || 0)
}
