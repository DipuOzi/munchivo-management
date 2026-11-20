/**
 * PATCH  /api/products/:id  — edit
 * DELETE /api/products/:id  — archive (sales history kept in Phase 5+)
 */
import { eq } from 'drizzle-orm'
import { db, schema } from '../../../src/db/index.js'
import { readJson, sendJson } from '../../_lib/http.js'
import { withAuth } from '../../_lib/guard.js'
import { takaToPoisha } from '../../../src/shared/units.js'

export default async function handler(req, res) {
  if (!['PATCH', 'DELETE'].includes(req.method)) {
    return sendJson(res, 405, { error: 'Method not allowed.' })
  }
  const user = await withAuth(req, res)
  if (!user) return

  const id = req.params?.id || req.query?.id
  if (!id) return sendJson(res, 400, { error: 'Product id is required.' })

  try {
    const [product] = await db
      .select()
      .from(schema.products)
      .where(eq(schema.products.id, id))
      .limit(1)

    if (!product) return sendJson(res, 404, { error: 'Product not found.' })

    if (req.method === 'DELETE') {
      await db
        .update(schema.products)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(schema.products.id, id))
      await db.insert(schema.auditLogs).values({
        userId: user.id,
        action: 'product.archive',
        entity: 'product',
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
    if (body.categoryId !== undefined) updates.categoryId = body.categoryId || null
    if (body.description !== undefined) updates.description = body.description?.trim() || null
    if (body.sellingPrice !== undefined) {
      const sellingPricePoisha = takaToPoisha(body.sellingPrice)
      if (sellingPricePoisha <= 0)
        return sendJson(res, 400, { error: 'Selling price must be greater than zero.' })
      updates.sellingPricePoisha = sellingPricePoisha
    }
    if (body.recipeId !== undefined) updates.recipeId = body.recipeId || null
    if (body.packagingCost !== undefined)
      updates.packagingCostPoisha = takaToPoisha(body.packagingCost || 0)
    if (body.notes !== undefined) updates.notes = body.notes?.trim() || null
    if (body.status !== undefined) {
      if (!['active', 'archived'].includes(body.status))
        return sendJson(res, 400, { error: 'Invalid status.' })
      updates.status = body.status
    }

    const [updated] = await db
      .update(schema.products)
      .set(updates)
      .where(eq(schema.products.id, id))
      .returning()

    await db.insert(schema.auditLogs).values({
      userId: user.id,
      action: 'product.update',
      entity: 'product',
      entityId: id,
    })

    return sendJson(res, 200, { product: updated })
  } catch (err) {
    if (err.code === '23505') {
      return sendJson(res, 409, { error: 'A product with this name already exists.' })
    }
    console.error('product detail error:', err)
    return sendJson(res, 500, { error: 'Something went wrong. Please try again.' })
  }
}
