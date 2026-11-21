import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney, formatQty } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

const REASONS = [
  { value: 'expired', label: 'Expired' },
  { value: 'spoiled', label: 'Spoiled' },
  { value: 'burnt', label: 'Burnt / overcooked' },
  { value: 'preparation_mistake', label: 'Preparation mistake' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'other', label: 'Other' },
]

export default function WastePage() {
  const { t, locale } = useTranslation()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/waste')
      setRows(data.records)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const confirmed = rows.filter((r) => r.status === 'confirmed')
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const monthCost = confirmed
    .filter((r) => new Date(r.createdAt) >= monthStart)
    .reduce((s, r) => s + r.estimatedCostPoisha, 0)

  return (
    <>
      <div>
        <h1>{t('Waste')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(
            'Every waste record deducts stock with an immutable movement — the trail can never be edited, only reversed by cancellation.',
          )}
        </p>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Waste cost this month')}</span>
            <span className="stat-card__icon stat-card__icon--revenue" aria-hidden="true">৳</span>
          </div>
          <span className="stat-card__value money">{formatMoney(monthCost)}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Records this month')}</span>
            <span className="stat-card__icon stat-card__icon--orders" aria-hidden="true">#</span>
          </div>
          <span className="stat-card__value">
            {confirmed.filter((r) => new Date(r.createdAt) >= monthStart).length}
          </span>
        </div>
      </div>

      <div className="toolbar">
        <button type="button" className="btn btn--primary" onClick={() => setFormOpen(true)}>
          {t('+ Record Waste')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">{t('Loading…')}</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🗑️</span>
            <span className="empty__title">{t('No waste recorded')}</span>
            <span className="empty__hint">
              {t('Record spoiled or expired stock here so your costs stay honest.')}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Date')}</th>
                  <th>{t('Item')}</th>
                  <th>{t('Quantity')}</th>
                  <th>{t('Reason')}</th>
                  <th>{t('Cost')}</th>
                  <th>{t('Status')}</th>
                  <th>{t('By')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleDateString(locale)}</td>
                    <td><strong>{r.ingredientName || r.productName}</strong></td>
                    <td>
                      {r.ingredientUnit
                        ? formatQty(r.quantityBase, r.ingredientUnit)
                        : t('{count} base', { count: r.quantityBase })}
                    </td>
                    <td>{t(REASONS.find((x) => x.value === r.reason)?.label || r.reason)}</td>
                    <td className="money">{formatMoney(r.estimatedCostPoisha)}</td>
                    <td>
                      <span className={`badge ${r.status === 'confirmed' ? 'badge--warning' : 'badge--neutral'}`}>
                        {r.status === 'confirmed' ? t('Confirmed') : t('Cancelled')}
                      </span>
                    </td>
                    <td>{r.recorderName || '—'}</td>
                    <td>
                      {r.status === 'confirmed' && (
                        <button
                          type="button"
                          className="link-btn link-btn--danger"
                          onClick={async () => {
                            if (!confirm(t('Cancel this waste record? The stock will be returned.'))) return
                            try {
                              await api(`/api/waste/${r.id}`, { method: 'DELETE' })
                              load()
                            } catch (err) {
                              setError(err.message)
                            }
                          }}
                        >
                          {t('Cancel')}
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
        <WasteForm
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
function WasteForm({ onClose, onSaved }) {
  const { t } = useTranslation()
  const [ingredients, setIngredients] = useState([])
  const [form, setForm] = useState({ ingredientId: '', quantity: '', reason: 'spoiled', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api('/api/ingredients?status=active')
      .then((i) => setIngredients(i.ingredients))
      .catch((err) => setError(err.message))
  }, [])

  const ingredient = ingredients.find((i) => i.id === form.ingredientId)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.ingredientId) return setError(t('Select an ingredient.'))
    if (!form.quantity || Number(form.quantity) <= 0)
      return setError(t('Quantity must be greater than zero.'))

    setSaving(true)
    try {
      await api('/api/waste', {
        method: 'POST',
        body: form,
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={t('Record Waste')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">{t('Ingredient *')}</label>
            <select
              className="field__control"
              value={form.ingredientId}
              onChange={(e) => set('ingredientId', e.target.value)}
            >
              <option value="">{t('— select —')}</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({t('stock:')} {formatQty(i.currentStockBase, i.displayUnit)})
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">
              {t('Quantity')} {ingredient ? `(${ingredient.displayUnit})` : ''} *
            </label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Reason *')}</label>
            <select className="field__control" value={form.reason} onChange={(e) => set('reason', e.target.value)}>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{t(r.label)}</option>
              ))}
            </select>
          </div>
          <div className="field field--full">
            <label className="field__label">{t('Notes')}</label>
            <input className="field__control" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {ingredient && form.quantity && (
          <div className="cost-preview">
            <div className="summary-line">
              <span>{t('Estimated cost')}</span>
              <strong className="money">
                {formatMoney(Math.round(Number(form.quantity) * ingredient.avgCostPoisha))}
              </strong>
            </div>
          </div>
        )}

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Recording…') : t('Record waste')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
