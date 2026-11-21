/**
 * MUNCHIVO MANAGEMENT — DATABASE SCHEMA
 * Neon PostgreSQL via Drizzle ORM.
 *
 * Phase 3: users, sessions, audit logs.
 * Later phases add inventory, purchases, recipes, sales, etc.
 *
 * Conventions:
 * - UUID primary keys (gen_random_uuid).
 * - All timestamps stored as timestamptz.
 * - Historical records are never hard-deleted; use status flags
 *   or reversal records.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

/**
 * MONEY: all *_poisha columns are integers in poisha (1 BDT = 100 poisha).
 * QUANTITIES: all *_base columns are integers in the ingredient's BASE unit:
 *   mass -> grams, volume -> millilitres, count/other -> whole units.
 * This makes every conversion and sum exact (no float rounding).
 */

/* ------------------------------------------------------------------ */
/* USERS — the three business partners (role: 'owner'); future         */
/* restricted staff accounts will use other roles.                     */
/* ------------------------------------------------------------------ */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('owner'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('users_email_unique').on(table.email)],
)

/* ------------------------------------------------------------------ */
/* SESSIONS — server-side session store for HTTP-only cookie auth.     */
/* Only a SHA-256 hash of the session token is stored.                 */
/* ------------------------------------------------------------------ */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

/* ------------------------------------------------------------------ */
/* SUPPLIERS                                                           */
/* ------------------------------------------------------------------ */
export const suppliers = pgTable('suppliers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: text('name').notNull(),
  phone: text('phone'),
  address: text('address'),
  category: text('category'),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/* ------------------------------------------------------------------ */
/* INGREDIENTS — fully dynamic; never a hardcoded list.                */
/* Stock and average cost are maintained columns, always changed       */
/* inside DB transactions together with an inventory_movement row.     */
/* ------------------------------------------------------------------ */
export const ingredients = pgTable(
  'ingredients',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    category: text('category').notNull().default('General'),
    /** mass | volume | count | other — determines the base unit */
    unitType: text('unit_type').notNull(),
    /** Display unit: kg, g, L, ml, pcs, Packet, Bottle, Box, or custom */
    displayUnit: text('display_unit').notNull(),
    currentStockBase: integer('current_stock_base').notNull().default(0),
    /** weighted-average cost per BASE unit, in poisha */
    avgCostPoisha: integer('avg_cost_poisha').notNull().default(0),
    minStockBase: integer('min_stock_base').notNull().default(0),
    lowStockThresholdBase: integer('low_stock_threshold_base')
      .notNull()
      .default(0),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    storageLocation: text('storage_location'),
    trackExpiry: boolean('track_expiry').notNull().default(false),
    notes: text('notes'),
    /** active | archived */
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('ingredients_name_unique').on(table.name),
    index('ingredients_status_idx').on(table.status),
    index('ingredients_category_idx').on(table.category),
  ],
)

/* ------------------------------------------------------------------ */
/* INVENTORY MOVEMENTS — immutable audit trail for every stock change. */
/* quantityDeltaBase is signed (+ in, - out). Never hard-deleted.      */
/* ------------------------------------------------------------------ */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    /** opening_stock | purchase | purchase_reversal | adjustment |
        sale_consumption | sale_reversal | waste | waste_reversal | expiry */
    movementType: text('movement_type').notNull(),
    quantityDeltaBase: integer('quantity_delta_base').notNull(),
    /** weighted-average cost per base unit applied to this movement */
    unitCostPoisha: integer('unit_cost_poisha'),
    /** stock level after this movement — for audit and reports */
    balanceAfterBase: integer('balance_after_base').notNull(),
    purchaseId: uuid('purchase_id'),
    batchId: uuid('batch_id'),
    wasteId: uuid('waste_id'),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('inventory_movements_ingredient_idx').on(
      table.ingredientId,
      table.createdAt,
    ),
    index('inventory_movements_type_idx').on(table.movementType),
  ],
)

/* ------------------------------------------------------------------ */
/* INVENTORY BATCHES — batch-level expiry tracking (FEFO support).     */
/* ------------------------------------------------------------------ */
export const inventoryBatches = pgTable(
  'inventory_batches',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    purchaseId: uuid('purchase_id'),
    purchaseDate: date('purchase_date'),
    expiryDate: date('expiry_date'),
    quantityOriginalBase: integer('quantity_original_base').notNull(),
    quantityRemainingBase: integer('quantity_remaining_base').notNull(),
    unitCostPoisha: integer('unit_cost_poisha').notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    /** active | depleted */
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('inventory_batches_ingredient_idx').on(table.ingredientId),
    index('inventory_batches_expiry_idx').on(table.expiryDate),
  ],
)

