import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, formatQty, fromBase } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

/**
 * PRODUCTION — confirm a production run: recipe is scaled to the target
 * yield, every ingredient is deducted, and prepared stock is created
 * (for batch-workflow products).
 */
export default function ProductionPage() {
  const [batches, setBatches] = useState([])
  const [recipes, setRecipes] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, r, p] = await Promise.all([
        api('/api/production'),
        api('/api/recipes?status=active'),
        api('/api/products?status=active'),
      ])
      setBatches(b.batches)
      setRecipes(r.recipes)
      setProducts(p.products)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return (
    <>
      <div>
        <h1>Production</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Confirming a batch deducts every ingredient immediately and creates
          prepared stock for batch-workflow products.
        </p>
      </div>

      <div className="toolbar">
        <button type="button" className="btn btn--primary" onClick={() => setFormOpen(true)}>
          + New Production Run
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : batches.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🏭</span>
            <span className="empty__title">No production runs yet</span>
            <span className="empty__hint">
              Example: produce 500 g of Signature Mayo — ingredients are deducted
              and cost is calculated automatically.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Recipe</th>
                  <th>Product</th>
                  <th>Output</th>
                  <th>Ingredient cost</th>
                  <th>Status</th>
                  <th>By</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td>{new Date(b.createdAt).toLocaleDateString()}</td>
                    <td><strong>{b.recipeName}</strong></td>
                    <td>{b.productName || '—'}</td>
                    <td>{formatQty(b.targetYieldBase, b.recipeYieldUnit)}</td>
                    <td className="money">{formatMoney(b.ingredientCostPoisha)}</td>
                    <td>
                      <span className={`badge ${b.status === 'confirmed' ? 'badge--success' : 'badge--neutral'}`}>
                        {b.status === 'confirmed' ? 'Confirmed' : 'Cancelled'}
                      </span>
                    </td>
                    <td>{b.creatorName || '—'}</td>
                    <td>
                      {b.status === 'confirmed' && (
                        <button
                          type="button"
                          className="link-btn link-btn--danger"
                          onClick={async () => {
                            if (!confirm('Cancel this batch? All deducted ingredients will be returned to stock.')) return
                            try {
                              await api(`/api/production/${b.id}`, { method: 'DELETE' })
                              load()
                            } catch (err) {
                              setError(err.message)
                            }
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen && (
        <ProductionForm
          recipes={recipes}
          products={products}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false)
            load()
          }}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ProductionForm({ recipes, products, onClose, onSaved }) {
  const [form, setForm] = useState({ recipeId: '', productId: '', targetYield: '', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const recipe = recipes.find((r) => r.id === form.recipeId)
  const factor =
    recipe && form.targetYield && recipe.baseYieldBase > 0
      ? Number(form.targetYield) / fromBase(recipe.baseYieldBase, recipe.yieldUnit)
      : null

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.recipeId) return setError('Select a recipe.')
    if (!form.targetYield || Number(form.targetYield) <= 0)
      return setError('Target quantity must be greater than zero.')

    setSaving(true)
    try {
      await api('/api/production', {
        method: 'POST',
        body: { ...form, targetYield: Number(form.targetYield) },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="New Production Run" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Recipe *</label>
            <select className="field__control" value={form.recipeId} onChange={(e) => set('recipeId', e.target.value)}>
              <option value="">— select —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({formatQty(r.baseYieldBase, r.yieldUnit)})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">
              Target quantity {recipe ? `(${recipe.yieldUnit})` : ''} *
            </label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              placeholder={recipe ? String(fromBase(recipe.baseYieldBase, recipe.yieldUnit)) : ''}
              value={form.targetYield}
              onChange={(e) => set('targetYield', e.target.value)}
              disabled={!recipe}
            />
          </div>
          <div className="field">
            <label className="field__label">Product (for prepared stock)</label>
            <select className="field__control" value={form.productId} onChange={(e) => set('productId', e.target.value)}>
              <option value="">— none —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.recipeId === form.recipeId ? ' ✓ matches recipe' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field field--full">
            <label className="field__label">Notes</label>
            <input className="field__control" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {recipe && factor && (
          <div className="cost-preview">
            <div className="summary-line">
              <span>Scale factor</span>
              <strong>×{factor.toFixed(3).replace(/\.?0+$/, '')}</strong>
            </div>
            {recipe.items.map((it) => {
              const need = Math.round(it.quantityBase * factor)
              const after = it.ingredient.currentStockBase - need
              return (
                <div className="summary-line" key={it.id}>
                  <span>
                    {it.ingredient.name}: {formatQty(need, it.ingredient.displayUnit)}
                  </span>
                  <span className={after < 0 ? 'stock-low' : 'stock-ok'}>
                    {after < 0
                      ? `Short by ${formatQty(-after, it.ingredient.displayUnit)}`
                      : `Stock after: ${formatQty(after, it.ingredient.displayUnit)}`}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Confirming…' : 'Confirm production'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
