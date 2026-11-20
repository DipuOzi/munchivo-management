# Munchivo Management

A complete back-office system for the Munchivo food business: inventory,
purchasing, recipes, production, sales, waste, expiry tracking, operating
expenses, partner ledgers, financial reports and settings — all in one
web app.

Built with **React 19 + Vite** on the front end and **Vercel serverless
functions + Neon PostgreSQL (Drizzle ORM)** on the back end. Money is stored
as integer poisha (1 BDT = 100 poisha) and quantities as integer base units,
so totals are always exact.

---

## Features

| Module | What it does |
| --- | --- |
| Dashboard | Today's sales, month net profit, low stock, expiring batches, top products, recent orders |
| Inventory | Ingredients, stock levels, weighted-average cost, manual adjustments, movement history |
| Purchases | Supplier purchases, line items, partial payments, automatic stock batches |
| Suppliers | Contact details and outstanding dues |
| Recipes | Ingredients + quantities per product, live plate cost |
| Calculator | Ingredient cost and portion calculator |
| Products | Menu items, categories, selling prices |
| Production | Batch production with stock consumption and prepared-stock output |
| Sales | Orders, discounts, payment methods, refunds, automatic stock + COGS |
| Waste | Waste records with reason and estimated cost |
| Expiry | Ingredient batch expiry and prepared-stock ageing |
| **Expenses** | Operating costs by category, paid/unpaid tracking, month filters, summary cards |
| **Partners** | Ownership %, capital, drawings, profit share, loans and repayments with a full ledger |
| **Reports** | Profit & loss, daily revenue/expense trend, payment mix, top products, expense breakdown, partner balances, CSV export and print |
| Settings | Profile, business details, expiry alert window, password change, team accounts |
| Notifications | Low-stock and expiry alerts, per-user read state, browser push |

Security: HTTP-only cookie sessions with hashed tokens, bcrypt password
hashing, login rate limiting, audit logs for every write, and soft-cancel
instead of deleting financial history.

---

## Requirements

