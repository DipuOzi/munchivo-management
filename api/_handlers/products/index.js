/**
 * GET  /api/products  — list with recipe profitability estimates
 * POST /api/products  — create
 *
 * Profitability is an ESTIMATE while there are no completed sales:
 * it uses the assigned recipe's current weighted-average ingredient
 * costs. Realized COGS per sale is captured in Phase 5.
 */
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { takaToPoisha } from '../../../src/shared/units.js'

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
        .select({
          id: schema.products.id,
          name: schema.products.name,
          description: schema.products.description,
          sellingPricePoisha: schema.products.sellingPricePoisha,
          packagingCostPoisha: schema.products.packagingCostPoisha,
          notes: schema.products.notes,
          status: schema.products.status,
          createdAt: schema.products.createdAt,
          categoryId: schema.products.categoryId,
          categoryName: schema.productCategories.name,
          recipeId: schema.products.recipeId,
          recipeName: schema.recipes.name,
          recipeYieldUnit: schema.recipes.yieldUnit,
          recipeYieldBase: schema.recipes.baseYieldBase,
          recipePackagingPoisha: schema.recipes.packagingCostPoisha,
          recipeOtherPoisha: schema.recipes.otherDirectCostPoisha,
          recipeIngredientCostPoisha: sql`(
            SELECT COALESCE(SUM(ri.quantity_base * ing.avg_cost_poisha), 0)::int
            FROM recipe_items ri
            JOIN ingredients ing ON ing.id = ri.ingredient_id
            WHERE ri.recipe_id = ${schema.products.recipeId}
          )`,
        })
        .from(schema.products)
        .leftJoin(schema.productCategories, eq(schema.products.categoryId, schema.productCategories.id))
        .leftJoin(schema.recipes, eq(schema.products.recipeId, schema.recipes.id))
        .where(status === 'all' ? undefined : eq(schema.products.status, status))
        .orderBy(asc(schema.products.name))

      // Estimated cost & margin per unit (one unit = one full recipe batch).
      const products = rows.map((p) => {
        let estimate = null
        if (p.recipeId && p.recipeYieldBase > 0) {
          const recipeTotal = p.recipeIngredientCostPoisha + p.recipePackagingPoisha + p.recipeOtherPoisha
          const ingredientCostPerUnit = p.recipeIngredientCostPoisha
          const totalCostPerUnit = recipeTotal + (p.packagingCostPoisha || 0)
          const grossProfitPoisha = p.sellingPricePoisha - totalCostPerUnit
          estimate = {
            recipeTotalPoisha: recipeTotal,
            ingredientCostPerUnit,
            totalCostPerUnit,
            grossProfitPoisha,
            marginPct:
              p.sellingPricePoisha > 0
                ? Math.round((grossProfitPoisha / p.sellingPricePoisha) * 1000) / 10
                : 0,
          }
        }
        return { ...p, estimate }
      })

      return sendJson(res, 200, { products })
    }

    // POST
    const body = await readJson(req)
    const name = (body.name || '').trim()
    if (!name) return sendJson(res, 400, { error: 'Product name is required.' })

    const sellingPricePoisha = takaToPoisha(body.sellingPrice)
    if (sellingPricePoisha <= 0) {
      return sendJson(res, 400, { error: 'Selling price must be greater than zero.' })
    }

    const [product] = await db
      .insert(schema.products)
      .values({
        name,
        categoryId: body.categoryId || null,
        description: body.description?.trim() || null,
        sellingPricePoisha,
        recipeId: body.recipeId || null,
        packagingCostPoisha: takaToPoisha(body.packagingCost || 0),
        notes: body.notes?.trim() || null,
        createdBy: user.id,
      })
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'product.create',
      entity: 'product',
      entityId: product.id,
      details: { name },
    })

    return sendJson(res, 201, { product })    } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'A product with this name already exists.' })
    }
    console.error('products error:', err, err.stack)
    return sendJson(res, 500, { error: err.message || 'Something went wrong. Please try again.' })
  }
}
