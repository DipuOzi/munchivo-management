/**
 * STOCK ENGINE — every inventory change flows through here.
 * - Row-locked reads prevent race conditions.
 * - Negative stock is always blocked.
 * - Every change writes an immutable inventory_movement row.
 * - Low-stock notifications are created automatically and auto-resolve
 *   when stock is replenished above the threshold.
 *
 * All functions expect an active drizzle transaction (tx).
 */
import { and, desc, eq, lte, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'

export const MOVEMENT_TYPES = {
  OPENING: 'opening_stock',
  PURCHASE: 'purchase',
  PURCHASE_REVERSAL: 'purchase_reversal',
  ADJUSTMENT: 'adjustment',
  PRODUCTION_CONSUMPTION: 'production_consumption',
  PRODUCTION_REVERSAL: 'production_reversal',
  PRODUCTION_OUTPUT: 'production_output',
  SALE_CONSUMPTION: 'sale_consumption',
  SALE_REVERSAL: 'sale_reversal',
  WASTE: 'waste',
  WASTE_REVERSAL: 'waste_reversal',
  EXPIRY: 'expiry',
}

/**
 * Deduct stock. Returns the actual cost deducted (poisha) using the
 * ingredient's weighted-average cost. Throws when stock is insufficient.
 */
export async function deductStock(
  tx,
  { ingredientId, quantityBase, movementType, userId, notes, referenceId },
) {
  const [ingredient] = await tx
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, ingredientId))
    .limit(1)
    .for('update')

  if (!ingredient) {
    const err = new Error('Ingredient not found.')
    err.statusCode = 400
    throw err
  }

  const balanceAfter = ingredient.currentStockBase - quantityBase
  if (balanceAfter < 0) {
    const err = new Error(
      `Not enough ${ingredient.name} in stock (need ${quantityBase} base units, have ${ingredient.currentStockBase}).`,
    )
    err.statusCode = 400
    throw err
  }

  await tx
    .update(schema.ingredients)
    .set({ currentStockBase: balanceAfter, updatedAt: new Date() })
    .where(eq(schema.ingredients.id, ingredientId))

  const cogs = quantityBase * ingredient.avgCostPoisha

  await tx.insert(schema.inventoryMovements).values({
    ingredientId,
    movementType,
    quantityDeltaBase: -quantityBase,
    unitCostPoisha: ingredient.avgCostPoisha,
    balanceAfterBase: balanceAfter,
    userId,
    notes,
    ...(referenceId ? { purchaseId: movementType && movementType.includes('purchase') ? referenceId : null } : {}),
  })

  await checkLowStockTx(tx, { ...ingredient, currentStockBase: balanceAfter })
  return cogs
}

/**
 * Add stock back (reversals). Does NOT change the weighted average —
 * cost basis of the reversal is passed in when known.
 */
export async function addStock(
  tx,
  { ingredientId, quantityBase, movementType, userId, notes, unitCostPoisha },
) {
  const [ingredient] = await tx
    .select()
    .from(schema.ingredients)
    .where(eq(schema.ingredients.id, ingredientId))
    .limit(1)
    .for('update')

  if (!ingredient) {
    const err = new Error('Ingredient not found.')
    err.statusCode = 400
    throw err
  }

  const balanceAfter = ingredient.currentStockBase + quantityBase
  await tx
    .update(schema.ingredients)
    .set({ currentStockBase: balanceAfter, updatedAt: new Date() })
    .where(eq(schema.ingredients.id, ingredientId))

  await tx.insert(schema.inventoryMovements).values({
    ingredientId,
    movementType,
    quantityDeltaBase: quantityBase,
    unitCostPoisha: unitCostPoisha ?? ingredient.avgCostPoisha,
    balanceAfterBase: balanceAfter,
    userId,
    notes,
  })

  await checkLowStockTx(tx, { ...ingredient, currentStockBase: balanceAfter })
  return balanceAfter
}

/**
 * Low-stock detection: creates an unresolved notification when stock
 * falls to/below the threshold; auto-resolves existing ones when it
 * rises back above. Prevents duplicate unresolved alerts.
 */
export async function checkLowStockTx(tx, ingredient) {
  const threshold = ingredient.lowStockThresholdBase
  if (threshold <= 0) return null

  const isLow = ingredient.currentStockBase <= threshold
  const existing = await tx
    .select()
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.type, 'low_stock'),
        eq(schema.notifications.entityId, ingredient.id),
        eq(schema.notifications.resolved, false),
      ),
    )
    .limit(1)

  if (isLow && existing.length === 0) {
    const [notification] = await tx
      .insert(schema.notifications)
      .values({
        type: 'low_stock',
        severity: ingredient.currentStockBase === 0 ? 'critical' : 'warning',
        title: 'LOW STOCK ALERT',
        body: `${ingredient.name} is running low. Current stock: ${
          ingredient.currentStockBase
        } base ${ingredient.displayUnit}. Please arrange a purchase.`,
        entityType: 'ingredient',
        entityId: ingredient.id,
      })
      .returning()
    return notification
  }

  if (!isLow && existing.length > 0) {
    // Stock replenished above threshold — resolve open alerts.
    await tx
      .update(schema.notifications)
      .set({ resolved: true, resolvedAt: new Date() })
      .where(
        and(
          eq(schema.notifications.type, 'low_stock'),
          eq(schema.notifications.entityId, ingredient.id),
          eq(schema.notifications.resolved, false),
        ),
      )
  }
  return null
}

/**
 * Deduct from prepared stock (batch workflow) FEFO/oldest-first.
 * Returns actual cost deducted.
 */
export async function consumePreparedStock(
  tx,
  { productId, quantityBase, userId, saleId },
) {
  let remaining = quantityBase
  let cogs = 0

  const batches = await tx
    .select()
    .from(schema.preparedStock)
    .where(
      and(
        productId ? eq(schema.preparedStock.productId, productId) : sql`false`,
        eq(schema.preparedStock.status, 'active'),
      ),
    )
    .orderBy(schema.preparedStock.createdAt)

  const available = batches.reduce((s, b) => s + b.quantityRemainingBase, 0)
  if (available < remaining) {
    const err = new Error(
      `Not enough prepared stock (need ${quantityBase} base units, have ${available}). Run production first.`,
    )
    err.statusCode = 400
    throw err
  }

  for (const batch of batches) {
    if (remaining <= 0) break
    const take = Math.min(remaining, batch.quantityRemainingBase)
    await tx
      .update(schema.preparedStock)
      .set({
        quantityRemainingBase: batch.quantityRemainingBase - take,
        status: batch.quantityRemainingBase - take <= 0 ? 'depleted' : 'active',
      })
      .where(eq(schema.preparedStock.id, batch.id))
    cogs += take * batch.unitCostPoisha
    remaining -= take
  }
  return cogs
}
