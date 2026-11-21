import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

const PAYMENT_LABELS = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  other: 'Other',
}

function newToken() {
  return `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export default function SalesPage() {
  const { t, locale } = useTranslation()
  const [sales, setSales] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newSale, setNewSale] = useState(false)
  const [detail, setDetail] = useState(null)
  const [filters, setFilters] = useState({ start: '', end: '', payment: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.start) params.set('start', filters.start)
      if (filters.end) params.set('end', filters.end)
      if (filters.payment) params.set('payment', filters.payment)
      const [s, p] = await Promise.all([
        api(`/api/sales?${params.toString()}`),
        api('/api/products?status=active'),
      ])
      setSales(s.sales)
      setProducts(p.products)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    load()
  }, [load])

  const summary = useMemo(() => {
    const confirmed = sales.filter((s) => s.status === 'confirmed')
    return {
      count: confirmed.length,
      revenue: confirmed.reduce((sum, s) => sum + s.totalPoisha - s.refundPoisha, 0),
      profit: confirmed.reduce((sum, s) => sum + s.totalPoisha - s.refundPoisha - s.cogsPoisha, 0),
    }
  }, [sales])

  return (
    <>
      <div>
        <h1>{t('Sales')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(
            "Recording a sale deducts the product's recipe ingredients automatically. Profits use the real cost at the moment of sale.",
          )}
        </p>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Orders (filtered)')}</span>
            <span className="stat-card__icon stat-card__icon--orders" aria-hidden="true">#</span>
          </div>
          <span className="stat-card__value">{summary.count}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Revenue (after refunds)')}</span>
            <span className="stat-card__icon stat-card__icon--revenue" aria-hidden="true">৳</span>
          </div>
          <span className="stat-card__value money">{formatMoney(summary.revenue)}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Gross profit')}</span>
            <span className="stat-card__icon stat-card__icon--profit" aria-hidden="true">↗</span>
          </div>
          <span className="stat-card__value money">{formatMoney(summary.profit)}</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="date"
          className="toolbar__select"
          value={filters.start}
          onChange={(e) => setFilters((f) => ({ ...f, start: e.target.value }))}
          aria-label={t('From date')}
        />
        <input
          type="date"
          className="toolbar__select"
          value={filters.end}
          onChange={(e) => setFilters((f) => ({ ...f, end: e.target.value }))}
          aria-label={t('To date')}
        />
        <select
          className="toolbar__select"
          value={filters.payment}
          onChange={(e) => setFilters((f) => ({ ...f, payment: e.target.value }))}
          aria-label={t('Payment method')}
        >
          <option value="">{t('All payments')}</option>
          {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
            <option key={v} value={v}>{t(l)}</option>
          ))}
        </select>
        <button type="button" className="btn btn--primary" onClick={() => setNewSale(true)}>
          {t('+ New Sale')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">{t('Loading…')}</div>
        ) : sales.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🧾</span>
            <span className="empty__title">{t('No sales recorded')}</span>
            <span className="empty__hint">
              {t('Record your first sale — inventory and profit update automatically.')}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Order')}</th>
                  <th>{t('Date')}</th>
                  <th>{t('Items')}</th>
                  <th>{t('Total')}</th>
                  <th>{t('Refunded')}</th>
                  <th>{t('Profit')}</th>
                  <th>{t('Payment')}</th>
                  <th>{t('Status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setDetail(s.id)}>
                        {s.orderNumber}
                      </button>
                    </td>
                    <td>{new Date(s.saleDate).toLocaleString(locale)}</td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.productNames}
                    </td>
                    <td className="money">{formatMoney(s.totalPoisha)}</td>
                    <td className="money">{s.refundPoisha ? formatMoney(s.refundPoisha) : '—'}</td>
                    <td className="money">{formatMoney(s.totalPoisha - s.refundPoisha - s.cogsPoisha)}</td>
                    <td>{t(PAYMENT_LABELS[s.paymentMethod] || s.paymentMethod)}</td>
                    <td>
                      <span className={`badge ${s.status === 'confirmed' ? 'badge--success' : 'badge--neutral'}`}>
                        {s.status === 'confirmed' ? t('Confirmed') : t('Cancelled')}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="link-btn" onClick={() => setDetail(s.id)}>
                        {t('View')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {newSale && (
        <NewSaleForm
          products={products}
          onClose={() => setNewSale(false)}
          onSaved={() => {
            setNewSale(false)
            load()
          }}
        />
      )}
      {detail && (
        <SaleDetail
          saleId={detail}
          onClose={() => setDetail(null)}
          onChanged={load}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function NewSaleForm({ products, onClose, onSaved }) {
  const { t } = useTranslation()
  const [lines, setLines] = useState([{ productId: '', quantity: 1 }])
  const [discount, setDiscount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const productById = (id) => products.find((p) => p.id === id)

  const totals = useMemo(() => {
    let subtotal = 0
    for (const line of lines) {
      const p = productById(line.productId)
      if (p && line.quantity > 0) subtotal += p.sellingPricePoisha * Number(line.quantity)
    }
    const discountPoisha = Math.round(Number(discount || 0) * 100)
    return { subtotal, discountPoisha, total: Math.max(subtotal - discountPoisha, 0) }
  }, [lines, discount, products])

  function setLine(index, field, value) {
    setLines((list) => list.map((l, i) => (i === index ? { ...l, [field]: value } : l)))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const items = lines
      .filter((l) => l.productId && Number(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: Number(l.quantity) }))
    if (items.length === 0) return setError(t('Add at least one product with a quantity.'))

    setSaving(true)
    // clientToken makes retries safe — the server never creates the same
    // order twice (double-click / flaky network protection).
    try {
      await api('/api/sales', {
        method: 'POST',
        body: {
          items,
          discount: discount || 0,
          paymentMethod,
          saleDate: `${saleDate}T${new Date().toTimeString().slice(0, 8)}`,
          notes,
          clientToken: newToken(),
        },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={t('New Sale')} onClose={onClose} wide>
      <form onSubmit={handleSubmit}>
        <div className="section-label" style={{ marginTop: 0 }}>{t('Products')}</div>
        {lines.map((line, idx) => {
          const p = productById(line.productId)
          return (
            <div className="item-row" key={idx} style={{ gridTemplateColumns: '2fr 0.5fr auto', marginBottom: 10 }}>
              <div className="field">
                <label className="field__label">{t('Product')}</label>
                <select
                  className="field__control"
                  value={line.productId}
                  onChange={(e) => setLine(idx, 'productId', e.target.value)}
                >
                  <option value="">{t('— select —')}</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — {formatMoney(p.sellingPricePoisha)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="field__label">{t('Qty')}</label>
                <input
                  className="field__control"
                  type="number"
                  min="1"
                  step="1"
                  value={line.quantity}
                  onChange={(e) => setLine(idx, 'quantity', e.target.value)}
                />
              </div>
              <button
                type="button"
                className="link-btn link-btn--danger"
                onClick={() => setLines((l) => l.filter((_, i) => i !== idx))}
                disabled={lines.length === 1}
                style={{ marginTop: 22 }}
              >
                ✕
              </button>
            </div>
          )
        })}
        <button
          type="button"
          className="link-btn"
          onClick={() => setLines((l) => [...l, { productId: '', quantity: 1 }])}
        >
          {t('+ Add product')}
        </button>

        <div className="form-grid">
          <div className="field">
            <label className="field__label">{t('Discount (৳)')}</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Payment method')}</label>
            <select className="field__control" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              {Object.entries(PAYMENT_LABELS).map(([v, l]) => (
                <option key={v} value={v}>{t(l)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">{t('Sale date')}</label>
            <input
              className="field__control"
              type="date"
              value={saleDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Notes')}</label>
            <input className="field__control" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="cost-preview">
          <div className="summary-line">
            <span>{t('Subtotal')}</span>
            <strong className="money">{formatMoney(totals.subtotal)}</strong>
          </div>
          {totals.discountPoisha > 0 && (
            <div className="summary-line">
              <span>{t('Discount')}</span>
              <strong className="money">−{formatMoney(totals.discountPoisha)}</strong>
            </div>
          )}
          <div className="summary-line summary-line--total">
            <span>{t('Total')}</span>
            <strong className="money">{formatMoney(totals.total)}</strong>
          </div>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Recording…') : t('Record sale')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function SaleDetail({ saleId, onClose, onChanged }) {
  const { t, locale } = useTranslation()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [refundOpen, setRefundOpen] = useState(false)

  useEffect(() => {
    api(`/api/sales/${saleId}`)
      .then(setData)
      .catch((err) => setError(err.message))
  }, [saleId])

  async function cancelSale() {
    if (!confirm(t('Cancel this order? ALL inventory deductions will be reversed.')))
      return
    try {
      await api(`/api/sales/${saleId}`, { method: 'DELETE' })
      onClose()
      onChanged()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <Modal
      title={t('Order {number}', { number: data?.sale?.orderNumber || '…' })}
      onClose={onClose}
    >
      {error && <div className="alert alert--error">{error}</div>}
      {!data ? (
        <div className="empty">{t('Loading…')}</div>
      ) : (
        <>
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 12px' }}>
            {new Date(data.sale.saleDate).toLocaleString(locale)} ·{' '}
            {t(PAYMENT_LABELS[data.sale.paymentMethod] || data.sale.paymentMethod)} ·{' '}
            {t('recorded by')} {data.sale.creatorName || '—'}
          </p>
          {data.items.map((it) => (
            <div className="summary-line" key={it.id}>
              <span>
                {it.productName} ×{it.quantity}
              </span>
              <strong className="money">{formatMoney(it.lineTotalPoisha)}</strong>
            </div>
          ))}
          <div className="summary-line">
            <span>{t('Discount')}</span>
            <strong className="money">−{formatMoney(data.sale.discountPoisha)}</strong>
          </div>
          {data.sale.refundPoisha > 0 && (
            <div className="summary-line">
              <span>{t('Refunded')}</span>
              <strong className="money">−{formatMoney(data.sale.refundPoisha)}</strong>
            </div>
          )}
          <div className="summary-line summary-line--total">
            <span>{t('Total')}</span>
            <strong className="money">{formatMoney(data.sale.totalPoisha - data.sale.refundPoisha)}</strong>
          </div>

          {data.refunds.length > 0 && (
            <>
              <div className="section-label">{t('Refund history')}</div>
              {data.refunds.map((r) => (
                <div className="summary-line" key={r.id}>
                  <span>{r.reason || t('Refund')}</span>
                  <strong className="money">{formatMoney(r.amountPoisha)}</strong>
                </div>
              ))}
            </>
          )}

          {data.sale.status === 'confirmed' && (
            <div className="modal__actions">
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setRefundOpen(true)}
                disabled={data.sale.refundPoisha >= data.sale.totalPoisha}
              >
                {t('Record refund')}
              </button>
              <button type="button" className="btn btn--danger" onClick={cancelSale}>
                {t('Cancel order')}
              </button>
            </div>
          )}
        </>
      )}

      {refundOpen && data && (
        <RefundForm
          sale={data.sale}
          onClose={() => setRefundOpen(false)}
          onSaved={() => {
            setRefundOpen(false)
            api(`/api/sales/${saleId}`).then(setData).catch(() => {})
            onChanged()
          }}
        />
      )}
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function RefundForm({ sale, onClose, onSaved }) {
  const { t, locale } = useTranslation()
  const refundable = (sale.totalPoisha - sale.refundPoisha) / 100
  const [amount, setAmount] = useState(String(refundable))
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!amount || Number(amount) <= 0) return setError(t('Enter a refund amount.'))
    setSaving(true)
    try {
      await api(`/api/sales/${sale.id}/refunds`, {
        method: 'POST',
        body: { amount: Number(amount), reason },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={t('Record refund')} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          {t(
            'Refunds are financial only — perishable goods are not returned to inventory. Refundable:',
          )}{' '}
          <strong>৳{refundable.toLocaleString(locale)}</strong>
        </p>
        <div className="form-grid">
          <div className="field">
            <label className="field__label">{t('Amount (৳)')}</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="any"
              max={refundable}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Reason')}</label>
            <input
              className="field__control"
              placeholder={t('e.g. customer returned item')}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        {error && <div className="alert alert--error">{error}</div>}
        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            {t('Cancel')}
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? t('Saving…') : t('Record refund')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
