# Munchivo Management

An end-to-end inventory and production management system for the Munchivo kitchen. Built as a single-page Vite + React app with a single Vercel serverless function forwarding to a Neon PostgreSQL database.

---

## What this project does

- **Inventory** — ingredients with per-base-unit stock and weighted-average cost. Every stock change is an immutable `inventory_movements` row.
- **Purchases** — supplier purchases with per-item costing, stock accrual, batch tracking, and supplier dues.
- **Recipes** — recipe definitions with per-item ingredient quantities; recipe costing estimates.
- **Products** — finished menu items, some tied to a recipe for batch costing.
- **Production** — confirm a recipe batch → deduct scaled ingredients → create prepared stock (batch workflow).
- **Sales** — consume ingredient or prepared stock at sale time, capture COGS snapshot.
- **Waste / Expiry** — record spoiled/expired stock; each record deducts stock with an immutable movement. Cancellation returns stock.
- **Reports** — daily + category breakdowns of revenue, cost, and net profit.
- **Dashboard** — monthly summary metrics.
- **Partners** — capital contributions and withdrawals ledger.
- **Expenses** — operating expenses with categories, search, and summary.
- **Settings** — team + business config (expiry alert days, business name, etc.).
- **Auth** — server-side sessions (HTTP-only cookie), with login page.
- **Push notifications** — web push (VAPID) when configured.

---

## Stack

- **Frontend**: Vite + React (ESM, no bundler step for API).
- **API**: One Vercel serverless function (`api/index.js`) that routes to handlers in `api/_handlers/`. Local dev uses `server/local-dev.mjs`.
- **Database**: Neon PostgreSQL via Drizzle ORM.
- **Money**: all amounts are integers in **poisha** (1 BDT = 100 poisha). No floats in money columns.
- **Quantities**: all `_base` columns are integers in the ingredient's base unit (grams for mass, millilitres for volume, whole units for count/other).

---

## Getting started (local)

### 1. Install dependencies

```
npm install
```

### 2. Configure environment

Copy `.env.local` (or `.env`) and set:

```
DATABASE_URL=postgresql://...
SESSION_SECRET=...
CRON_SECRET=...
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:you@example.com
```

See `.env.example` for the list of required variables.

### 3. Start the API server (for local dev + smoke test)

```
npm run api:dev
```

The API listens on `http://localhost:3001`. The Vite dev server proxies `/api/*` to it.

### 4. Start the frontend

```
npm run dev
```

### 5. Run the smoke test

```
npm run api:dev     # in one terminal
npm run smoke       # in another
```

`npm run smoke` creates a temporary session for the first active user, exercises every module (expenses, partners, reports, settings, waste, products, ingredients), cleans up all test data, and leaves business settings as they were. It reports per-check pass/fail.

Current smoke checks: **25 total**, all passing.

---

## Key conventions

- **Money**: `poishaToTaka(poisha)` → e.g. `"45.00"`; `takaToPoisha("45.00")` → `4500`. Format for display with `formatMoney(poisha)` → e.g. `"৳45"`.
- **Quantities**: `toBase(qty, displayUnit)` → base unit integer; `fromBase(base, displayUnit)` → display quantity; `formatQty(base, displayUnit)` → e.g. `"10 kg"`.
- **Stock changes**: always go through `api/_lib/stock.js` (`deductStock`, `consumePreparedStock`). Every change writes an immutable `inventory_movements` row inside the same transaction.
- **No hard deletes**: historical records use status flags (`confirmed` / `cancelled`) or reversal records.
- **Waste**: recording ingredient waste deducts stock + creates an `inventory_movements` row with `movementType = 'waste'`. Prepared-product waste consumes prepared stock only. Cancellation of waste returns stock via `waste_reversal` movement.
- **Production**: confirming a batch deducts scaled ingredients (via `deductStock`) and creates a `preparedStock` row. `preparedStock` is consumed by batch-workflow sales.

---

## Building for production

```
npm run build
```

Produces `dist/index.html` + `dist/assets/*.js` + `dist/assets/*.css`. The Vercel function serves `dist/index.html` for non-API routes (SPA fallback).

---

## Deployment (Vercel)

- The API is a **single Vercel function** (`api/index.js`) that dispatches to handlers in `api/_handlers/`. This keeps the project within Vercel Hobby's 12-function limit.
- `vercel.json` rewrites `/api/(.*)` → `/api?__route=$1` and sets a SPA fallback for everything else.
- Cron jobs (`/api/cron/daily`) are declared in `vercel.json` and protected by `CRON_SECRET`.

### Environment variables (Vercel project settings → Environment Variables)

- `DATABASE_URL` — PostgreSQL connection string (Neon).
- `SESSION_SECRET` — random string for session signing.
- `CRON_SECRET` — shared secret for cron auth.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` — for web push (optional).

---

## Repository

- **GitHub**: https://github.com/DipuOzi/munchivo-management
- **Branch**: `main`
- **Push**: committed and pushed via HTTPS (credentials stored in Git credential helper).

---

## Error handling

Handlers return structured JSON errors:

- `400` for validation errors (specific message).
- `401` for missing/invalid auth.
- `404` for not-found resources.
- `409` for uniqueness conflicts (e.g. duplicate ingredient/product name).
- `405` for unsupported methods.
- `500` for unexpected server errors, with the real error message exposed (after logging).

The `api/_lib/router.js` dispatches based on method + path patterns and handles the single-function routing for Vercel.

---

## Notes

- `api/_handlers/` is the directory where individual route handlers live. `api/index.js` is the only file Vercel deploys as a function; it imports the shared router.
- `api/_lib/` contains shared utilities: router, HTTP helpers, auth guard, stock engine, cost helpers.
- `src/db/schema.js` is the single source of truth for the database schema (Drizzle ORM). All handlers import from it.
- `src/shared/units.js` contains shared unit/money helpers used by both API handlers and the frontend.
- The sidebar excludes the **Suppliers** tab (removed to simplify navigation). Supplier management still works via the Partners section where supplier relationships are recorded.
