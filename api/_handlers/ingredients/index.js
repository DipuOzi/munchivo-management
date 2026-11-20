/**
 * GET  /api/ingredients            — list (with stock, value, status filter, search, category)
 * POST /api/ingredients            — create (with optional opening stock)
 */
import { and, asc, desc, eq, ilike, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { toBase, takaToPoisha, unitTypeFor } from '../../../src/shared/units.js'

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x')
      const search = (url.searchParams.get('search') || '').trim()
      const category = (url.searchParams.get('category') || '').trim()
      const status = url.searchParams.get('status') || 'active'

      const conditions = []
      if (status !== 'all') conditions.push(eq(schema.ingredients.status, status))
      if (category) conditions.push(eq(schema.ingredients.category, category))
      if (search) conditions.push(ilike(schema.ingredients.name, `%${search}%`))

      const rows = await db
        .select({
          id: schema.ingredients.id,
          name: schema.ingredients.name,
          category: schema.ingredients.category,
          unitType: schema.ingredients.unitType,
          displayUnit: schema.ingredients.displayUnit,
          currentStockBase: schema.ingredients.currentStockBase,
          avgCostPoisha: schema.ingredients.avgCostPoisha,
          minStockBase: schema.ingredients.minStockBase,
          lowStockThresholdBase: schema.ingredients.lowStockThresholdBase,
          supplierId: schema.ingredients.supplierId,
          supplierName: schema.suppliers.name,
          storageLocation: schema.ingredients.storageLocation,
          trackExpiry: schema.ingredients.trackExpiry,
          notes: schema.ingredients.notes,
          status: schema.ingredients.status,
          createdAt: schema.ingredients.createdAt,
        })
        .from(schema.ingredients)
        .leftJoin(schema.suppliers, eq(schema.ingredients.supplierId, schema.suppliers.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(asc(schema.ingredients.name))

      // Category list for filter dropdown
      const cats = await db
        .selectDistinct({ category: schema.ingredients.category })
        .from(schema.ingredients)
        .orderBy(asc(schema.ingredients.category))

      return sendJson(res, 200, {
        ingredients: rows,
        categories: cats.map((c) => c.category),
      })
    }

    // POST — create ingredient
    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Ingredient name is required.' })

    const displayUnit = (body.displayUnit || '').trim()
    if (!displayUnit) return sendJson(res, 400, { error: 'Unit is required.' })

    const unitType = unitTypeFor(displayUnit)
    const initialQty = toBase(body.initialQuantity || 0, displayUnit)
    if (initialQty < 0) return sendJson(res, 400, { error: 'Initial quantity cannot be negative.' })

    const initialCost = takaToPoisha(body.initialTotalCost || 0)
    if (initialCost < 0) return sendJson(res, 400, { error: 'Purchase price cannot be negative.' })

    const minStock = toBase(body.minStock || 0, displayUnit)
    const lowStock = toBase(body.lowStockThreshold || 0, displayUnit)

    // Check if supplier exists (if provided) to give a clear error instead of 500
    let supplierExists = true
    if (body.supplierId) {
      const sup = await db.select({ id: schema.suppliers.id }).from(schema.suppliers).where(eq(schema.suppliers.id, body.supplierId)).limit(1)
      supplierExists = sup.length > 0
    }

    const created = await db.transaction(async (tx) => {
      const [ingredient] = await tx
        .insert(schema.ingredients)
        .values({
          name,
          category: (body.category || 'General').trim() || 'General',
          unitType,
          displayUnit,
          currentStockBase: initialQty,
          avgCostPoisha:
            initialQty > 0 && initialCost > 0
              ? Math.round(initialCost / initialQty)
              : 0,
          minStockBase: minStock,
          lowStockThresholdBase: lowStock,
          supplierId: body.supplierId || null,
          storageLocation: body.storageLocation?.trim() || null,
          trackExpiry: Boolean(body.trackExpiry),
          notes: body.notes?.trim() || null,
          createdBy: user.id,
        })
        .returning()

      if (initialQty > 0) {
        await tx.insert(schema.inventoryMovements).values({
          ingredientId: ingredient.id,
          movementType: 'opening_stock',
          quantityDeltaBase: initialQty,
          unitCostPoisha: ingredient.avgCostPoisha,
          balanceAfterBase: initialQty,
          userId: user.id,
          notes:
            initialCost > 0
              ? 'Opening stock (cost recorded for valuation)'
              : 'Opening stock',
        })
      }
      return ingredient
    })

    if (!supplierExists) {
      return sendJson(res, 400, { error: 'Selected supplier does not exist.' })
    }

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'ingredient.create',
      entity: 'ingredient',
      entityId: created.id,
      details: { name },
    })

    return sendJson(res, 201, { ingredient: created })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'An ingredient with this name already exists.' })
    }
    console.error('ingredients error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
