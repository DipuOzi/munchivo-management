// Generates VAPID keys for Web Push and appends them to .env.local.
// Keys are NEVER printed to the console — only written to the file.
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const webpush = require('web-push')

const ENV_FILE = '.env.local'

let existing = ''
if (existsSync(ENV_FILE)) existing = readFileSync(ENV_FILE, 'utf8')

if (existing.includes('VAPID_PUBLIC_KEY=')) {
  console.log('✓ VAPID keys already exist in .env.local — nothing to do.')
} else {
  const keys = webpush.generateVAPIDKeys()
  let out = ''
  if (existing.length > 0 && !existing.endsWith('\n')) out += '\n'
  out += `\n# Web Push (VAPID) — generated ${new Date().toISOString()}\n`
  out += `VAPID_PUBLIC_KEY=${keys.publicKey}\n`
  out += `VAPID_PRIVATE_KEY=${keys.privateKey}\n`
  out += 'VAPID_SUBJECT=mailto:hello@munchivo.com\n'
  appendFileSync(ENV_FILE, out)
  console.log('✓ VAPID keys generated and written to .env.local (kept private).')
}
