import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

// Load local env files (never committed) for migrate/generate commands.
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.js',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
