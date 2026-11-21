import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, formatQty, toBase, fromBase, takaToPoisha } from '../shared/units.js'
import { recipeCosting } from '../shared/costing.js'
import Modal from '../components/ui/Modal.jsx'
import IngredientForm from '../components/IngredientForm.jsx'

const YIELD_UNITS = ['g', 'kg', 'ml', 'L', 'pcs']

function blankItem() {
  return { ingredientId: '', quantity: '' }
}

export default function RecipesPage() {
  const [rows, setRows] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rec, ing] = await Promise.all([
        api('/api/recipes?status=all'),
        api('/api/ingredients?status=all'),
      ])
      setRows(rec.recipes)
      setIngredients(ing.ingredients)
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
        <h1>Recipes</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Costs update automatically from current ingredient prices.
        </p>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            if (ingredients.filter((i) => i.status === 'active').length === 0) {
              alert('Add at least one ingredient first (Inventory → Add Ingredient).')
              return
            }
            setEditing('new')
          }}
        >
          + New Recipe
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">📖</span>
            <span className="empty__title">No recipes yet</span>
            <span className="empty__hint">
              Create your first recipe — for example Signature Mayo with a base
              yield of 250 g — and see its cost per gram instantly.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Recipe</th>
                  <th>Base yield</th>
                  <th>Ingredients</th>
                  <th>Batch cost</th>
                  <th>Per 1 g/ml/pc</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const costing = recipeCosting(r, r.items)
                  return (
                    <tr key={r.id}>
                      <td>
                        <strong>{r.name}</strong>
                        {r.category && (
                          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.category}</div>
                        )}
                      </td>
                      <td>{formatQty(r.baseYieldBase, r.yieldUnit)}</td>
                      <td>{r.items.length}</td>
                      <td className="money">{formatMoney(costing.totalPoisha)}</td>
                      <td className="money">{formatMoney(costing.costPerBasePoisha)}</td>
                      <td>
                        <span className={`badge ${r.status === 'active' ? 'badge--success' : 'badge--neutral'}`}>
                          {r.status === 'active' ? 'Active' : 'Archived'}
                        </span>
                      </td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className="link-btn" onClick={() => setEditing(r)}>
                            Edit
                          </button>
                          {r.status === 'active' ? (
                            <button
                              type="button"
                              className="link-btn link-btn--danger"
                              onClick={async () => {
                                if (!confirm(`Archive "${r.name}"? It can be restored anytime.`)) return
                                try {
                                  await api(`/api/recipes/${r.id}`, { method: 'DELETE' })
                                  load()
                                } catch (err) {
                                  setError(err.message)
                                }
                              }}
                            >
                              Archive
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={async () => {
                                await api(`/api/recipes/${r.id}`, {
                                  method: 'PATCH',
                                  body: { status: 'active' },
                                })
                                load()
                              }}
                            >
                              Restore
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <RecipeForm
          recipe={editing === 'new' ? null : editing}
          ingredients={ingredients}
          suppliersUsed={() => {}}
          onIngredientCreated={() => {
            api('/api/ingredients?status=all')
              .then((d) => setIngredients(d.ingredients))
              .catch(() => {})
          }}
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
function RecipeForm({ recipe, ingredients, onIngredientCreated, onClose, onSaved }) {
  const [form, setForm] = useState(() => {
    if (!recipe) {
      return {
        name: '',
        category: '',
        yieldUnit: 'g',
        baseYield: '',
        instructions: '',
        prepTimeMinutes: '',
        packagingCost: '',
        otherDirectCost: '',
        notes: '',
      }
    }
    return {
      name: recipe.name,
      category: recipe.category || '',
      yieldUnit: recipe.yieldUnit,
      baseYield: String(fromBase(recipe.baseYieldBase, recipe.yieldUnit)),
      instructions: recipe.instructions || '',
      prepTimeMinutes: recipe.prepTimeMinutes || '',
      packagingCost: recipe.packagingCostPoisha ? String(recipe.packagingCostPoisha / 100) : '',
      otherDirectCost: recipe.otherDirectCostPoisha ? String(recipe.otherDirectCostPoisha / 100) : '',
      notes: recipe.notes || '',
    }
  })
  const [items, setItems] = useState(() => {
    if (!recipe) return [blankItem()]
    return recipe.items.map((it) => ({
      ingredientId: it.ingredientId,
      quantity: String(fromBase(it.quantityBase, it.ingredient.displayUnit)),
    }))
  })
  const [newIngOpen, setNewIngOpen] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const activeIngredients = ingredients.filter((i) => i.status === 'active')
  const ingById = (id) => ingredients.find((i) => i.id === id)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function setItem(index, field, value) {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  // Live cost preview (per spec §11)
  const preview = (() => {
    const itemsBase = items
      .map((it) => {
        const ing = ingById(it.ingredientId)
        if (!ing || !it.quantity) return null
        return {
          ingredientId: ing.id,
          ingredient: { avgCostPoisha: ing.avgCostPoisha },
          quantityBase: toBase(it.quantity, ing.displayUnit),
        }
      })
      .filter(Boolean)
    const fakeRecipe = {
      packagingCostPoisha: takaToPoisha(form.packagingCost || 0),
      otherDirectCostPoisha: takaToPoisha(form.otherDirectCost || 0),
      baseYieldBase: toBase(form.baseYield || 0, form.yieldUnit),
    }
    if (itemsBase.length === 0 || fakeRecipe.baseYieldBase <= 0) return null
    return recipeCosting(fakeRecipe, itemsBase)
  })()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Recipe name is required.')
    if (!form.baseYield || Number(form.baseYield) <= 0) return setError('Base yield must be greater than zero.')

    const payloadItems = []
    for (const it of items) {
      const ing = ingById(it.ingredientId)
      if (!ing) continue
      const qtyBase = toBase(it.quantity || 0, ing.displayUnit)
      if (qtyBase <= 0) return setError('Every ingredient needs a quantity greater than zero.')
      payloadItems.push({ ingredientId: ing.id, quantityBase: qtyBase })
    }
    if (payloadItems.length === 0) return setError('Add at least one ingredient.')

    setSaving(true)
    try {
      if (recipe) {
        await api(`/api/recipes/${recipe.id}`, {
          method: 'PATCH',
          body: { ...form, baseYield: Number(form.baseYield), items: payloadItems },
        })
      } else {
        await api('/api/recipes', {
          method: 'POST',
          body: { ...form, baseYield: Number(form.baseYield), items: payloadItems },
        })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <>
      <Modal title={recipe ? `Edit ${recipe.name}` : 'New Recipe'} onClose={onClose} wide>
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field field--full">
              <label className="field__label">Recipe name *</label>
              <input
                className="field__control"
                placeholder="e.g. Signature Mayo"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Category</label>
              <input
                className="field__control"
                placeholder="e.g. Sauces"
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Prep time (minutes)</label>
              <input
                className="field__control"
                type="number"
                min="0"
                value={form.prepTimeMinutes}
                onChange={(e) => set('prepTimeMinutes', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Base yield *</label>
              <input
                className="field__control"
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 250"
                value={form.baseYield}
                onChange={(e) => set('baseYield', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Yield unit *</label>
              <select className="field__control" value={form.yieldUnit} onChange={(e) => set('yieldUnit', e.target.value)}>
                {YIELD_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="section-label">Ingredients</div>
          {items.map((it, idx) => {
            const ing = ingById(it.ingredientId)
            return (
              <div className="item-row" key={idx} style={{ gridTemplateColumns: '1.5fr 0.8fr auto' }}>
                <div className="field">
                  <label className="field__label">Ingredient</label>
                  <select
                    className="field__control"
                    value={it.ingredientId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setNewIngOpen(true)
                        return
                      }
                      setItem(idx, 'ingredientId', e.target.value)
                    }}
                  >
                    <option value="">— select —</option>
                    {activeIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.displayUnit})
                      </option>
                    ))}
                    <option value="__new__">＋ Create new ingredient…</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">Qty ({ing ? ing.displayUnit : 'unit'})</label>
                  <input
                    className="field__control"
                    type="number"
                    min="0"
                    step="any"
                    value={it.quantity}
                    onChange={(e) => setItem(idx, 'quantity', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="link-btn link-btn--danger"
                  onClick={() => setItems((l) => l.filter((_, i) => i !== idx))}
                  disabled={items.length === 1}
                  style={{ marginTop: 22 }}
                >
                  ✕
                </button>
              </div>
            )
          })}
          <button type="button" className="link-btn" onClick={() => setItems((l) => [...l, blankItem()])}>
            + Add ingredient
          </button>

          <div className="form-grid">
            <div className="field">
              <label className="field__label">Packaging cost per batch (৳)</label>
              <input
                className="field__control"
                type="number"
                min="0"
                step="any"
                value={form.packagingCost}
                onChange={(e) => set('packagingCost', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">Other direct costs (৳)</label>
              <input
                className="field__control"
                type="number"
                min="0"
                step="any"
                value={form.otherDirectCost}
                onChange={(e) => set('otherDirectCost', e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label className="field__label">Preparation instructions</label>
              <textarea
                className="field__control"
                rows="3"
                placeholder="Step-by-step instructions…"
                value={form.instructions}
                onChange={(e) => set('instructions', e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label className="field__label">Notes</label>
              <textarea className="field__control" rows="2" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          {preview && (
            <div className="cost-preview">
              <div className="summary-line">
                <span>Ingredient cost</span>
                <strong className="money">{formatMoney(preview.ingredientCostPoisha)}</strong>
              </div>
              <div className="summary-line">
                <span>Batch total cost</span>
                <strong className="money">{formatMoney(preview.totalPoisha)}</strong>
              </div>
              <div className="summary-line">
                <span>Cost per 1 {form.yieldUnit}</span>
                <strong className="money">{formatMoney(preview.costPerBasePoisha)}</strong>
              </div>
            </div>
          )}

          {error && <div className="alert alert--error">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : recipe ? 'Save changes' : 'Create recipe'}
            </button>
          </div>
        </form>
      </Modal>

      {newIngOpen && (
        <IngredientForm
          onClose={() => setNewIngOpen(false)}
          onSaved={() => {
            setNewIngOpen(false)
            onIngredientCreated()
          }}
        />
      )}
    </>
  )
}
