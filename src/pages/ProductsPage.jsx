import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
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
  const { t } = useTranslation()
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
        <h1>{t('Products')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(
            'Your sellable menu. Profits below are estimates from current ingredient costs — realized profits arrive with the Sales module.',
          )}
        </p>
      </div>

      <div className="toolbar">
        <select
          className="toolbar__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="active">{t('Active')}</option>
          <option value="archived">{t('Archived')}</option>
          <option value="all">{t('All')}</option>
        </select>
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          {t('+ Add Product')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">{t('Loading…')}</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🥪</span>
            <span className="empty__title">{t('No products yet')}</span>
            <span className="empty__hint">
              {t(
                'Create your menu — assign a recipe to each product to see live profitability estimates.',
              )}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Product')}</th>
                  <th>{t('Category')}</th>
                    <th>{t('Recipe')}</th>
                    <th>{t('Price')}</th>
                    <th>{t('Est. cost')}</th>
                    <th>{t('Est. margin')}</th>
                  <th>{t('Status')}</th>
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
                        {p.status === 'active' ? t('Active') : t('Archived')}
                      </span>
                    </td>
                    <td>
                      <div className="inline-actions">                          <button type="button" className="link-btn" onClick={() => setEditing(p)}>
                          {t('Edit')}
                        </button>
                        {p.status === 'active' && (
                          <button
                            type="button"
                            className="link-btn link-btn--danger"
                            onClick={async () => {
                              if (!confirm(t('Archive "{name}"? Sales history is kept.', { name: p.name }))) return
                              try {
                                await api(`/api/products/${p.id}`, { method: 'DELETE' })
                                load()
                              } catch (err) {
                                setError(err.message)
                              }
                            }}
                          >
                            {t('Archive')}
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
  const { t } = useTranslation()
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
    if (!form.name.trim()) return setError(t('Product name is required.'))
    if (!form.sellingPrice || Number(form.sellingPrice) <= 0)
      return setError(t('Selling price must be greater than zero.'))

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
    <Modal
      title={product ? t('Edit {name}', { name: product.name }) : t('Add Product')}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">{t('Product name *')}</label>
            <input
              className="field__control"
              placeholder={t('e.g. Egg Sando')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Category')}</label>
            <select className="field__control" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('— none —')}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">{t('Or create new category')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="field__control"
                placeholder={t('e.g. Sandwiches')}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
              />
              <button type="button" className="btn btn--ghost btn--sm" onClick={handleNewCategory} disabled={!newCategory.trim()}>
                {t('Add')}
              </button>
            </div>
          </div>
          <div className="field">
            <label className="field__label">{t('Selling price (৳) *')}</label>
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
            <label className="field__label">{t('Assigned recipe')}</label>
            <select className="field__control" value={form.recipeId} onChange={(e) => set('recipeId', e.target.value)}>
              <option value="">{t('— none —')}</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({formatQty(r.baseYieldBase, r.yieldUnit)})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">{t('Packaging cost per serving (৳)')}</label>
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
            <label className="field__label">{t('Description')}</label>
            <input
              className="field__control"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <label className="field__label">{t('Notes')}</label>
            <textarea className="field__control" rows="2" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Saving…') : product ? t('Save changes') : t('Add product')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
