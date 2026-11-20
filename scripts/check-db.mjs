// Temporary diagnostic: verifies DB connectivity, tables and user count.
import { config } from 'dotenv'
config({ path: '.env.local' })

const { neon } = await import('@neondatabase/serverless')
const sql = neon(process.env.DATABASE_URL)

try {
  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `
  console.log(
    'Tables in your database:',
    tables.map((r) => r.table_name).join(', ') || 'NONE',
  )

  if (tables.some((t) => t.table_name === 'users')) {
    const count = await sql`SELECT count(*)::int AS n FROM users`
    console.log('User accounts created so far:', count[0].n)
  }
  console.log('✓ Database connection works.')
} catch (err) {
  console.error('✗ Database error:', err.message)
  process.exit(1)
}