/* ------------------------------------------------------------------ */
/* PURCHASES                                                           */
/* ------------------------------------------------------------------ */
export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseDate: date('purchase_date').notNull(),
    supplierId: uuid('supplier_id').references(() => suppliers.id, {
      onDelete: 'set null',
    }),
    /** confirmed | cancelled */
    status: text('status').notNull().default('confirmed'),
    totalPoisha: integer('total_poisha').notNull().default(0),
    paidPoisha: integer('paid_poisha').notNull().default(0),
    invoiceNumber: text('invoice_number'),
    notes: text('notes'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelNotes: text('cancel_notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('purchases_date_idx').on(table.purchaseDate),
    index('purchases_supplier_idx').on(table.supplierId),
  ],
)

export const purchaseItems = pgTable(
  'purchase_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantityBase: integer('quantity_base').notNull(),
    unitPricePoisha: integer('unit_price_poisha').notNull(),
    lineTotalPoisha: integer('line_total_poisha').notNull(),
    expiryDate: date('expiry_date'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('purchase_items_purchase_idx').on(table.purchaseId)],
)

export const purchasePayments = pgTable(
  'purchase_payments',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    purchaseId: uuid('purchase_id')
      .notNull()
      .references(() => purchases.id, { onDelete: 'cascade' }),
    amountPoisha: integer('amount_poisha').notNull(),
    /** cash | bkash | nagad | other */
    paymentMethod: text('payment_method').notNull().default('cash'),
    paidAt: date('paid_at').notNull(),
    recordedBy: uuid('recorded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('purchase_payments_purchase_idx').on(table.purchaseId)],
)

/* ------------------------------------------------------------------ */
/* PRODUCTS & CATEGORIES (Phase 4b modules, schema created now)         */
/* ------------------------------------------------------------------ */
export const productCategories = pgTable(
  'product_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('product_categories_name_unique').on(table.name)],
)

export const recipes = pgTable(
  'recipes',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    category: text('category'),
    /** yield expressed in the base unit of yieldUnitType */
    baseYieldBase: integer('base_yield_base').notNull(),
    yieldUnit: text('yield_unit').notNull(),
    instructions: text('instructions'),
    prepTimeMinutes: integer('prep_time_minutes'),
    packagingCostPoisha: integer('packaging_cost_poisha').notNull().default(0),
    otherDirectCostPoisha: integer('other_direct_cost_poisha')
      .notNull()
      .default(0),
    notes: text('notes'),
    /** active | archived */
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('recipes_name_unique').on(table.name),
    index('recipes_status_idx').on(table.status),
  ],
)

export const recipeItems = pgTable(
  'recipe_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    recipeId: uuid('recipe_id')
      .notNull()
      .references(() => recipes.id, { onDelete: 'cascade' }),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id),
    quantityBase: integer('quantity_base').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('recipe_items_recipe_idx').on(table.recipeId),
    uniqueIndex('recipe_items_unique').on(table.recipeId, table.ingredientId),
  ],
)

export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    categoryId: uuid('category_id').references(() => productCategories.id, {
      onDelete: 'set null',
    }),
    description: text('description'),
    sellingPricePoisha: integer('selling_price_poisha').notNull(),
    recipeId: uuid('recipe_id').references(() => recipes.id, {
      onDelete: 'set null',
    }),
    packagingCostPoisha: integer('packaging_cost_poisha').notNull().default(0),
    notes: text('notes'),
    /** active | archived */
    status: text('status').notNull().default('active'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('products_name_unique').on(table.name),
    index('products_status_idx').on(table.status),
  ],
)
/* ------------------------------------------------------------------ */
/* SALES                                                               */
/* ------------------------------------------------------------------ */
export const sales = pgTable(
  'sales',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    orderNumber: text('order_number').notNull(),
    saleDate: timestamp('sale_date', { withTimezone: true })
      .notNull()
      .defaultNow(),
    subtotalPoisha: integer('subtotal_poisha').notNull().default(0),
    discountPoisha: integer('discount_poisha').notNull().default(0),
    totalPoisha: integer('total_poisha').notNull().default(0),
    refundPoisha: integer('refund_poisha').notNull().default(0),
    /** actual ingredient/prepared-stock cost at sale time (COGS snapshot) */
    cogsPoisha: integer('cogs_poisha').notNull().default(0),
    /** cash | bkash | nagad | other */
    paymentMethod: text('payment_method').notNull().default('cash'),
    /** confirmed | cancelled */
    status: text('status').notNull().default('confirmed'),
    notes: text('notes'),
    /** idempotency: prevents duplicate orders from retries/double clicks */
    clientToken: text('client_token'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('sales_order_number_unique').on(table.orderNumber),
    uniqueIndex('sales_client_token_unique').on(table.clientToken),
    index('sales_date_idx').on(table.saleDate),
  ],
)

