/**
 * Applies the additive usage/reconciliation migration (idempotent).
 * Run: node scripts/apply-usage-migration.mjs
 *
 * Reads drizzle/0004_usage_reconciliation.sql and executes each
 * statement. Uses CREATE ... IF NOT EXISTS, so it is safe to re-run and
 * never drops or resets existing data.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { config } from 'dotenv'
import postgres from 'postgres'

config({ path: '.env.local' })
config({ path: '.env' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(__dirname, '..', 'drizzle', '0004_usage_reconciliation.sql')
const raw = readFileSync(sqlPath, 'utf8')
const statements = raw
  .split('--> statement-breakpoint')
  .map((s) => s.replace(/--.*$/gm, '').trim())
  .filter(Boolean)

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set (.env.local).')
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })
try {
  for (const stmt of statements) {
    await sql.unsafe(stmt)
  }
  console.log(`Applied ${statements.length} statement(s) from 0004_usage_reconciliation.sql`)
} catch (err) {
  console.error('Migration failed:', err.message)
  process.exitCode = 1
} finally {
  await sql.end()
}