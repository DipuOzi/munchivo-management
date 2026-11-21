/**
 * USAGE & RECONCILIATION — shared computation.
 *
 * Every figure is derived from the immutable `inventory_movements` ledger,
 * so reports never change when purchase prices change later and there is
 * no second/parallel stock ledger.
 *
 * Sign convention: quantityDeltaBase is + for stock in, - for stock out.
 * A movement's cost = quantityDeltaBase * unitCostPoisha (poisha).
 */
import { and, desc, eq, gte, lt } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'

/** Movement types grouped into usage buckets. Adjustments are tracked apart. */
export const TYPE_GROUPS = {
  sales: ['sale_consumption', 'sale_reversal'],
  waste: ['waste', 'waste_reversal'],
  manual: ['manual_usage', 'manual_usage_reversal'],
  expiry: ['expiry'],
}
export const CONSUMPTION_TYPES = new Set([
  'sale_consumption',
  'sale_reversal',
  'waste',
  'waste_reversal',
  'manual_usage',
  'manual_usage_reversal',
  'expiry',
])

const DAY_MS = 24 * 60 * 60 * 1000

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function resolveRange({ range, start, end } = {}) {
  const today = startOfDay(new Date())
  let s
  let e
  let label
  if (range === 'yesterday') {
    e = today
    s = new Date(today.getTime() - DAY_MS)
    label = 'Yesterday'
  } else if (range === '7d') {
    e = new Date(today.getTime() + DAY_MS)
    s = new Date(today.getTime() - 6 * DAY_MS)
    label = 'Last 7 days'
  } else if (range === '30d') {
    e = new Date(today.getTime() + DAY_MS)
    s = new Date(today.getTime() - 29 * DAY_MS)
    label = 'Last 30 days'
  } else if (range === 'custom' && start && end) {
    s = new Date(`${start}T00:00:00`)
    const endDate = new Date(`${end}T00:00:00`)
    e = new Date(endDate.getTime() + DAY_MS)
    label = 'Custom range'
  } else {
    e = new Date(today.getTime() + DAY_MS)
    s = today
    label = 'Today'
  }
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime()) || e <= s) {
    e = new Date(today.getTime() + DAY_MS)
    s = today
    label = 'Today'
  }
  const span = e.getTime() - s.getTime()
  return {
    start: s,
    end: e,
    prevStart: new Date(s.getTime() - span),
    prevEnd: s,
    label,
  }
}

