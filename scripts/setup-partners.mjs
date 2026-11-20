/**
 * SECURE PARTNER ACCOUNT SETUP
 *
 * Run:  npm run setup:partners
 *
 * Creates the three Munchivo partner accounts. You type the names,
 * emails and passwords directly into YOUR OWN terminal — they are
 * never shared with anyone (including AI assistants or chat).
 *
 * Passwords are stored as bcrypt hashes only; the plaintext never
 * touches the database.
 */
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import bcrypt from 'bcryptjs'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

if (!process.env.DATABASE_URL) {
  console.error(
    '\n✗ DATABASE_URL is not set.\n' +
      '  Create .env.local in the project root containing:\n' +
      '  DATABASE_URL="your-neon-connection-string"\n',
  )
  process.exit(1)
}

const { db, schema } = await import('../src/db/index.js')
const { eq } = await import('drizzle-orm')

const rl = readline.createInterface({ input, output })

function validateEmail(email) {
  return /^\S+@\S+\.\S+$/.test(email)
}

async function createPartner(index) {
  console.log(`\n── Partner ${index} of 3 ─────────────────────────`)
  const name = (await rl.question('Full name: ')).trim()
  if (!name) throw new Error('Name cannot be empty.')

  const email = (await rl.question('Email (used to sign in): ')).trim().toLowerCase()
  if (!validateEmail(email)) throw new Error(`"${email}" is not a valid email.`)

  let password = (await rl.question('Password (min 8 characters): ')).trim()
  if (password.length < 8) throw new Error('Password must be at least 8 characters.')

  const confirm = (await rl.question('Confirm password: ')).trim()
  if (password !== confirm) throw new Error('Passwords do not match.')

  const existing = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  if (existing.length > 0) {
    throw new Error(`An account with email ${email} already exists.`)
  }

  const passwordHash = await bcrypt.hash(password, 12)

  await db.insert(schema.users).values({
    name,
    email,
    passwordHash,
    role: 'owner',
  })

  console.log(`✓ Partner account created for ${name} <${email}> (role: owner)`)
}

try {
  console.log('\nMUNCHIVO MANAGEMENT — partner account setup')
  console.log('Type your answers in this terminal only. Do not share them anywhere.\n')

  for (let i = 1; i <= 3; i++) {
    await createPartner(i)
  }

  console.log('\n✓ All three partner accounts are ready. You can now sign in.\n')
} catch (err) {
  console.error(`\n✗ ${err.message}\n  No partial accounts were left half-created.\n`)
  process.exitCode = 1
} finally {
  rl.close()
  process.exit(process.exitCode || 0)
}