export const saleItems = pgTable(
  'sale_items',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    /** snapshots — never change when products change later */
    productName: text('product_name').notNull(),
    quantity: integer('quantity').notNull(),
    unitPricePoisha: integer('unit_price_poisha').notNull(),
    lineTotalPoisha: integer('line_total_poisha').notNull(),
    recipeId: uuid('recipe_id'),
    cogsPoisha: integer('cogs_poisha').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sale_items_sale_idx').on(table.saleId)],
)

export const saleRefunds = pgTable(
  'sale_refunds',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    saleId: uuid('sale_id')
      .notNull()
      .references(() => sales.id, { onDelete: 'cascade' }),
    amountPoisha: integer('amount_poisha').notNull(),
    reason: text('reason'),
    recordedBy: uuid('recorded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('sale_refunds_sale_idx').on(table.saleId)],
)

/* ------------------------------------------------------------------ */
/* WASTE RECORDS                                                       */
/* ------------------------------------------------------------------ */
export const wasteRecords = pgTable(
  'waste_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ingredientId: uuid('ingredient_id').references(() => ingredients.id, {
      onDelete: 'set null',
    }),
    productId: uuid('product_id').references(() => products.id, {
      onDelete: 'set null',
    }),
    quantityBase: integer('quantity_base').notNull(),
    /** expired | spoiled | burnt | preparation_mistake | damaged | other */
    reason: text('reason').notNull(),
    estimatedCostPoisha: integer('estimated_cost_poisha').notNull().default(0),
    notes: text('notes'),
    /** confirmed | cancelled */
    status: text('status').notNull().default('confirmed'),
    recordedBy: uuid('recorded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index('waste_created_idx').on(table.createdAt)],
)

/* ------------------------------------------------------------------ */
/* NOTIFICATIONS (Phase 6)                                             */
/* ------------------------------------------------------------------ */
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    /** low_stock | expiry | inventory | system */
    type: text('type').notNull(),
    /** info | warning | critical */
    severity: text('severity').notNull().default('info'),
    title: text('title').notNull(),
    body: text('body').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    /** low-stock alerts auto-resolve when stock is replenished */
    resolved: boolean('resolved').notNull().default(false),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('notifications_created_idx').on(table.createdAt),
    index('notifications_resolved_idx').on(table.resolved, table.type, table.entityId),
  ],
)

export const notificationReads = pgTable(
  'notification_reads',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: timestamp('read_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('notification_reads_unique').on(table.notificationId, table.userId),
  ],
)

export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dhKey: text('p256dh_key').notNull(),
    authKey: text('auth_key').notNull(),
    userAgent: text('user_agent'),
    failureCount: integer('failure_count').notNull().default(0),
    isActive: boolean('is_active').notNull().default(true),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('push_subscriptions_endpoint_unique').on(table.endpoint)],
)
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    details: jsonb('details'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('audit_logs_user_id_idx').on(table.userId),
    index('audit_logs_created_at_idx').on(table.createdAt),
  ],
)