function dayKey(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

async function loadMovements(start, end) {
  return db
    .select({
      ingredientId: schema.ingredients.id,
      name: schema.ingredients.name,
      category: schema.ingredients.category,
      unitType: schema.ingredients.unitType,
      displayUnit: schema.ingredients.displayUnit,
      avgCostPoisha: schema.ingredients.avgCostPoisha,
      currentStockBase: schema.ingredients.currentStockBase,
      movementType: schema.inventoryMovements.movementType,
      quantityDeltaBase: schema.inventoryMovements.quantityDeltaBase,
      unitCostPoisha: schema.inventoryMovements.unitCostPoisha,
      createdAt: schema.inventoryMovements.createdAt,
    })
    .from(schema.inventoryMovements)
    .innerJoin(
      schema.ingredients,
      eq(schema.inventoryMovements.ingredientId, schema.ingredients.id),
    )
    .where(
      and(
        gte(schema.inventoryMovements.createdAt, start),
        lt(schema.inventoryMovements.createdAt, end),
      ),
    )
}

function emptyBucket() {
  return { qty: 0, cost: 0 }
}

/**
 * Aggregate a movement list into buckets + per-ingredient + per-day series.
 */
function aggregate(rows) {
  const byType = {
    sales: emptyBucket(),
    waste: emptyBucket(),
    manual: emptyBucket(),
    expiry: emptyBucket(),
    adjustment: emptyBucket(),
  }
  const perIngredient = new Map()
  const perCategory = new Map()
  const perDay = new Map()
  const qtyByUnitType = { mass: 0, volume: 0, count: 0, other: 0 }

  for (const r of rows) {
    const delta = r.quantityDeltaBase
    const cost = delta * (r.unitCostPoisha || 0)
    const type = r.movementType

    let bucket = null
    for (const [name, types] of Object.entries(TYPE_GROUPS)) {
      if (types.includes(type)) {
        bucket = byType[name]
        break
      }
    }
    if (!bucket && type === 'adjustment') bucket = byType.adjustment

    // Net consumption is the negative of the signed delta.
    if (bucket) {
      bucket.qty += -delta
      bucket.cost += -cost
    }

    // Per-ingredient consumption (only true consumption types).
    if (CONSUMPTION_TYPES.has(type)) {
      if (!perIngredient.has(r.ingredientId)) {
        perIngredient.set(r.ingredientId, {
          ingredientId: r.ingredientId,
          name: r.name,
          category: r.category,
          unitType: r.unitType,
          displayUnit: r.displayUnit,
          currentStockBase: r.currentStockBase,
          avgCostPoisha: r.avgCostPoisha,
          salesQty: 0,
          salesCost: 0,
          wasteQty: 0,
          wasteCost: 0,
          manualQty: 0,
          manualCost: 0,
          expiryQty: 0,
          expiryCost: 0,
          totalQty: 0,
          totalCost: 0,
        })
      }
      const ing = perIngredient.get(r.ingredientId)
      const q = -delta
      const c = -cost
      ing.totalQty += q
      ing.totalCost += c
      if (TYPE_GROUPS.sales.includes(type)) {
        ing.salesQty += q
        ing.salesCost += c
      } else if (TYPE_GROUPS.waste.includes(type)) {
        ing.wasteQty += q
        ing.wasteCost += c
      } else if (TYPE_GROUPS.manual.includes(type)) {
        ing.manualQty += q
        ing.manualCost += c
      } else if (TYPE_GROUPS.expiry.includes(type)) {
        ing.expiryQty += q
        ing.expiryCost += c
      }
      qtyByUnitType[r.unitType] = (qtyByUnitType[r.unitType] || 0) + q

      // Per-category consumption cost.
      const cat = r.category || 'General'
      const catCost = (perCategory.get(cat) || 0) + c
      perCategory.set(cat, catCost)

      // Per-day consumption cost.
      const key = dayKey(r.createdAt)
      perDay.set(key, (perDay.get(key) || 0) + c)
    }
  }

  return { byType, perIngredient, perCategory, perDay, qtyByUnitType }
}

function consumptionTotals(byType) {
  const sales = byType.sales
  const waste = byType.waste
  const manual = byType.manual
  const expiry = byType.expiry
  const totalCost = sales.cost + waste.cost + manual.cost + expiry.cost
  return {
    sales,
    waste,
    manual,
    expiry,
    adjustment: byType.adjustment,
    otherCost: manual.cost + expiry.cost,
    totalCost,
  }
}

/**
 * Full dashboard payload for a resolved range.
 */
export async function buildDashboard(rangeParams) {
  const { start, end, prevStart, prevEnd, label } = resolveRange(rangeParams)

  const [rows, prevRows] = await Promise.all([
    loadMovements(start, end),
    loadMovements(prevStart, prevEnd),
  ])

  const agg = aggregate(rows)
  const prevAgg = aggregate(prevRows)
  const totals = consumptionTotals(agg.byType)

  // Per-day consumption cost series (fill gaps with zero).
  const daily = []
  const totalDays = Math.min(Math.round((end - start) / DAY_MS), 366)
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(start.getTime() + i * DAY_MS)
    const key = dayKey(d)
    daily.push({ day: key, cost: agg.perDay.get(key) || 0 })
  }

  // Ingredient-wise consumption (sorted by cost desc).
  const ingredients = [...agg.perIngredient.values()].sort(
    (a, b) => b.totalCost - a.totalCost,
  )

  // Usage by category.
  const byCategory = [...agg.perCategory.entries()]
    .map(([category, cost]) => ({ category, cost }))
    .sort((a, b) => b.cost - a.cost)

  // Unusual consumption: current range cost > 2x previous window, with a
  // meaningful floor, per ingredient.
  const unusual = []
  for (const ing of ingredients) {
    const prev = prevAgg.perIngredient.get(ing.ingredientId)
    const prevCost = prev?.totalCost || 0
    if (ing.totalCost >= 10000 && prevCost > 0 && ing.totalCost > prevCost * 2) {
      unusual.push({
        ingredientId: ing.ingredientId,
        name: ing.name,
        currentCost: ing.totalCost,
        previousCost: prevCost,
      })
    }
  }

  // Expected closing inventory value (current stock on hand at avg cost).
  const [valueRow] = await db
    .select({
      value: sqlSum(),
      count: sqlCount(),
    })
    .from(schema.ingredients)
    .where(eq(schema.ingredients.status, 'active'))

  return {
    range: { start: dayKey(start), end: dayKey(new Date(end.getTime() - DAY_MS)), label },
    summary: {
      totalConsumptionCost: totals.totalCost,
      salesCost: totals.sales.cost,
      wasteCost: totals.waste.cost,
      manualCost: totals.manual.cost,
      expiryCost: totals.expiry.cost,
      otherCost: totals.otherCost,
      adjustmentCost: totals.adjustment.cost,
      adjustmentQty: totals.adjustment.qty,
      ingredientsUsed: ingredients.length,
      unusualCount: unusual.length,
      expectedClosingValue: Number(valueRow?.value || 0),
      qtyByUnitType: agg.qtyByUnitType,
    },
    daily,
    ingredients,
    byCategory,
    byType: {
      sales: totals.sales,
      waste: totals.waste,
      manual: totals.manual,
      expiry: totals.expiry,
      other: { qty: totals.manual.qty + totals.expiry.qty, cost: totals.otherCost },
    },
    unusual,
  }
}

