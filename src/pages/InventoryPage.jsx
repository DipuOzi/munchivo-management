import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney, formatQty } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'
import IngredientForm from '../components/IngredientForm.jsx'

const EMPTY_FORM = {
  name: '',
  category: '',
  displayUnit: 'kg',
  initialQuantity: '',
  initialTotalCost: '',
  lowStockThreshold: '',
  minStock: '',
  storageLocation: '',
  trackExpiry: false,
  notes: '',
}

const STOCK_MOVEMENT_LABELS = {
  opening_stock: 'Opening stock',
  purchase: 'Purchase',
  purchase_reversal: 'Purchase reversal',
  adjustment: 'Adjustment',
  sale_consumption: 'Sale consumption',
  waste: 'Waste',
  expiry: 'Expired',
}

export default function InventoryPage() {
  const { t } = useTranslation()
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const [editing, setEditing] = useState(null) // null | 'new' | ingredient
  const [detailId, setDetailId] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (category) params.set('category', category)
      params.set('status', statusFilter)
      const data = await api(`/api/ingredients?${params}`)
      setRows(data.ingredients)
      setCategories(data.categories)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search, category, statusFilter])

  useEffect(() => {
    load()
  }, [load])

  async function openDetail(id) {
    setDetailId(id)
    setDetail(null)
    try {
      const data = await api(`/api/ingredients/${id}`)
      setDetail(data)
    } catch (err) {
      setError(err.message)
      setDetailId(null)
    }
  }

  async function archive(ingredient) {
    if (
      !confirm(
        t('Archive "{name}"? History is kept; it can be restored anytime.', {
          name: ingredient.name,
        }),
      )
    )
      return
    try {
      await api(`/api/ingredients/${ingredient.id}`, { method: 'DELETE' })
      load()
      if (detailId === ingredient.id) setDetailId(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const totals = useMemo(() => {
    const value = rows.reduce(
      (sum, r) => sum + r.currentStockBase * r.avgCostPoisha,
      0,
    )
    const low = rows.filter((r) => r.lowStockThresholdBase > 0 && r.currentStockBase <= r.lowStockThresholdBase).length
    return { value, low }
  }, [rows])

  return (
    <>
      <div>
        <h1 style={{ marginBottom: 12 }}>{t('Inventory')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(rows.length === 1 ? '{count} ingredient' : '{count} ingredients', {
            count: rows.length,
          })}{' '}
          · {t('Inventory value')}{' '}
          <strong className="money">{formatMoney(totals.value)}</strong>
          {totals.low > 0 && (
            <>
              {' '}
              ·{' '}
              <span className="stock-low">
                {t('{count} running low', { count: totals.low })}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="toolbar">
        <input
          className="field__control toolbar__search"
          placeholder={t('Search ingredients…')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="toolbar__select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">{t('All categories')}</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
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
          {t('+ Add Ingredient')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">{t('Loading…')}</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🥗</span>
            <span className="empty__title">{t('No ingredients yet')}</span>
            <span className="empty__hint">
              {t(
                'Add your first ingredient — for example Potato with 20 kg and a low-stock threshold of 7 kg.',
              )}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Ingredient')}</th>
                  <th>{t('Category')}</th>
                  <th>{t('Stock')}</th>
                  <th>{t('Avg Cost')}</th>
                  <th>{t('Value')}</th>
                  <th>{t('Status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const isLow =
                    r.lowStockThresholdBase > 0 &&
                    r.currentStockBase <= r.lowStockThresholdBase
                  const isBelowMin =
                    r.minStockBase > 0 && r.currentStockBase < r.minStockBase
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r.id)}>
                      <td>
                        <strong>{r.name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          {r.trackExpiry ? t('Expiry tracked') : ''}
                        </div>
                      </td>
                      <td>{r.category}</td>
                      <td className={isLow || isBelowMin ? 'stock-low' : 'stock-ok'}>
                        {formatQty(r.currentStockBase, r.displayUnit)}
                        {isBelowMin ? t(' · below min') : isLow ? t(' · low') : ''}
                      </td>
                      <td className="money">
                        {formatMoney(r.avgCostPoisha)}/{r.displayUnit}
                      </td>
                      <td className="money">{formatMoney(r.currentStockBase * r.avgCostPoisha)}</td>
                      <td>
                        {r.status === 'archived' ? (
                          <span className="badge badge--neutral">{t('Archived')}</span>
                        ) : isLow || isBelowMin ? (
                          <span className="badge badge--danger">{t('Low stock')}</span>
                        ) : (
                          <span className="badge badge--success">{t('Healthy')}</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="inline-actions">
                          <button type="button" className="link-btn" onClick={() => setEditing(r)}>
                            {t('Edit')}
                          </button>
                          {r.status === 'active' && (
                            <button
                              type="button"
                              className="link-btn link-btn--danger"
                              onClick={() => archive(r)}
                            >
                              {t('Archive')}
                            </button>
                          )}
                          {r.status === 'archived' && (
                            <button
                              type="button"
                              className="link-btn"
                              onClick={async () => {
                                await api(`/api/ingredients/${r.id}`, {
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
        <IngredientForm
          ingredient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {detailId && (
        <IngredientDetail
          detail={detail}
          onClose={() => setDetailId(null)}
          onAdjusted={() => openDetail(detailId)}
        />
      )}
    </>
  )
}
