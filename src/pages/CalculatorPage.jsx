import { useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney, formatQty, toBase, fromBase } from '../shared/units.js'
import { recipeCosting } from '../shared/costing.js'
import Modal from '../components/ui/Modal.jsx'

/**
 * CALCULATOR — pure calculation page.
 * NOTHING here ever deducts inventory (spec §10). Inventory is only
 * deducted by confirmed sales.
 */
export default function CalculatorPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('scale')
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([api('/api/recipes'), api('/api/ingredients?status=active')])
      .then(([r, i]) => {
        setRecipes(r.recipes)
        setIngredients(i.ingredients)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <>
      <div>
        <h1>{t('Calculator')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t('Plan and cost any batch — calculations never touch your inventory.')}
        </p>
      </div>

      <div className="toolbar">
        <button
          type="button"
          className={`btn btn--sm ${tab === 'scale' ? 'btn--dark' : 'btn--ghost'}`}
          onClick={() => setTab('scale')}
        >
          {t('Recipe Scaling')}
        </button>
        <button
          type="button"
          className={`btn btn--sm ${tab === 'custom' ? 'btn--dark' : 'btn--ghost'}`}
          onClick={() => setTab('custom')}
        >
          {t('Custom Calculation')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {loading ? (
        <div className="card">
          <div className="empty">{t('Loading…')}</div>
        </div>
      ) : tab === 'scale' ? (
        <ScaleTab recipes={recipes} />
      ) : (
        <CustomTab ingredients={ingredients} onSaved={() => {}} />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* TAB 1 — scale a saved recipe                                        */
/* ------------------------------------------------------------------ */
function ScaleTab({ recipes }) {
  const { t } = useTranslation()
  const [recipeId, setRecipeId] = useState('')
  const [targetYield, setTargetYield] = useState('')

  const recipe = recipes.find((r) => r.id === recipeId)

  const calc = useMemo(() => {
    if (!recipe || !targetYield) return null
    const targetBase = toBase(targetYield, recipe.yieldUnit)
    if (targetBase <= 0 || recipe.baseYieldBase <= 0) return null
    const factor = targetBase / recipe.baseYieldBase

    const items = recipe.items.map((it) => {
      const neededBase = Math.round(it.quantityBase * factor * 1000) / 1000
      const stockAfter = it.ingredient.currentStockBase - neededBase
      return {
        ...it,
        neededBase,
        stockAfterBase: stockAfter,
        shortfallBase: stockAfter < 0 ? Math.abs(stockAfter) : 0,
        costPoisha: Math.round(it.quantityBase * factor * (it.ingredient.avgCostPoisha || 0)),
      }
    })

    const costing = recipeCosting(recipe, recipe.items)
    return {
      factor,
      items,
      batchCostPoisha: Math.round(costing.totalPoisha * factor),
      hasShortfall: items.some((i) => i.shortfallBase > 0),
    }
  }, [recipe, targetYield])

  return (
    <div className="card">
      <div className="form-grid" style={{ marginBottom: 20 }}>
        <div className="field">
          <label className="field__label">{t('Recipe')}</label>
          <select className="field__control" value={recipeId} onChange={(e) => setRecipeId(e.target.value)}>
            <option value="">{t('— select a recipe —')}</option>
            {recipes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} ({formatQty(r.baseYieldBase, r.yieldUnit)})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label">
            {t('Target yield {unit}', { unit: recipe ? `(${recipe.yieldUnit})` : '' })}
          </label>
          <input
            className="field__control"
            type="number"
            min="0"
            step="any"
            placeholder={
              recipe
                ? String(fromBase(recipe.baseYieldBase, recipe.yieldUnit))
                : t('e.g. 500')
            }
            value={targetYield}
            onChange={(e) => setTargetYield(e.target.value)}
            disabled={!recipe}
          />
        </div>
      </div>

      {!recipe && (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">🧮</span>
          <span className="empty__title">{t('Select a recipe to scale')}</span>
          <span className="empty__hint">
            {t(
              'Original: 250 g → target 500 g doubles every ingredient; 1 kg quadruples it. Decimals supported.',
            )}
          </span>
        </div>
      )}

      {recipe && calc && (
        <>
          <div className="summary-line">
            <span>{t('Original yield')}</span>
            <strong>{formatQty(recipe.baseYieldBase, recipe.yieldUnit)}</strong>
          </div>
          <div className="summary-line">
            <span>{t('Target yield')}</span>
            <strong>
              {formatQty(toBase(targetYield, recipe.yieldUnit), recipe.yieldUnit)}{' '}
              <span className="badge badge--neutral">×{calc.factor.toFixed(3).replace(/\.?0+$/, '')}</span>
            </strong>
          </div>

          <div className="section-label">{t('Scaled ingredients')}</div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Ingredient')}</th>
                  <th>{t('Original')}</th>
                  <th>{t('Scaled')}</th>
                  <th>{t('Estimated cost')}</th>
                  <th>{t('Stock after use')}</th>
                </tr>
              </thead>
              <tbody>
                {calc.items.map((it) => (
                  <tr key={it.id}>
                    <td><strong>{it.ingredient.name}</strong></td>
                    <td>{formatQty(it.quantityBase, it.ingredient.displayUnit)}</td>
                    <td><strong>{formatQty(it.neededBase, it.ingredient.displayUnit)}</strong></td>
                    <td className="money">{formatMoney(it.costPoisha)}</td>
                    <td className={it.shortfallBase > 0 ? 'stock-low' : 'stock-ok'}>
                      {it.shortfallBase > 0
                        ? t('Short by {qty}', {
                            qty: formatQty(it.shortfallBase, it.ingredient.displayUnit),
                          })
                        : formatQty(it.stockAfterBase, it.ingredient.displayUnit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="summary-line summary-line--total">
            <span>
              {t('Estimated batch cost')}
              {calc.hasShortfall && (
                <span className="badge badge--warning" style={{ marginLeft: 10 }}>
                  {t('Stock shortfall — purchase more first')}
                </span>
              )}
            </span>
            <strong className="money">{formatMoney(calc.batchCostPoisha)}</strong>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--light-muted)' }}>
            {t('Estimate only — nothing has been deducted from inventory.')}
          </p>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* TAB 2 — custom calculation (no saved recipe needed)                 */
/* ------------------------------------------------------------------ */
function blankRow() {
  return { ingredientId: '', quantity: '' }
}

function CustomTab({ ingredients }) {
  const { t } = useTranslation()
  const [rows, setRows] = useState([blankRow()])
  const [saving, setSaving] = useState(false)
  const [saveOpen, setSaveOpen] = useState(false)
  const [error, setError] = useState('')

  const ingById = (id) => ingredients.find((i) => i.id === id)

  function setRow(index, field, value) {
    setRows((list) => list.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  const calc = useMemo(() => {
    const mapped = []
    for (const row of rows) {
      const ing = ingById(row.ingredientId)
      if (!ing || !row.quantity) continue
      const base = toBase(row.quantity, ing.displayUnit)
      if (base <= 0) continue
      mapped.push({
        ingredient: ing,
        quantityBase: base,
        costPoisha: Math.round(base * (ing.avgCostPoisha || 0)),
      })
    }
    const totalsByType = {}
    let totalCost = 0
    for (const m of mapped) {
      const type = m.ingredient.unitType
      totalsByType[type] = (totalsByType[type] || 0) + m.quantityBase
      totalCost += m.costPoisha
    }
    return { mapped, totalsByType, totalCost }
  }, [rows, ingredients])

  const TYPE_LABEL = { mass: 'Total weight', volume: 'Total volume', count: 'Total pieces', other: 'Other' }
  const TYPE_UNIT = { mass: 'kg', volume: 'L', count: 'pcs', other: '' }

  return (
    <div className="card">
      <div className="section-label" style={{ marginTop: 0 }}>{t('Ingredients (any quantities)')}</div>
      {rows.map((row, idx) => {
        const ing = ingById(row.ingredientId)
        return (
          <div className="item-row" key={idx} style={{ gridTemplateColumns: '1.5fr 0.8fr auto', marginBottom: 10 }}>
            <div className="field">
              <label className="field__label">{t('Ingredient')}</label>
              <select
                className="field__control"
                value={row.ingredientId}
                onChange={(e) => setRow(idx, 'ingredientId', e.target.value)}
              >
                <option value="">{t('— select —')}</option>
                {ingredients.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.displayUnit})
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="field__label">
                {t('Qty ({unit})', { unit: ing ? ing.displayUnit : t('Unit') })}
              </label>
              <input
                className="field__control"
                type="number"
                min="0"
                step="any"
                value={row.quantity}
                onChange={(e) => setRow(idx, 'quantity', e.target.value)}
              />
            </div>
            <button
              type="button"
              className="link-btn link-btn--danger"
              onClick={() => setRows((l) => l.filter((_, i) => i !== idx))}
              disabled={rows.length === 1}
              style={{ marginTop: 22 }}
            >
              ✕
            </button>
          </div>
        )
      })}
      <button type="button" className="link-btn" onClick={() => setRows((l) => [...l, blankRow()])}>
        {t('+ Add ingredient')}
      </button>

      {calc.mapped.length > 0 && (
        <>
          <div className="section-label">{t('Totals')}</div>
          {Object.entries(calc.totalsByType).map(([type, base]) => (
            <div className="summary-line" key={type}>
              <span>{t(TYPE_LABEL[type] || type)}</span>
              <strong>
                {formatQty(
                  base,
                  type === 'mass' ? 'kg' : type === 'volume' ? 'L' : 'pcs',
                )}
              </strong>
            </div>
          ))}
          <div className="summary-line summary-line--total">
            <span>{t('Estimated total cost')}</span>
            <strong className="money">{formatMoney(calc.totalCost)}</strong>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--light-muted)' }}>
            {t('Estimate only — nothing has been deducted from inventory.')}
          </p>
          <div className="modal__actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="btn btn--dark" onClick={() => setSaveOpen(true)}>
              {t('Save as recipe')}
            </button>
          </div>
        </>
      )}

      {saveOpen && (
        <SaveAsRecipe
          rows={calc.mapped}
          onClose={() => setSaveOpen(false)}
          onSaved={() => {
            setSaveOpen(false)
            setRows([blankRow()])
          }}
        />
      )}
      {error && <div className="alert alert--error">{error}</div>}
      {saving && <p>{t('Saving…')}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
function SaveAsRecipe({ rows, onClose, onSaved }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [yieldUnit, setYieldUnit] = useState('g')
  const [baseYield, setBaseYield] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!name.trim()) return setError(t('Give the recipe a name.'))
    if (!baseYield || Number(baseYield) <= 0)
      return setError(t('Base yield must be greater than zero.'))

    setSaving(true)
    try {
      await api('/api/recipes', {
        method: 'POST',
        body: {
          name,
          yieldUnit,
          baseYield: Number(baseYield),
          items: rows.map((r) => ({
            ingredientId: r.ingredient.id,
            quantityBase: r.quantityBase,
          })),
        },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={t('Save calculation as recipe')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">{t('Recipe name *')}</label>
            <input className="field__control" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">{t('Base yield *')}</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              value={baseYield}
              onChange={(e) => setBaseYield(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Yield unit')}</label>
            <select className="field__control" value={yieldUnit} onChange={(e) => setYieldUnit(e.target.value)}>
              {['g', 'kg', 'ml', 'L', 'pcs'].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t(
            rows.length === 1
              ? '{count} ingredient will be saved with the quantities from this calculation.'
              : '{count} ingredients will be saved with the quantities from this calculation.',
            { count: rows.length },
          )}
        </p>
        {error && <div className="alert alert--error">{error}</div>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Saving…') : t('Save recipe')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
