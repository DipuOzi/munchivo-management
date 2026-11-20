/**
 * GET  /api/sales  — list with filters (date range, payment, product)
 * POST /api/sales  — record a sale; deducts inventory per product workflow:
 *
 *   direct: ingredients deducted immediately via the product's recipe
 *   batch:  prepared stock (from production) deducted
 *
 * Duplicate submissions are blocked via the unique clientToken.
 *
 * Body: { items: [{ productId, quantity }], discount (taka, optional),
 *         paymentMethod, notes?, clientToken?, saleDate? (ISO) }
 */
import { and, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { db, schema } from '../../src/db/index.js'
import { readJson, sendJson } from '../_lib/http.js'
import { withAuth } from '../_lib/guard.js'
import { deductStock, consumePreparedStock, MOVEMENT_TYPES } from '../_lib/stock.js'
import { takaToPoisha } from '../../src/shared/units.js'

export default async function handler(req, res) {
  if (!['GET', 'POST'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x')
      const start = url.searchParams.get('start') // YYYY-MM-DD
      const end = url.searchParams.get('end')
      const payment = url.searchParams.get('payment')
      const productId = url.searchParams.get('productId')

      const conditions = []
      if (start) conditions.push(gte(schema.sales.saleDate, new Date(`${start}T00:00:00`)))
      if (end) conditions.push(lte(schema.sales.saleDate, new Date(`${end}T23:59:59.999`)))
      if (payment) conditions.push(eq(schema.sales.paymentMethod, payment))

      let rows = await db
        .select({
          id: schema.sales.id,
          orderNumber: schema.sales.orderNumber,
          saleDate: schema.sales.saleDate,
          subtotalPoisha: schema.sales.subtotalPoisha,
          discountPoisha: schema.sales.discountPoisha,
          totalPoisha: schema.sales.totalPoisha,
          refundPoisha: schema.sales.refundPoisha,
          cogsPoisha: schema.sales.cogsPoisha,
          paymentMethod: schema.sales.paymentMethod,
          status: schema.sales.status,
          notes: schema.sales.notes,
          creatorName: schema.users.name,
          itemCount: sql`(SELECT COALESCE(SUM(quantity), 0)::int FROM sale_items si WHERE si.sale_id = ${schema.sales.id})`,
          productNames: sql`(SELECT STRING_AGG(si.product_name, ', ') FROM sale_items si WHERE si.sale_id = ${schema.sales.id})`,
        })
        .from(schema.sales)
        .leftJoin(schema.users, eq(schema.sales.createdBy, schema.users.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.sales.saleDate))
        .limit(300)

      if (productId) {
        const matching = await db
          .selectDistinct({ saleId: schema.saleItems.saleId })
          .from(schema.saleItems)
          .where(eq(schema.saleItems.productId, productId))
        const ids = new Set(matching.map((m) => m.saleId))
        rows = rows.filter((r) => ids.has(r.id))
      }

      return sendJson(res, 200, { sales: rows })
    }

    // POST
    const body = await readJson(req)
    const items = Array.isArray(body.items) ? body.items : []
    if (items.length === 0) {
      return sendJson(res, 400, { error: 'At least one product is required.' })
    }
    for (const item of items) {
      if (!item.productId || !Number.isInteger(Number(item.quantity)) || Number(item.quantity) <= 0) {
        return sendJson(res, 400, { error: 'Every item needs a product and a whole-number quantity.' })
      }
    }

    const discountPoisha = Math.max(takaToPoisha(body.discount || 0), 0)

    // Idempotency: block duplicate client tokens.
    if (body.clientToken) {
      const existing = await db
        .select({ id: schema.sales.id, orderNumber: schema.sales.orderNumber })
        .from(schema.sales)
        .where(eq(schema.sales.clientToken, body.clientToken))
        .limit(1)
      if (existing.length > 0) {
        return sendJson(res, 200, { sale: existing[0], duplicate: true })
      }
    }

    const productIds = [...new Set(items.map((i) => i.productId))]
    const products = await db
      .select()
      .from(schema.products)
      .where(inArray(schema.products.id, productIds))
    if (products.length !== productIds.length) {
      return sendJson(res, 400, { error: 'One or more products were not found.' })
    }

    const recipeIds = [...new Set(products.filter((p) => p.recipeId).map((p) => p.recipeId))]
    const recipeMap = new Map()
    if (recipeIds.length > 0) {
      const recipeRows = await db
        .select()
        .from(schema.recipes)
        .where(inArray(schema.recipes.id, recipeIds))
      recipeRows.forEach((r) => recipeMap.set(r.id, r))
      const recipeItems = await db
        .select()
        .from(schema.recipeItems)
        .where(inArray(schema.recipeItems.recipeId, recipeIds))
      const itemsByRecipe = new Map()
      recipeItems.forEach((ri) => {
        if (!itemsByRecipe.has(ri.recipeId)) itemsByRecipe.set(ri.recipeId, [])
        itemsByRecipe.get(ri.recipeId).push(ri)
      })
      recipeMap.forEach((r, id) => (r.items = itemsByRecipe.get(id) || []))
    }

    const saleDate = body.saleDate ? new Date(body.saleDate) : new Date()
    if (Number.isNaN(saleDate.getTime())) {
      return sendJson(res, 400, { error: 'Invalid sale date.' })
    }

    const orderNumber = `MV-${saleDate.toISOString().slice(0, 10).replace(/-/g, '')}-${Date.now()
      .toString(36)
      .toUpperCase()
      .slice(-5)}`

    let saleTotal = 0
    let saleCogs = 0
    const itemLines = items.map((item) => {
      const product = products.find((p) => p.id === item.productId)
      const quantity = Number(item.quantity)
      const lineTotal = product.sellingPricePoisha * quantity
      saleTotal += lineTotal
      return { product, quantity, lineTotal }
    })

    // Discount cannot exceed the total.
    if (discountPoisha > saleTotal) {
      return sendJson(res, 400, { error: 'Discount cannot exceed the order total.' })
    }

    const sale = await db.transaction(async (tx) => {
      const itemRows = []
      for (const line of itemLines) {
        const { product, quantity, lineTotal } = line
        let cogs = 0
        let workflow = 'direct'

        if (product.workflow === 'batch') {
          // Prepared stock deducted; ingredients were already deducted
          // at production time — no double deduction.
          workflow = 'batch'
          const servingBase = product.servingSizeBase || null
          const recipe = product.recipeId ? recipeMap.get(product.recipeId) : null
          const perServingBase = servingBase || recipe?.baseYieldBase || null
          if (!perServingBase) {
            const err = new Error(
              `${product.name} uses batch workflow but has no serving size. Fix the product first.`,
            )
            err.statusCode = 400
            throw err
          }
          cogs = await consumePreparedStock(tx, {
            productId: product.id,
            quantityBase: perServingBase * quantity,
            userId: user.id,
          })
        } else if (product.recipeId) {
          const recipe = recipeMap.get(product.recipeId)
          if (recipe && recipe.items?.length) {
            for (const rItem of recipe.items) {
              const need = Math.round(rItem.quantityBase * quantity)
              if (need <= 0) continue
              cogs += await deductStock(tx, {
                ingredientId: rItem.ingredientId,
                quantityBase: need,
                movementType: MOVEMENT_TYPES.SALE_CONSUMPTION,
                userId: user.id,
                notes: `Sale ${orderNumber} (${product.name} ×${quantity})`,
              })
            }
          }
        }
        // Products without a recipe: no ingredient deduction (e.g. bought-in drinks).

        saleCogs += cogs
        itemRows.push({
          productId: product.id,
          productName: product.name,
          quantity,
          unitPricePoisha: product.sellingPricePoisha,
          lineTotalPoisha: lineTotal,
          workflow,
          recipeId: product.recipeId || null,
          cogsPoisha: cogs,
        })
      }

      const [sale] = await tx
        .insert(schema.sales)
        .values({
          orderNumber,
          saleDate,
          subtotalPoisha: saleTotal,
          discountPoisha,
          totalPoisha: saleTotal - discountPoisha,
          cogsPoisha: saleCogs,
          paymentMethod: body.paymentMethod || 'cash',
          notes: body.notes?.trim() || null,
          clientToken: body.clientToken || null,
          createdBy: user.id,
        })
        .returning()

      for (const row of itemRows) {
        await tx.insert(schema.saleItems).values({ ...row, saleId: sale.id })
      }
      return sale
    })

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'sale.create',
      entity: 'sale',
      entityId: sale.id,
      details: { orderNumber, total: sale.totalPoisha },
    })

    return sendJson(res, 201, { sale })
  } catch (err) {
    if (err.code === '23505' && err.detail?.includes('client_token')) {
      return sendJson(res, 200, { duplicate: true })
    }
    if (err.statusCode) return sendJson(res, err.statusCode, { error: err.message })
    console.error('sales error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