- Node.js 20 or newer
- A PostgreSQL database (this project is configured for
  [Neon](https://neon.tech), but any PostgreSQL 14+ instance works)
- A free [Vercel](https://vercel.com) account for deployment

---

## 1. Install

```bash
npm install
```

## 2. Configure the database

1. Create a Neon project and copy its pooled connection string.
2. Copy the example environment file:

   ```bash
   copy .env.example .env.local        # Windows
   cp .env.example .env.local          # macOS / Linux
   ```

3. Open `.env.local` and set at least `DATABASE_URL`.
4. Optional but recommended — generate Web Push keys:

   ```bash
   npx web-push generate-vapid-keys
   ```

   Paste the public/private keys into `VAPID_PUBLIC_KEY` and
   `VAPID_PRIVATE_KEY`.

## 3. Create the schema and seed data

```bash
npm run db:migrate     # applies all Drizzle migrations
npm run db:seed        # adds the 10 standard expense categories
```

## 4. Create the partner accounts

```bash
npm run setup:partners
```

This prompts in your own terminal for names, emails and passwords (three
accounts). Passwords are stored only as bcrypt hashes.

## 5. Run locally

The app needs two servers: the Vite front end and the local API shim.

```bash
npm run dev:all
```

Then open **http://localhost:5173**.

`dev:all` starts both. If you prefer separate terminals:

```bash
npm run api:dev   # API on http://localhost:3001
npm run dev       # Vite on http://localhost:5173, proxies /api
```

### Verify the API

With `api:dev` running:

```bash
npm run smoke
```

The smoke test creates a temporary session, exercises every module
(expenses, partners, reports, settings), then removes all test data and
restores business settings exactly as they were.

---

## Production deployment on Vercel

1. Push the repository to GitHub (see below).
2. In Vercel, **Add New → Project** and import the repository.
3. Vercel auto-detects Vite. Keep:
   - **Build command:** `npm run build`
   - **Output directory:** `dist`
4. Add the environment variables from `.env.local` under
   **Settings → Environment Variables**:
   - `DATABASE_URL` (Neon pooled connection string)
   - `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (optional, for push)
   - `CRON_SECRET` (recommended; protects the daily alert job)
5. Deploy. The included `vercel.json` handles:
   - SPA routing (every non-API path serves `index.html`)
   - a daily cron at **01:00 UTC** calling `/api/cron/daily`
6. After the first deployment, run migrations against the production
   database from your machine (the same `DATABASE_URL`):

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

   `npm run setup:partners` can also be run locally to create production
   accounts in that database.

### How the API works on Vercel

Vercel's free (Hobby) plan allows at most **12 serverless functions per
deployment**, and every file in `api/` would otherwise become its own
function. Munchivo therefore ships the whole API as a single function:

- `api/index.js` is the only file Vercel turns into a function.
- `vercel.json` rewrites `/api/<path>` to `/api?__route=<path>`.
- `api/_lib/router.js` maps that path onto the right handler in
  `api/_handlers/` (dynamic segments such as `:id` included).
- Folders starting with `_` (`_lib/`, `_handlers/`) are ignored by Vercel,
  so they add no functions.

Locally, `server/local-dev.mjs` runs the very same router, so development
and production routing cannot drift apart. Adding an endpoint means adding
a handler file and one line to the route table in `api/_lib/router.js`.

### Daily alerts

`vercel.json` registers a daily cron for `/api/cron/daily`. It:

- Creates expiry alerts for batches inside the configured window
- Resolves alerts for stock that was used or removed
- Flags prepared stock older than 48 hours
- Rechecks low stock and auto-resolves replenished ingredients
- Cleans up expired sessions
- Sends one browser push when new alerts appear

If `CRON_SECRET` is set, Vercel sends it automatically as a Bearer token.
Without it the endpoint is open, which is fine locally but not recommended
for production.

---

## Pushing to GitHub

```bash
git init
git add .
git commit -m "Complete Munchivo Management"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

`.env.local`, `node_modules` and `dist` are already ignored. Never commit
real credentials.

---

## Project structure

```
api/                 the API (one Vercel function)
  index.js           single serverless function entry point
  _lib/              router + shared helpers: auth, sessions, HTTP, stock, settings
  _handlers/         one module per route group
    expenses/        expenses CRUD
    partners/        partner CRUD + ledger
    settings/        profile, business, password
    reports.js       consolidated financial report
    cron/daily.js    scheduled maintenance + alerting
drizzle/             SQL migrations generated by drizzle-kit
scripts/             setup, seed, smoke-test and dev orchestration
server/local-dev.mjs local API server (development only)
src/
  components/        layout, UI primitives, notifications
  context/           auth context
  db/                Drizzle client and schema
  lib/               fetch helper
  pages/             all screens
  shared/            money/quantity/date helpers
  styles/            design tokens and component styles
public/              static assets, service worker, icons
vercel.json          SPA rewrite + daily cron
```

---

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev:all` | Run API + front end together |
| `npm run dev` | Vite only (needs `api:dev` separately) |
| `npm run api:dev` | Local API server on port 3001 |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run db:generate` | Generate a migration after schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Seed standard expense categories (idempotent) |
| `npm run setup:partners` | Create the partner login accounts |
| `npm run smoke` | End-to-end API smoke test (cleans up after itself) |

---

## Notes and conventions

- **Never hard-delete financial records.** Expenses and ledger entries are
  cancelled (`status = 'cancelled'`) so reports and history stay intact.
- **Money** is `*_poisha` integers; the UI converts to taka with
  `formatMoney` / `poishaToTaka`.
- **Quantities** are base units (grams / millilitres / units); use the
  helpers in `src/shared/units.js`.
- **Ownership** is stored in basis points (100% = 10000) so percentages such
  as 33.33% stay exact.
- Ingredient purchases belong in **Purchases** (they create stock).
  **Expenses** is for rent, utilities, salaries and other running costs, so
  COGS is never double-counted.
- The Reports page uses confirmed sales, confirmed expenses, confirmed waste
  and confirmed purchases only.
