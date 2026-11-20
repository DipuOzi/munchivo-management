/**
 * Database client — Neon PostgreSQL via the postgres-js driver.
 *
 * postgres-js gives us full interactive transactions (required for
 * safe stock changes) and works both locally and in Vercel Node.js
 * serverless functions over standard TCP with SSL.
 *
 * The connection string is read from the DATABASE_URL environment
 * variable only (never committed to source control).
 */
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema.js'

if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL is not set. Add it to .env.local (local) or your Vercel project environment variables (production).',
  )
}

// prepare: false — recommended for pooled/connection-cached environments.
const sqlClient = postgres(process.env.DATABASE_URL, {
  prepare: false,
  max: 5,
})

export const db = drizzle(sqlClient, { schema })
export { schema }
