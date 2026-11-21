import { useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import Modal from './ui/Modal.jsx'

/**
 * Create/edit ingredient form — used by the Inventory page and
 * inline from the Recipe builder ("create ingredient on the fly").
 */
export default function IngredientForm({ ingredient, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(() => {
    if (!ingredient) {
      return {
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
    }
    return {
      name: ingredient.name,
      category: ingredient.category,
      displayUnit: ingredient.displayUnit,
      lowStockThreshold: String(ingredient.lowStockThresholdBase || ''),
      minStock: String(ingredient.minStockBase || ''),
      storageLocation: ingredient.storageLocation || '',
      trackExpiry: ingredient.trackExpiry,
      notes: ingredient.notes || '',
    }
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError(t('Ingredient name is required.'))
    if (!form.displayUnit) return setError(t('Unit is required.'))

    const payload = {
      name: form.name,
      category: form.category || 'General',
      displayUnit: form.displayUnit,
      lowStockThreshold: form.lowStockThreshold || 0,
      minStock: form.minStock || 0,
      storageLocation: form.storageLocation,
      trackExpiry: form.trackExpiry,
      notes: form.notes,
    }

    setSaving(true)
    try {
      if (ingredient) {
        await api(`/api/ingredients/${ingredient.id}`, { method: 'PATCH', body: payload })
      } else {
        payload.initialQuantity = form.initialQuantity || 0
        payload.initialTotalCost = form.initialTotalCost || 0
        await api('/api/ingredients', { method: 'POST', body: payload })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={ingredient ? t('Edit {name}', { name: ingredient.name }) : t('New Ingredient')}
      onClose={onClose}
      wide
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">{t('Ingredient name *')}</label>
            <input
              className="field__control"
              placeholder={t('e.g. Potato')}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Category')}</label>
            <input
              className="field__control"
              placeholder={t('e.g. Vegetables')}
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Unit *')}</label>
            <select
              className="field__control"
              value={form.displayUnit}
              onChange={(e) => set('displayUnit', e.target.value)}
            >
              {['kg', 'g', 'L', 'ml', 'pcs', 'loaf', 'slice', 'Packet', 'Bottle', 'Box'].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {!ingredient && (
            <>
              <div className="field">
                <label className="field__label">
                  {t('Initial quantity ({unit})', { unit: form.displayUnit })}
                </label>
                <input
                  className="field__control"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t('e.g. 20')}
                  value={form.initialQuantity}
                  onChange={(e) => set('initialQuantity', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label">{t('Total purchase price (৳)')}</label>
                <input
                  className="field__control"
                  type="number"
                  min="0"
                  step="any"
                  placeholder={t('e.g. 1000')}
                  value={form.initialTotalCost}
                  onChange={(e) => set('initialTotalCost', e.target.value)}
                />
              </div>
            </>
          )}

          <div className="field">
            <label className="field__label">
              {t('Low-stock threshold ({unit})', { unit: form.displayUnit })}
            </label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              placeholder={t('e.g. 7')}
              value={form.lowStockThreshold}
              onChange={(e) => set('lowStockThreshold', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">
              {t('Minimum stock ({unit})', { unit: form.displayUnit })}
            </label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              placeholder={t('e.g. 5')}
              value={form.minStock}
              onChange={(e) => set('minStock', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Storage location')}</label>
            <input
              className="field__control"
              placeholder={t('e.g. Cold storage, shelf 2')}
              value={form.storageLocation}
              onChange={(e) => set('storageLocation', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
              <input
                type="checkbox"
                checked={form.trackExpiry}
                onChange={(e) => set('trackExpiry', e.target.checked)}
              />
              {t('Track expiry for this ingredient')}
            </label>
          </div>
          <div className="field field--full">
            <label className="field__label">{t('Notes')}</label>
            <textarea
              className="field__control"
              rows="2"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving
              ? t('Saving…')
              : ingredient
                ? t('Save changes')
                : t('Add ingredient')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
