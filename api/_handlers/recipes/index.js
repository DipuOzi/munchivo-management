/**
 * GET  /api/recipes  — list recipes with items + ingredient info
 * POST /api/recipes  — create recipe (items validated against inventory)
 *
 * Body: {
 *   name, category?, yieldUnit, baseYield, instructions?, prepTimeMinutes?,
 *   packagingCost (taka), otherDirectCost (taka), notes?,
 *   items: [{ ingredientId, quantityBase }]   // base units (g/ml/pcs)
 * }
 */
import { asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { toBase, takaToPoisha } from '../../../src/shared/units.js'

async function attachItems(recipes) {
  if (recipes.length === 0) return []
  const ids = recipes.map((r) => r.id)
  const items = await db
    .select({
      id: schema.recipeItems.id,
      recipeId: schema.recipeItems.recipeId,
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
    .where(inArray(schema.recipeItems.recipeId, ids))

  return recipes.map((r) => ({
    ...r,
    items: items.filter((i) => i.recipeId === r.id),
  }))
}

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x')
      const status = url.searchParams.get('status') || 'active'

      const rows = await db
        .select()
        .from(schema.recipes)
        .where(status === 'all' ? undefined : eq(schema.recipes.status, status))
        .orderBy(asc(schema.recipes.name))

      return sendJson(res, 200, { recipes: await attachItems(rows) })
    }

    // POST
    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Recipe name is required.' })

    const yieldUnit = (body.yieldUnit || '').trim()
    if (!yieldUnit) return sendJson(res, 400, { error: 'Yield unit is required.' })

    const baseYieldBase = toBase(body.baseYield, yieldUnit)
    if (baseYieldBase <= 0) {
      return sendJson(res, 400, { error: 'Base yield must be greater than zero.' })
    }

    const rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) {
      return sendJson(res, 400, { error: 'A recipe needs at least one ingredient.' })
    }

    const items = []
    for (const item of rawItems) {
      if (!item.ingredientId || !Number.isFinite(Number(item.quantityBase)) || Number(item.quantityBase) <= 0) {
        return sendJson(res, 400, { error: 'Every recipe item needs an ingredient and a quantity.' })
      }
      items.push({
        ingredientId: item.ingredientId,
        quantityBase: Math.round(Number(item.quantityBase)),
      })
    }

    // Verify ingredients exist
    const ingredientIds = [...new Set(items.map((i) => i.ingredientId))]
    const found = await db
      .select({ id: schema.ingredients.id })
      .from(schema.ingredients)
      .where(inArray(schema.ingredients.id, ingredientIds))
    if (found.length !== ingredientIds.length) {
      return sendJson(res, 400, { error: 'One or more selected ingredients were not found.' })
    }

    const recipe = await db.transaction(async (tx) => {
      const [recipe] = await tx
        .insert(schema.recipes)
        .values({
          name,
          category: body.category?.trim() || null,
          yieldUnit,
          baseYieldBase,
          instructions: body.instructions?.trim() || null,
          prepTimeMinutes: body.prepTimeMinutes ? Math.round(Number(body.prepTimeMinutes)) : null,
          packagingCostPoisha: takaToPoisha(body.packagingCost || 0),
          otherDirectCostPoisha: takaToPoisha(body.otherDirectCost || 0),
          notes: body.notes?.trim() || null,
          createdBy: user.id,
        })
        .returning()

      for (const item of items) {
        await tx.insert(schema.recipeItems).values({ ...item, recipeId: recipe.id })
      }
      return recipe
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'recipe.create',
      entity: 'recipe',
      entityId: recipe.id,
      details: { name },
    })

    return sendJson(res, 201, { recipe })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'A recipe with this name already exists.' })
    }
    console.error('recipes error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
