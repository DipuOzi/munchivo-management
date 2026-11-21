import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney, formatQty, toBase, fromBase, takaToPoisha, unitTypeFor } from '../shared/units.js'
import { recipeCosting } from '../shared/costing.js'
import Modal from '../components/ui/Modal.jsx'
import IngredientForm from '../components/IngredientForm.jsx'

const YIELD_UNITS = ['g', 'kg', 'ml', 'L', 'pcs']
const DEFAULT_ITEM_UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'slice', 'loaf']

// Units offered for an ingredient's quantity, based on what it measures.
// e.g. salt (mass) → g, kg ; bread (count) → pcs, slice, loaf
// (1 loaf = 10 slices, so 1 slice = 1 base unit and 1 loaf = 10).
function unitsForIngredient(ing) {
  if (!ing) return DEFAULT_ITEM_UNITS
  const type = unitTypeFor(ing.displayUnit)
  let opts
  if (type === 'mass') opts = ['g', 'kg']
  else if (type === 'volume') opts = ['ml', 'L']
  else if (type === 'count') opts = ['pcs', 'slice', 'loaf']
  else opts = ['pcs']
  if (ing.displayUnit && !opts.includes(ing.displayUnit)) opts = [ing.displayUnit, ...opts]
  return opts
}

function blankItem() {
  return { ingredientId: '', quantity: '', unit: '' }
}

