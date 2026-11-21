import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, formatQty } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'other', label: 'Other' },
]

const todayStr = () => new Date().toISOString().slice(0, 10)

function blankItem() {
  return { ingredientId: '', quantity: '', lineTotal: '', expiryDate: '' }
}

export default function PurchasesPage() {
  const [rows, setRows] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [pur, ing, sup] = await Promise.all([
        api(`/api/purchases?status=${statusFilter}`),
        api('/api/ingredients?status=all'),
        api('/api/suppliers'),
      ])
      setRows(pur.purchases)
      setIngredients(ing.ingredients.filter((i) => i.status === 'active'))
      setSuppliers(sup.suppliers.filter((s) => s.isActive))
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
        <h1>Purchases</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Confirmed purchases automatically increase ingredient stock.
        </p>
      </div>

      <div className="toolbar">
        <select
          className="toolbar__select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All purchases</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => {
            if (ingredients.length === 0) {
              alert('Add at least one ingredient before recording a purchase.')
              return
            }
            setCreating(true)
          }}
        >
          + New Purchase
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🧾</span>
            <span className="empty__title">No purchases yet</span>
            <span className="empty__hint">
              Record your first purchase — stock, average cost and supplier dues
              will update automatically.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Supplier</th>
                  <th>Items</th>
                  <th>Total</th>
                  <th>Paid</th>
                  <th>Due</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const due = p.totalPoisha - p.paidPoisha
                  return (
                    <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setDetailId(p.id)}>
                      <td>{p.purchaseDate}</td>
                      <td>{p.supplierName || '—'}</td>
                      <td>{p.itemCount}</td>
                      <td className="money">{formatMoney(p.totalPoisha)}</td>
                      <td className="money">{formatMoney(p.paidPoisha)}</td>
                      <td className={due > 0 ? 'stock-low money' : 'money'}>
                        {formatMoney(due)}
                      </td>
                      <td>
                        {p.status === 'cancelled' ? (
                          <span className="badge badge--neutral">Cancelled</span>
                        ) : due > 0 ? (
                          <span className="badge badge--warning">Due</span>
                        ) : (
                          <span className="badge badge--success">Paid</span>
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <button type="button" className="link-btn" onClick={() => setDetailId(p.id)}>
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && (
        <PurchaseForm
          ingredients={ingredients}
          suppliers={suppliers}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false)
            load()
          }}
        />
      )}

      {detailId && (
        <PurchaseDetail
          id={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => {
            setDetailId(null)
            load()
          }}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function PurchaseForm({ ingredients, suppliers, onClose, onSaved }) {
  const [form, setForm] = useState({
    purchaseDate: todayStr(),
    supplierId: '',
    paymentMethod: 'cash',
    initialPaid: '',
    invoiceNumber: '',
    notes: '',
  })
  const [items, setItems] = useState([blankItem()])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function setItem(index, field, value) {
    setItems((list) => list.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  const total = items.reduce((sum, it) => sum + (Number(it.lineTotal) || 0), 0)
  const selectedIng = (it) => ingredients.find((i) => i.id === it.ingredientId)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const validItems = items.filter((it) => it.ingredientId && Number(it.quantity) > 0)
    if (validItems.length === 0) return setError('Add at least one item with an ingredient and quantity.')
    if (validItems.some((it) => !it.lineTotal || Number(it.lineTotal) < 0))
      return setError('Every item needs a total cost (0 or more).')

    setSaving(true)
    try {
      const payloadItems = validItems.map((it) => ({
        ingredientId: it.ingredientId,
        quantity: Number(it.quantity),
        lineTotal: Number(it.lineTotal),
        expiryDate: it.expiryDate || null,
        displayUnit: selectedIng(it)?.displayUnit,
      }))
      await api('/api/purchases', {
        method: 'POST',
        body: {
          ...form,
          initialPaid: form.initialPaid || 0,
          items: payloadItems,
        },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="New Purchase" onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">Purchase date *</label>
            <input
              className="field__control"
              type="date"
              value={form.purchaseDate}
              onChange={(e) => set('purchaseDate', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">Supplier</label>
            <select className="field__control" value={form.supplierId} onChange={(e) => set('supplierId', e.target.value)}>
              <option value="">— none —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Invoice number</label>
            <input
              className="field__control"
              value={form.invoiceNumber}
              onChange={(e) => set('invoiceNumber', e.target.value)}
            />
          </div>
        </div>

        <div className="section-label">Items</div>
        {items.map((it, idx) => {
          const ing = selectedIng(it)
          return (
            <div className="item-row" key={idx}>
              <div className="field">
                <label className="field__label">Ingredient</label>
                <select
                  className="field__control"
                  value={it.ingredientId}
                  onChange={(e) => setItem(idx, 'ingredientId', e.target.value)}
                >
                  <option value="">— select —</option>
                  {ingredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} ({i.displayUnit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label">Quantity ({ing ? ing.displayUnit : 'unit'})</label>
                <input
                  className="field__control"
                  type="number"
                  min="0"
                  step="any"
                  value={it.quantity}
                  onChange={(e) => setItem(idx, 'quantity', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label">Total cost (৳)</label>
                <input
                  className="field__control"
                  type="number"
                  min="0"
                  step="any"
                  value={it.lineTotal}
                  onChange={(e) => setItem(idx, 'lineTotal', e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field__label">Expiry (optional)</label>
                <input
                  className="field__control"
                  type="date"
                  value={it.expiryDate}
                  onChange={(e) => setItem(idx, 'expiryDate', e.target.value)}
                />
              </div>
              <button
                type="button"
                className="link-btn link-btn--danger"
                onClick={() => setItems((list) => list.filter((_, i) => i !== idx))}
                disabled={items.length === 1}
                style={{ marginTop: 22 }}
              >
                ✕
              </button>
            </div>
          )
        })}
        <button type="button" className="link-btn" onClick={() => setItems((l) => [...l, blankItem()])}>
          + Add another item
        </button>

        <div className="form-grid">
          <div className="field">
            <label className="field__label">Payment method</label>
            <select className="field__control" value={form.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Paid now (৳, rest becomes due)</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              placeholder={String(total)}
              value={form.initialPaid}
              onChange={(e) => set('initialPaid', e.target.value)}
            />
          </div>
          <div className="field field--full">
            <label className="field__label">Notes</label>
            <input className="field__control" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        <div className="summary-line summary-line--total">
          <span>Total</span>
          <strong className="money">{formatMoney(Math.round(total * 100))}</strong>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : 'Confirm purchase'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function PurchaseDetail({ id, onClose, onChanged }) {
  const [data, setData] = useState(null)
  const [paying, setPaying] = useState(false)
  const [payment, setPayment] = useState({ amount: '', paymentMethod: 'cash', paidAt: todayStr() })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api(`/api/purchases/${id}`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [id])

  async function handlePay(e) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      await api(`/api/purchases/${id}/payments`, { method: 'POST', body: payment })
      const fresh = await api(`/api/purchases/${id}`)
      setData(fresh)
      setPaying(false)
      setPayment({ amount: '', paymentMethod: 'cash', paidAt: todayStr() })
      setSaving(false)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Cancel this purchase? Stock will be reversed and history kept.')) return
    setError('')
    try {
      await api(`/api/purchases/${id}`, { method: 'DELETE', body: { notes: 'Cancelled from purchase detail' } })
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  if (!data) {
    return (
      <Modal title="Purchase" onClose={onClose}>
        <div className="empty">{error || 'Loading…'}</div>
      </Modal>
    )
  }

  const { purchase, items, payments } = data
  const due = purchase.totalPoisha - purchase.paidPoisha

  return (
    <Modal title={`Purchase — ${purchase.purchaseDate}`} onClose={onClose} wide>
      <div className="summary-line">
        <span>Supplier</span>
        <strong>{items.length} item{items.length === 1 ? '' : 's'}</strong>
      </div>
      {items.map((it) => (
        <div className="summary-line" key={it.id} style={{ paddingLeft: 12 }}>
          <span style={{ color: 'var(--muted)' }}>
            {it.ingredientName} - {formatQty(it.quantityBase, it.displayUnit)}
            {it.expiryDate ? ` - expires ${it.expiryDate}` : ''}
          </span>
          <strong className="money">{formatMoney(it.lineTotalPoisha)}</strong>
        </div>
      ))}
      <div className="summary-line summary-line--total">
        <span>Total {formatMoney(purchase.totalPoisha)} {formatMoney(purchase.paidPoisha)}</span>
        <strong className={due > 0 ? 'stock-low money' : 'money'}>
          {due > 0 ? `Due ${formatMoney(due)}` : 'Fully paid'}
        </strong>
      </div>

      <div className="section-label">Payments</div>
      {payments.length === 0 && <p style={{ color: 'var(--muted)' }}>No payments recorded.</p>}
      {payments.map((p) => (
        <div className="summary-line" key={p.id}>
          <span>
            {p.paidAt} - {p.paymentMethod} - {p.recordedBy ? ` - ${p.recordedBy}` : ''}
          </span>
          <strong className="money">{formatMoney(p.amountPoisha)}</strong>
        </div>
      ))}

      {purchase.status === 'confirmed' && due > 0 && !paying && (
        <button type="button" className="btn btn--dark" onClick={() => setPaying(true)}>
          Record payment
        </button>
      )}

      {paying && (
        <form onSubmit={handlePay} className="form-grid">
          <div className="field">
            <label className="field__label">Amount (৳)</label>
            <input
              className="field__control"
              type="number"
              min="1"
              step="any"
              max={due / 100}
              value={payment.amount}
              onChange={(e) => setPayment((p) => ({ ...p, amount: e.target.value }))}
            />
          </div>
          <div className="field">
            <label className="field__label">Method</label>
            <select
              className="field__control"
              value={payment.paymentMethod}
              onChange={(e) => setPayment((p) => ({ ...p, paymentMethod: e.target.value }))}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="modal__actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="btn btn--ghost" onClick={() => setPaying(false)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save payment'}
            </button>
          </div>
        </form>
      )}

      {purchase.status === 'confirmed' && (
        <button type="button" className="link-btn link-btn--danger" onClick={handleCancel}>
          Cancel this purchase (reverses stock)
        </button>
      )}
      {purchase.status === 'cancelled' && (
        <div className="alert alert--error">
          This purchase was cancelled — its stock effects were reversed.
        </div>
      )}

      {error && <div className="alert alert--error">{error}</div>}
    </Modal>
  )
}