/* ------------------------------------------------------------------ */
/* EXPENSE CATEGORIES & EXPENSES — operating costs that are NOT        */
/* ingredient purchases (rent, utilities, salaries, marketing, etc.).  */
/* ------------------------------------------------------------------ */
export const expenseCategories = pgTable(
  'expense_categories',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [uniqueIndex('expense_categories_name_unique').on(table.name)],
)

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    expenseDate: date('expense_date').notNull(),
    categoryId: uuid('category_id').references(() => expenseCategories.id, {
      onDelete: 'set null',
    }),
    description: text('description').notNull(),
    amountPoisha: integer('amount_poisha').notNull(),
    /** cash | bkash | nagad | bank | other */
    paymentMethod: text('payment_method').notNull().default('cash'),
    isPaid: boolean('is_paid').notNull().default(true),
    paidAt: date('paid_at'),
    notes: text('notes'),
    /** confirmed | cancelled */
    status: text('status').notNull().default('confirmed'),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('expenses_date_idx').on(table.expenseDate),
    index('expenses_category_idx').on(table.categoryId),
    index('expenses_status_idx').on(table.status),
  ],
)

/* ------------------------------------------------------------------ */
/* PARTNERS & PARTNER LEDGER — ownership plus capital / drawings.      */
/* Amounts are in poisha. Ownership is stored in basis points          */
/* (100% = 10000) so percentages stay exact.                            */
/* ------------------------------------------------------------------ */
export const partners = pgTable(
  'partners',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),
    ownershipBasisPoints: integer('ownership_basis_points')
      .notNull()
      .default(0),
    notes: text('notes'),
    isActive: boolean('is_active').notNull().default(true),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('partners_email_unique').on(table.email),
    index('partners_active_idx').on(table.isActive),
  ],
)

export const partnerTransactions = pgTable(
  'partner_transactions',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'cascade' }),
    /** capital_contribution | drawing | profit_share | loan | loan_repayment */
    type: text('type').notNull(),
    amountPoisha: integer('amount_poisha').notNull(),
    transactionDate: date('transaction_date').notNull(),
    description: text('description'),
    /** confirmed | cancelled */
    status: text('status').notNull().default('confirmed'),
    recordedBy: uuid('recorded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('partner_transactions_partner_idx').on(
      table.partnerId,
      table.transactionDate,
    ),
    index('partner_transactions_type_idx').on(table.type),
  ],
)

/* ------------------------------------------------------------------ */
/* SYSTEM SETTINGS — a small key/value store for business preferences. */
/* ------------------------------------------------------------------ */
export const systemSettings = pgTable('system_settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
})

/* ------------------------------------------------------------------ */
/* MANUAL INVENTORY USAGE — stock used outside sales/production/waste  */
/* (staff meals, samples, testing, etc.). Each record is linked to an  */
/* immutable `manual_usage` inventory movement; nothing is hard-deleted.*/
/* ------------------------------------------------------------------ */
export const manualUsageRecords = pgTable(
  'manual_usage_records',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    quantityBase: integer('quantity_base').notNull(),
    /** weighted-average cost per base unit at the time of usage (poisha) */
    unitCostPoisha: integer('unit_cost_poisha').notNull().default(0),
    /** staff_meal | sample | testing | personal | other */
    reason: text('reason').notNull(),
    notes: text('notes'),
    /** confirmed | cancelled */
    status: text('status').notNull().default('confirmed'),
    /** the inventory_movements row that recorded the deduction */
    movementId: uuid('movement_id'),
    recordedBy: uuid('recorded_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('manual_usage_created_idx').on(table.createdAt),
    index('manual_usage_ingredient_idx').on(table.ingredientId),
  ],
)

/* ------------------------------------------------------------------ */
/* STOCK RECONCILIATIONS — end-of-day physical counts.                 */
/* Confirming a count creates an explicit `adjustment` movement for     */
/* the difference (stock is never silently overwritten).               */
/* ------------------------------------------------------------------ */
export const stockReconciliations = pgTable(
  'stock_reconciliations',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    reconciliationDate: date('reconciliation_date').notNull(),
    ingredientId: uuid('ingredient_id')
      .notNull()
      .references(() => ingredients.id, { onDelete: 'cascade' }),
    expectedBase: integer('expected_base').notNull(),
    actualBase: integer('actual_base').notNull(),
    /** actual - expected (positive = excess, negative = shortage) */
    differenceBase: integer('difference_base').notNull(),
    explanation: text('explanation'),
    /** the adjustment movement created to align stock with the count */
    adjustmentMovementId: uuid('adjustment_movement_id'),
    confirmedBy: uuid('confirmed_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex('stock_reconciliations_date_ingredient_unique').on(
      table.reconciliationDate,
      table.ingredientId,
    ),
    index('stock_reconciliations_date_idx').on(table.reconciliationDate),
  ],
)