export default function RecipesPage() {
  const { t } = useTranslation()
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
        <h1>{t('Recipes')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t('Costs update automatically from current ingredient prices.')}
        </p>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            if (ingredients.filter((i) => i.status === 'active').length === 0) {
              alert(t('Add at least one ingredient first (Inventory → Add Ingredient).'))
              return
            }
            setEditing('new')
          }}
        >
          {t('+ New Recipe')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">{t('Loading…')}</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">📖</span>
            <span className="empty__title">{t('No recipes yet')}</span>
            <span className="empty__hint">
              {t(
                'Create your first recipe — for example Signature Mayo with a base yield of 250 g — and see its cost per gram instantly.',
              )}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Recipe')}</th>
                  <th>{t('Base yield')}</th>
                  <th>{t('Ingredients')}</th>
                  <th>{t('Batch cost')}</th>
                  <th>{t('Per 1 g/ml/pc')}</th>
                  <th>{t('Status')}</th>
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
                          {r.status === 'active' ? t('Active') : t('Archived')}
                        </span>
                      </td>
                      <td>
                        <div className="inline-actions">
                          <button type="button" className="link-btn" onClick={() => setEditing(r)}>
                            {t('Edit')}
                          </button>
                          {r.status === 'active' ? (
                            <button
                              type="button"
                              className="link-btn link-btn--danger"
                              onClick={async () => {
                                if (!confirm(t('Archive "{name}"? It can be restored anytime.', { name: r.name }))) return
                                try {
                                  await api(`/api/recipes/${r.id}`, { method: 'DELETE' })
                                  load()
                                } catch (err) {
                                  setError(err.message)
                                }
                              }}
                            >
                              {t('Archive')}
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
                              {t('Restore')}
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
  const { t } = useTranslation()
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
      unit: it.ingredient.displayUnit,
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
          quantityBase: toBase(it.quantity, it.unit || ing.displayUnit),
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
    if (!form.name.trim()) return setError(t('Recipe name is required.'))
    if (!form.baseYield || Number(form.baseYield) <= 0)
      return setError(t('Base yield must be greater than zero.'))

    const payloadItems = []
    for (const it of items) {
      const ing = ingById(it.ingredientId)
      if (!ing) continue
      const qtyBase = toBase(it.quantity || 0, it.unit || ing.displayUnit)
      if (qtyBase <= 0) continue
      payloadItems.push({ ingredientId: ing.id, quantityBase: qtyBase })
    }
    if (payloadItems.length === 0)
      return setError(t('Add at least one ingredient with a quantity.'))

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
      <Modal
        title={recipe ? t('Edit {name}', { name: recipe.name }) : t('New Recipe')}
        onClose={onClose}
        wide
      >
        <form onSubmit={handleSubmit}>
          <div className="form-grid">
            <div className="field field--full">
              <label className="field__label">{t('Recipe name *')}</label>
              <input
                className="field__control"
                placeholder={t('e.g. Signature Mayo')}
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">{t('Category')}</label>
              <input
                className="field__control"
                placeholder={t('e.g. Sauces')}
                value={form.category}
                onChange={(e) => set('category', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">{t('Prep time (minutes)')}</label>
              <input
                className="field__control"
                type="number"
                min="0"
                value={form.prepTimeMinutes}
                onChange={(e) => set('prepTimeMinutes', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">{t('Base yield *')}</label>
              <input
                className="field__control"
                type="number"
                min="0"
                step="any"
                placeholder={t('e.g. 250')}
                value={form.baseYield}
                onChange={(e) => set('baseYield', e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field__label">{t('Yield unit *')}</label>
              <select className="field__control" value={form.yieldUnit} onChange={(e) => set('yieldUnit', e.target.value)}>
                {YIELD_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="section-label">{t('Ingredients')}</div>
          {items.map((it, idx) => {
            const ing = ingById(it.ingredientId)
            return (
              <div className="item-row" key={idx} style={{ gridTemplateColumns: '1.4fr 0.7fr 0.8fr auto' }}>
                <div className="field">
                  <label className="field__label">{t('Ingredient')}</label>
                  <select
                    className="field__control"
                    value={it.ingredientId}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setNewIngOpen(true)
                        return
                      }
                      const ing = ingById(e.target.value)
                      setItems((list) =>
                        list.map((row, i) =>
                          i === idx
                            ? { ...row, ingredientId: e.target.value, unit: ing ? ing.displayUnit : '' }
                            : row,
                        ),
                      )
                    }}
                  >
                    <option value="">{t('— select —')}</option>
                    {activeIngredients.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name} ({i.displayUnit})
                      </option>
                    ))}
                    <option value="__new__">{t('＋ Create new ingredient…')}</option>
                  </select>
                </div>
                <div className="field">
                  <label className="field__label">{t('Qty')}</label>
                  <input
                    className="field__control"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={it.quantity}
                    onChange={(e) => setItem(idx, 'quantity', e.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="field__label">{t('Unit')}</label>
                  <select
                    className="field__control"
                    value={it.unit || ''}
                    onChange={(e) => setItem(idx, 'unit', e.target.value)}
                  >
                    <option value="">—</option>
                    {unitsForIngredient(ing).map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
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
            {t('+ Add ingredient')}
          </button>

          <div className="form-grid">
            <div className="field">
              <label className="field__label">{t('Packaging cost per batch (৳)')}</label>
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
              <label className="field__label">{t('Other direct costs (৳)')}</label>
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
              <label className="field__label">{t('Preparation instructions')}</label>
              <textarea
                className="field__control"
                rows="3"
                placeholder={t('Step-by-step instructions…')}
                value={form.instructions}
                onChange={(e) => set('instructions', e.target.value)}
              />
            </div>
            <div className="field field--full">
              <label className="field__label">{t('Notes')}</label>
              <textarea className="field__control" rows="2" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
            </div>
          </div>

          {preview && (
            <div className="cost-preview">
              <div className="summary-line">
                <span>{t('Ingredient cost')}</span>
                <strong className="money">{formatMoney(preview.ingredientCostPoisha)}</strong>
              </div>
              <div className="summary-line">
                <span>{t('Batch total cost')}</span>
                <strong className="money">{formatMoney(preview.totalPoisha)}</strong>
              </div>
              <div className="summary-line">
                <span>{t('Cost per 1 {unit}', { unit: form.yieldUnit })}</span>
                <strong className="money">{formatMoney(preview.costPerBasePoisha)}</strong>
              </div>
            </div>
          )}

          {error && <div className="alert alert--error">{error}</div>}

          <div className="modal__actions">
            <button type="button" className="btn btn--ghost" onClick={onClose}>
              {t('Cancel')}
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? t('Saving…') : recipe ? t('Save changes') : t('Create recipe')}
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
