// Temporary QA: create a test partner, run the real API flow, delete it after.
import { config } from 'dotenv'
config({ path: '.env.local' })

const { neon } = await import('@neondatabase/serverless')
const bcrypt = await import('bcryptjs')
const sql = neon(process.env.DATABASE_URL)

const TEST_EMAIL = 'qa-test@munchivo-test.local'
const TEST_PASSWORD = 'qa-test-password-123'

function fail(msg) {
  throw new Error(`TEST FAILED: ${msg}`)
}

// 1. Count partners (excluding any leftover QA user from an interrupted run)
await sql`DELETE FROM users WHERE email = ${TEST_EMAIL}`
const users = await sql`SELECT name, email FROM users ORDER BY created_at`
console.log(`Partner accounts: ${users.length}`)
users.forEach((u) => console.log(`  - ${u.name} <${u.email}>`))
if (users.length !== 3) throw new Error('Expected exactly 3 partner accounts.')

// 2. Insert temporary QA user
const hash = await bcrypt.default.hash(TEST_PASSWORD, 12)
const inserted = await sql`
  INSERT INTO users (name, email, password_hash, role)
  VALUES ('QA Test', ${TEST_EMAIL}, ${hash}, 'owner')
  RETURNING id`
const testId = inserted[0].id
console.log('Temporary QA user created.')

try {
  const base = 'http://localhost:5173/api/auth'

  // 3. Wrong password -> must be 401
  let res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: 'wrong-password' }),
  })
  if (res.status !== 401) fail(`Expected 401 for wrong password, got ${res.status}`)
  console.log('✓ Wrong password rejected with 401.')

  // 4. Correct password -> 200 + session cookie
  res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  })
  if (res.status !== 200) fail(`Expected 200 for correct login, got ${res.status}: ${await res.text()}`)
  const setCookie = res.headers.get('set-cookie') || ''
  if (!setCookie.includes('mv_session=') || !setCookie.includes('HttpOnly')) {
    fail('Session cookie missing or not HttpOnly.')
  }
  const cookie = setCookie.split(';')[0]
  console.log('✓ Correct login returns 200 with HttpOnly session cookie.')

  // 5. /me with cookie -> authenticated user
  res = await fetch(`${base}/me`, { headers: { Cookie: cookie } })
  if (res.status !== 200) fail(`Expected 200 from /me, got ${res.status}`)
  const me = await res.json()
  if (me.user?.email !== TEST_EMAIL) fail('/me returned unexpected user.')
  console.log(`✓ Session restored via /me (user: ${me.user.name}).`)

  // 6. /me without cookie -> 401
  res = await fetch(`${base}/me`)
  if (res.status !== 401) fail(`Expected 401 from /me without cookie, got ${res.status}`)
  console.log('✓ Unauthenticated /me correctly returns 401.')

  // 7. Logout destroys the session
  res = await fetch(`${base}/logout`, { method: 'POST', headers: { Cookie: cookie } })
  if (res.status !== 200) fail(`Expected 200 from logout, got ${res.status}`)
  res = await fetch(`${base}/me`, { headers: { Cookie: cookie } })
  if (res.status !== 401) fail('Session still valid after logout!')
  console.log('✓ Logout destroys the session server-side.')
} finally {
  // 8. Remove QA user (cascades session rows)
  await sql`DELETE FROM users WHERE id = ${testId}`
  const remaining = await sql`SELECT count(*)::int AS n FROM users`
  console.log(`✓ Temporary QA user removed. Partner accounts: ${remaining[0].n}`)
}
console.log('\nALL AUTH TESTS PASSED.')
