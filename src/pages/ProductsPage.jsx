import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, formatQty } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

const EMPTY = {
  name: '',
  categoryId: '',
  description: '',
  sellingPrice: '',
  recipeId: '',
  packagingCost: '',
  notes: '',
}

export default function ProductsPage() {
  const [rows, setRows] = useState([])
  const [recipes, setRecipes] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [statusFilter, setStatusFilter] = useState('active')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prod, rec, cat] = await Promise.all([
        api(`/api/products?status=${statusFilter}`),
        api('/api/recipes?status=active'),
        api('/api/categories'),
      ])
      setRows(prod.products)
      setRecipes(rec.recipes)
      setCategories(cat.categories)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div>
        <h1>Products</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Your sellable menu. Profits below are estimates from current ingredient
          costs — realized profits arrive with the Sales module.
        </p>
      </div>

      <div className="toolbar">
        <select
          className="toolbar__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          + Add Product
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🥪</span>
            <span className="empty__title">No products yet</span>
            <span className="empty__hint">
              Create your menu — assign a recipe to each product to see live
              profitability estimates.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Category</th>
                    <th>Recipe</th>
                    <th>Price</th>
                    <th>Est. cost</th>
                    <th>Est. margin</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <strong>{p.name}</strong>
                      {p.description && (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.description}</div>
                      )}
                    </td>
                    <td>{p.categoryName || '—'}</td>
                    <td>{p.recipeName || '—'}</td>
                    <td className="money">{formatMoney(p.sellingPricePoisha)}</td>
                    <td className="money">
                      {p.estimate ? formatMoney(p.estimate.totalCostPerUnit) : '—'}
                    </td>
                    <td>
                      {p.estimate ? (
                        <span
                          className={`badge ${p.estimate.marginPct >= 0 ? 'badge--success' : 'badge--danger'}`}
                        >
                          {p.estimate.marginPct}% · {formatMoney(p.estimate.grossProfitPoisha)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      <span className={`badge ${p.status === 'active' ? 'badge--success' : 'badge--neutral'}`}>
                        {p.status === 'active' ? 'Active' : 'Archived'}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="link-btn" onClick={() => setEditing(p)}>
                          Edit
                        </button>
                        {p.status === 'active' && (
                          <button
                            type="button"
                            className="link-btn link-btn--danger"
                            onClick={async () => {
                              if (!confirm(`Archive "${p.name}"? Sales history is kept.`)) return
                              try {
                                await api(`/api/products/${p.id}`, { method: 'DELETE' })
                                load()
                              } catch (err) {
                                setError(err.message)
                              }
                            }}
                          >
                            Archive
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ProductForm
          product={editing === 'new' ? null : editing}
          recipes={recipes}
          categories={categories}
          onCategoryCreated={load}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ProductForm({ product, recipes, categories, onCategoryCreated, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (!product) return EMPTY
    return {
      name: product.name,
      categoryId: product.categoryId || '',
      description: product.description || '',
      sellingPrice: String(product.sellingPricePoisha / 100),
      recipeId: product.recipeId || '',
      packagingCost: product.packagingCostPoisha ? String(product.packagingCostPoisha / 100) : '',
      notes: product.notes || '',
    }
  })
  const [newCategory, setNewCategory] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleNewCategory() {
    const name = newCategory.trim()
    if (!name) return
    try {
      const data = await api('/api/categories', { method: 'POST', body: { name } })
      onCategoryCreated()
      set('categoryId', data.category.id)
      setNewCategory('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Product name is required.')
    if (!form.sellingPrice || Number(form.sellingPrice) <= 0)
      return setError('Selling price must be greater than zero.')

    setSaving(true)
    try {
      const payload = { ...form }
      if (product) {
        await api(`/api/products/${product.id}`, { method: 'PATCH', body: payload })
      } else {
        await api('/api/products', { method: 'POST', body: payload })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={product ? `Edit ${product.name}` : 'Add Product'} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">Product name *</label>
            <input
              className="field__control"
              placeholder="e.g. Egg Sando"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Category</label>
            <select className="field__control" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Or create new category</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field__control"
                placeholder="e.g. Sandwiches"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleNewCategory} disabled={!newCategory.trim()}>
                Add
              </button>
            </div>
          </div>
          <div className="field">
            <label className="field__label">Selling price (৳) *</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              value={form.sellingPrice}
              onChange={(e) => set('sellingPrice', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Assigned recipe</label>
            <select className="field__control" value={form.recipeId} onChange={(e) => set('recipeId', e.target.value)}>
              <option value="">— none —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({formatQty(r.baseYieldBase, r.yieldUnit)})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Packaging cost per serving (৳)</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              value={form.packagingCost}
              onChange={(e) => set('packagingCost', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <label className="field__label">Description</label>
            <input
              className="field__control"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <label className="field__label">Notes</label>
            <textarea className="field__control" rows="2" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : product ? 'Save changes' : 'Add product'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