/* Small SQL helpers to avoid importing the whole sql builder repeatedly. */
import { sql } from 'drizzle-orm'
function sqlSum() {
  return sql`COALESCE(SUM(${schema.ingredients.currentStockBase} * ${schema.ingredients.avgCostPoisha}), 0)::bigint`
}
function sqlCount() {
  return sql`COUNT(*)::int`
}

/**
 * Day sheet for a single date: per-ingredient opening, movements, closing,
 * and any confirmed reconciliation.
 */
export async function buildDaySheet(dateStr, { ingredientId, search } = {}) {
  const dayStart = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(dayStart.getTime())) {
    const err = new Error('Invalid date.')
    err.statusCode = 400
    throw err
  }
  const dayEnd = new Date(dayStart.getTime() + DAY_MS)

  // Closing balance as of end-of-day = last balanceAfter before dayEnd.
  const lastRows = await db
    .selectDistinctOn([schema.inventoryMovements.ingredientId], {
      ingredientId: schema.inventoryMovements.ingredientId,
      balanceAfterBase: schema.inventoryMovements.balanceAfterBase,
    })
    .from(schema.inventoryMovements)
    .where(lt(schema.inventoryMovements.createdAt, dayEnd))
    .orderBy(
      schema.inventoryMovements.ingredientId,
      desc(schema.inventoryMovements.createdAt),
    )
  const closingMap = new Map(lastRows.map((r) => [r.ingredientId, r.balanceAfterBase]))

  // Movements during the day.
  const dayRows = await db
    .select({
      ingredientId: schema.ingredients.id,
      name: schema.ingredients.name,
      category: schema.ingredients.category,
      unitType: schema.ingredients.unitType,
      displayUnit: schema.ingredients.displayUnit,
      currentStockBase: schema.ingredients.currentStockBase,
      movementType: schema.inventoryMovements.movementType,
      quantityDeltaBase: schema.inventoryMovements.quantityDeltaBase,
      unitCostPoisha: schema.inventoryMovements.unitCostPoisha,
    })
    .from(schema.inventoryMovements)
    .innerJoin(
      schema.ingredients,
      eq(schema.inventoryMovements.ingredientId, schema.ingredients.id),
    )
    .where(
      and(
        gte(schema.inventoryMovements.createdAt, dayStart),
        lt(schema.inventoryMovements.createdAt, dayEnd),
      ),
    )

  // Confirmed reconciliations for this date.
  const reconRows = await db
    .select()
    .from(schema.stockReconciliations)
    .where(eq(schema.stockReconciliations.reconciliationDate, dateStr))
  const reconMap = new Map(reconRows.map((r) => [r.ingredientId, r]))

  // Aggregate day movements per ingredient.
  const perIng = new Map()
  const ensure = (id, meta) => {
    if (!perIng.has(id)) {
      perIng.set(id, {
        ingredientId: id,
        name: meta.name,
        category: meta.category,
        displayUnit: meta.displayUnit,
        unitType: meta.unitType,
        openingBase: 0,
        purchasedBase: 0,
        salesBase: 0,
        productionBase: 0,
        wasteBase: 0,
        otherBase: 0,
        adjustmentBase: 0,
        totalConsumedBase: 0,
        consumptionCost: 0,
        expectedClosingBase: 0,
        actualClosingBase: null,
        differenceBase: null,
        explanation: null,
        reconciled: false,
      })
    }
    return perIng.get(id)
  }

  // Seed from closing map so ingredients with no movement still appear.
  for (const [id, closing] of closingMap.entries()) {
    ensure(id, { name: null, displayUnit: null })
  }

  for (const r of dayRows) {
    const ing = ensure(r.ingredientId, r)
    if (r.name) ing.name = r.name
    if (r.displayUnit) ing.displayUnit = r.displayUnit
    if (r.category) ing.category = r.category
    if (r.unitType) ing.unitType = r.unitType
    const delta = r.quantityDeltaBase
    const type = r.movementType
    if (type === 'purchase' || type === 'opening_stock') ing.purchasedBase += delta
    else if (TYPE_GROUPS.sales.includes(type)) {
      ing.salesBase += -delta
      ing.consumptionCost += -delta * (r.unitCostPoisha || 0)
    } else if (type === 'waste' || type === 'waste_reversal') {
      ing.wasteBase += -delta
      ing.consumptionCost += -delta * (r.unitCostPoisha || 0)
    } else if (
      type === 'manual_usage' ||
      type === 'manual_usage_reversal' ||
      type === 'expiry'
    ) {
      ing.otherBase += -delta
      ing.consumptionCost += -delta * (r.unitCostPoisha || 0)
    } else if (type === 'adjustment') {
      ing.adjustmentBase += delta
    }
  }

  // Finalize per ingredient.
  const list = []
  for (const ing of perIng.values()) {
    if (!ing.name) continue // skip ingredients with no name (shouldn't happen)
    ing.totalConsumedBase =
      ing.salesBase + ing.wasteBase + ing.otherBase
    const closing = closingMap.get(ing.ingredientId) ?? 0
    ing.expectedClosingBase = closing
    ing.openingBase = closing - (ing.purchasedBase - ing.totalConsumedBase + ing.adjustmentBase)
    const recon = reconMap.get(ing.ingredientId)
    if (recon) {
      ing.actualClosingBase = recon.actualBase
      ing.differenceBase = recon.differenceBase
      ing.explanation = recon.explanation
      ing.reconciled = true
    }
    list.push(ing)
  }

  // Apply filters.
  let filtered = list
  if (ingredientId) filtered = filtered.filter((i) => i.ingredientId === ingredientId)
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter((i) => (i.name || '').toLowerCase().includes(q))
  }
  filtered.sort((a, b) => b.totalConsumedBase - a.totalConsumedBase || (a.name || '').localeCompare(b.name || ''))

  return {
    date: dateStr,
    ingredients: filtered,
    reconciliations: reconRows,
    totals: filtered.reduce(
      (acc, i) => {
        acc.consumptionCost += i.consumptionCost
        acc.totalConsumedBase += i.totalConsumedBase
        return acc
      },
      { consumptionCost: 0, totalConsumedBase: 0 },
    ),
  }
}