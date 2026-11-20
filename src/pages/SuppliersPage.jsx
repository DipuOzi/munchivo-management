import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

const EMPTY = { name: '', phone: '', address: '', category: '', notes: '' }

export default function SuppliersPage() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/suppliers')
      setRows(data.suppliers)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const totalDue = rows.reduce((sum, r) => sum + r.duePoisha, 0)

  return (
    <>
      <div>
        <h1>Suppliers</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Total outstanding due: <strong className="money">{formatMoney(totalDue)}</strong>
        </p>
      </div>

      <div className="toolbar">
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          + Add Supplier
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🚚</span>
            <span className="empty__title">No suppliers yet</span>
            <span className="empty__hint">
              Add the people and shops you buy ingredients from — purchases and
              dues will be tracked per supplier.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Phone</th>
                  <th>Category</th>
                  <th>Total purchased</th>
                  <th>Due</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.name}</strong>
                      {!s.isActive && (
                        <>
                          {' '}
                          <span className="badge badge--neutral">Inactive</span>
                        </>
                      )}
                      {s.address && (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{s.address}</div>
                      )}
                    </td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.category || '—'}</td>
                    <td className="money">{formatMoney(s.totalPurchasedPoisha)}</td>
                    <td className={s.duePoisha > 0 ? 'stock-low money' : 'money'}>
                      {formatMoney(s.duePoisha)}
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button type="button" className="link-btn" onClick={() => setEditing(s)}>
                          Edit
                        </button>
                        {s.isActive && (
                          <button
                            type="button"
                            className="link-btn link-btn--danger"
                            onClick={async () => {
                              if (!confirm(`Deactivate "${s.name}"? Purchase history is kept.`)) return
                              try {
                                await api(`/api/suppliers/${s.id}`, { method: 'DELETE' })
                                load()
                              } catch (err) {
                                setError(err.message)
                              }
                            }}
                          >
                            Deactivate
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
        <SupplierForm
          supplier={editing === 'new' ? null : editing}
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

function SupplierForm({ supplier, onClose, onSaved }) {
  const [form, setForm] = useState(
    supplier
      ? {
          name: supplier.name,
          phone: supplier.phone || '',
          address: supplier.address || '',
          category: supplier.category || '',
          notes: supplier.notes || '',
        }
      : EMPTY,
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError('Supplier name is required.')
    setSaving(true)
    try {
      if (supplier) {
        await api(`/api/suppliers/${supplier.id}`, { method: 'PATCH', body: form })
      } else {
        await api('/api/suppliers', { method: 'POST', body: form })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={supplier ? `Edit ${supplier.name}` : 'Add Supplier'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">Supplier name *</label>
            <input className="field__control" value={form.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Phone</label>
            <input className="field__control" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Category</label>
            <input
              className="field__control"
              placeholder="e.g. Vegetables, Dairy"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <label className="field__label">Address</label>
            <input className="field__control" value={form.address} onChange={(e) => set('address', e.target.value)} />
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
            {saving ? 'Saving…' : supplier ? 'Save changes' : 'Add supplier'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
