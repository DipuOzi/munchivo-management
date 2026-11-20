/**
 * GET  /api/waste  — list waste records
 * POST /api/waste  — record waste (ingredient or prepared product):
 *   deducts stock with an immutable movement, cost = weighted average.
 *
 * Body: { ingredientId?, productId?, quantity (display unit), reason,
 *         notes? }
 */
import { desc, eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { deductStock, consumePreparedStock, MOVEMENT_TYPES } from '../../_lib/stock.js'
import { toBase, fromBase } from '../../../src/shared/units.js'

const REASONS = ['expired', 'spoiled', 'burnt', 'preparation_mistake', 'damaged', 'other']

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const rows = await db
        .select({
          id: schema.wasteRecords.id,
          quantityBase: schema.wasteRecords.quantityBase,
          reason: schema.wasteRecords.reason,
          estimatedCostPoisha: schema.wasteRecords.estimatedCostPoisha,
          notes: schema.wasteRecords.notes,
          status: schema.wasteRecords.status,
          createdAt: schema.wasteRecords.createdAt,
          ingredientName: schema.ingredients.name,
          ingredientUnit: schema.ingredients.displayUnit,
          productName: schema.products.name,
          recorderName: schema.users.name,
        })
        .from(schema.wasteRecords)
        .leftJoin(schema.ingredients, eq(schema.wasteRecords.ingredientId, schema.ingredients.id))
        .leftJoin(schema.products, eq(schema.wasteRecords.productId, schema.products.id))
        .leftJoin(schema.users, eq(schema.wasteRecords.recordedBy, schema.users.id))
        .orderBy(desc(schema.wasteRecords.createdAt))
        .limit(200)
      return sendJson(res, 200, { records: rows })
    }

    // POST
    const body = await readJson(req)
    if (!body.reason || !REASONS.includes(body.reason)) {
      return sendJson(res, 400, { error: 'Please choose a valid waste reason.' })
    }
    if (!body.ingredientId && !body.productId) {
      return sendJson(res, 400, { error: 'Waste must reference an ingredient or a product.' })
    }

    const record = await db.transaction(async (tx) => {
      let cost = 0
      let quantityBase = 0

      if (body.ingredientId) {
        const [ingredient] = await tx
          .select()
          .from(schema.ingredients)
          .where(eq(schema.ingredients.id, body.ingredientId))
          .limit(1)
        if (!ingredient) {
          const err = new Error('Ingredient not found.')
          err.statusCode = 400
          throw err
        }
        quantityBase = toBase(body.quantity, ingredient.displayUnit)
        if (quantityBase <= 0) {
          const err = new Error('Waste quantity must be greater than zero.')
          err.statusCode = 400
          throw err
        }
        cost = await deductStock(tx, {
          ingredientId: ingredient.id,
          quantityBase,
          movementType: MOVEMENT_TYPES.WASTE,
          userId: user.id,
          notes: `Waste (${body.reason})`,
        })
      } else {
        // Prepared product waste — consume from prepared stock.
        const [product] = await tx
          .select()
          .from(schema.products)
          .where(eq(schema.products.id, body.productId))
          .limit(1)
        if (!product) {
          const err = new Error('Product not found.')
          err.statusCode = 400
          throw err
        }
    const perServing = product.servingSizeBase ?? null
        if (!perServing) {
          const err = new Error(
            `${product.name} has no serving size — record ingredient waste instead.`,
          )
          err.statusCode = 400
          throw err
        }
        // quantity = number of servings wasted (whole number)
        const servings = Math.round(Number(body.quantity))
        if (!Number.isInteger(servings) || servings <= 0) {
          const err = new Error('Waste quantity (servings) must be a whole number greater than zero.')
          err.statusCode = 400
          throw err
        }
        quantityBase = perServing * servings
        cost = await consumePreparedStock(tx, {
          productId: product.id,
          quantityBase,
          userId: user.id,
        })
      }

      const [record] = await tx
        .insert(schema.wasteRecords)
        .values({
          ingredientId: body.ingredientId || null,
          productId: body.productId || null,
          quantityBase,
          reason: body.reason,
          estimatedCostPoisha: cost,
          notes: body.notes?.trim() || null,
          recordedBy: user.id,
        })
        .returning()
      return record
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'waste.create',
      entity: 'waste_record',
      entityId: record.id,
      details: { reason: body.reason, quantityBase: record.quantityBase },
    })

    return sendJson(res, 201, { record })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('waste error:', err)
    return sendJson(res, 500, { error: err.message || 'Something went wrong. Please try again.' })
  }
}
