/**
 * GET    /api/recipes/:id  — detail with items + ingredient info
 * PATCH  /api/recipes/:id  — edit (replaces items atomically)
 * DELETE /api/recipes/:id  — archive (products keep reference; history kept)
 */
import { eq, inArray } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { toBase, takaToPoisha } from '../../../src/shared/units.js'

export default async function handler(req, res) {
  if (!['GET', 'PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Recipe id is required.' })

  try {
    const [recipe] = await db
      .select()
      .from(schema.recipes)
      .where(eq(schema.recipes.id, id))
      .limit(1)

    if (!recipe) return sendJson(res, 404, { error: 'Recipe not found.' })

    if (req.method === 'GET') {
      const items = await db
        .select({
          id: schema.recipeItems.id,
          ingredientId: schema.recipeItems.ingredientId,
          quantityBase: schema.recipeItems.quantityBase,
          ingredient: {
            name: schema.ingredients.name,
            displayUnit: schema.ingredients.displayUnit,
            unitType: schema.ingredients.unitType,
            avgCostPoisha: schema.ingredients.avgCostPoisha,
            currentStockBase: schema.ingredients.currentStockBase,
          },
        })
        .from(schema.recipeItems)
        .innerJoin(schema.ingredients, eq(schema.recipeItems.ingredientId, schema.ingredients.id))
        .where(eq(schema.recipeItems.recipeId, id))
      return sendJson(res, 200, { recipe, items })
    }

    if (req.method === 'DELETE') {
      await db
        .update(schema.recipes)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(schema.recipes.id, id))
      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'recipe.archive',
        entity: 'recipe',
        entityId: id,
      })
      return sendJson(res, 200, { ok: true })
    }

    // PATCH
    const body = await readJson(req)
    const updates = { updatedAt: new Date() }

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return sendJson(res, 400, { error: 'Name cannot be empty.' })
      updates.name = name
    }
    if (body.category !== undefined) updates.category = body.category?.trim() || null
    if (body.yieldUnit !== undefined) {
      const yieldUnit = body.yieldUnit.trim()
      if (!yieldUnit) return sendJson(res, 400, { error: 'Yield unit is required.' })
      updates.yieldUnit = yieldUnit
    }
    if (body.baseYield !== undefined) {
      const baseYieldBase = toBase(body.baseYield, updates.yieldUnit || recipe.yieldUnit)
      if (baseYieldBase <= 0)
        return sendJson(res, 400, { error: 'Base yield must be greater than zero.' })
      updates.baseYieldBase = baseYieldBase
    }
    for (const field of ['instructions', 'notes']) {
      if (body[field] !== undefined) updates[field] = body[field]?.trim() || null
    }
    if (body.prepTimeMinutes !== undefined)
      updates.prepTimeMinutes = body.prepTimeMinutes ? Math.round(Number(body.prepTimeMinutes)) : null
    if (body.packagingCost !== undefined)
      updates.packagingCostPoisha = takaToPoisha(body.packagingCost || 0)
    if (body.otherDirectCost !== undefined)
      updates.otherDirectCostPoisha = takaToPoisha(body.otherDirectCost || 0)
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(body.status))
        return sendJson(res, 400, { error: 'Invalid status.' })
      updates.status = body.status
    }

    await db.transaction(async (tx) => {
      await tx.update(schema.recipes).set(updates).where(eq(schema.recipes.id, id))

      if (Array.isArray(body.items)) {
        if (body.items.length === 0) {
          const err = new Error('A recipe needs at least one ingredient.')
          err.statusCode = 400
          throw err
        }
        const items = []
        for (const item of body.items) {
          if (!item.ingredientId || Number(item.quantityBase) <= 0) {
            const err = new Error('Every recipe item needs an ingredient and a quantity.')
            err.statusCode = 400
            throw err
          }
          items.push({
            ingredientId: item.ingredientId,
            quantityBase: Math.round(Number(item.quantityBase)),
          })
        }
        await tx.delete(schema.recipeItems).where(eq(schema.recipeItems.recipeId, id))
        for (const item of items) {
          await tx.insert(schema.recipeItems).values({ ...item, recipeId: id })
        }
      }
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'recipe.update',
      entity: 'recipe',
      entityId: id,
    })

    return sendJson(res, 200, { ok: true })
  } catch (err) {
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'A recipe with this name already exists.' })
    }
    console.error('recipe detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
