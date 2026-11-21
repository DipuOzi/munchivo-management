import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney } from '../shared/units.js'
import { formatDate, todayISO } from '../shared/dates.js'
import Modal from '../components/ui/Modal.jsx'

const TXN_TYPES = [
  { value: 'capital_contribution', label: 'Capital in', tone: 'success' },
  { value: 'drawing', label: 'Drawing', tone: 'warning' },
  { value: 'profit_share', label: 'Profit share', tone: 'success' },
  { value: 'loan', label: 'Loan to business', tone: 'success' },
  { value: 'loan_repayment', label: 'Loan repayment', tone: 'warning' },
]

const TXN_LABEL = Object.fromEntries(TXN_TYPES.map((t) => [t.value, t]))

function ownershipPercent(basisPoints) {
  const pct = (Number(basisPoints) || 0) / 100
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2)}%`
}

export default function PartnersPage() {
  const { t } = useTranslation()
  const [partners, setPartners] = useState([])
  const [ownershipTotal, setOwnershipTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [ledgerPartner, setLedgerPartner] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api('/api/partners')
      setPartners(data.partners)
      setOwnershipTotal(data.ownershipTotalBasisPoints)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const summary = useMemo(() => {
    const active = partners.filter((p) => p.isActive)
    return {
      activeCount: active.length,
      capital: active.reduce((s, p) => s + p.capitalPoisha, 0),
      drawings: active.reduce((s, p) => s + p.drawingsPoisha, 0),
      net: active.reduce((s, p) => s + p.netPoisha, 0),
    }
  }, [partners])

  async function toggleActive(partner) {
    if (
      partner.isActive &&
      !confirm(t('Deactivate {name}? Their ledger history is kept.', { name: partner.name }))
    ) {
      return
    }
    setBusyId(partner.id)
    setError('')
    try {
      await api(`/api/partners/${partner.id}`, {
        method: 'PATCH',
        body: { isActive: !partner.isActive },
      })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function openLedger(partner) {
    setLedgerPartner(partner)
  }

  return (
    <>
      <div>
        <h1>{t('Partners')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(
            'Ownership, capital, drawings and loans for each business partner. Positive balances are owed by the business to the partner.',
          )}
        </p>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Active partners')}</span>
            <span className="stat-card__icon stat-card__icon--orders" aria-hidden="true">👥</span>
          </div>
          <span className="stat-card__value">{summary.activeCount}</span>
          <span className="stat-card__hint">
            {t('Combined ownership {pct}', { pct: ownershipPercent(ownershipTotal) })}
          </span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Capital contributed')}</span>
            <span className="stat-card__icon stat-card__icon--profit" aria-hidden="true">↗</span>
          </div>
          <span className="stat-card__value money">{formatMoney(summary.capital)}</span>
          <span className="stat-card__hint">{t('Money partners put into the business')}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Total drawings')}</span>
            <span className="stat-card__icon stat-card__icon--inventory" aria-hidden="true">↙</span>
          </div>
          <span className="stat-card__value money">{formatMoney(summary.drawings)}</span>
          <span className="stat-card__hint">{t('Money taken out by partners')}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">{t('Net partner balance')}</span>
            <span className="stat-card__icon stat-card__icon--revenue" aria-hidden="true">৳</span>
          </div>
          <span className="stat-card__value money">{formatMoney(summary.net)}</span>
          <span className="stat-card__hint">
            {t('Capital + profit share + loans − drawings')}
          </span>
        </div>
      </div>

      {ownershipTotal > 0 && ownershipTotal !== 10000 && (
        <div className="alert alert--info">
          {t(
            'Active ownership adds up to {pct}. Adjust partner percentages so the total is exactly 100%.',
            { pct: ownershipPercent(ownershipTotal) },
          )}
        </div>
      )}

      <div className="toolbar">
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          {t('+ Add Partner')}
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">{t('Loading…')}</div>
        ) : partners.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🤝</span>
            <span className="empty__title">{t('No partners yet')}</span>
            <span className="empty__hint">
              {t(
                'Add each partner with their ownership percentage, then record capital, drawings and loans in their ledger.',
              )}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('Partner')}</th>
                  <th>{t('Ownership')}</th>
                  <th>{t('Capital in')}</th>
                  <th>{t('Drawings')}</th>
                  <th>{t('Profit share')}</th>
                  <th>{t('Net balance')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.id} className={!p.isActive ? 'row-muted' : ''}>
                    <td>
                      <strong>{p.name}</strong>
                      {!p.isActive && (
                        <> <span className="badge badge--neutral">{t('Inactive')}</span></>
                      )}
                      <div className="cell-sub">
                        {[p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </td>
                    <td>{ownershipPercent(p.ownershipBasisPoints)}</td>
                    <td className="money">{formatMoney(p.capitalPoisha)}</td>
                    <td className="money">{formatMoney(p.drawingsPoisha)}</td>
                    <td className="money">{formatMoney(p.profitSharePoisha)}</td>
                    <td className={`money${p.netPoisha < 0 ? ' stock-low' : ''}`}>
                      {formatMoney(p.netPoisha)}
                    </td>
                    <td>
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => openLedger(p)}
                        >
                          {t('Ledger ({count})', { count: p.transactionCount })}
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => setEditing(p)}
                        >
                          {t('Edit')}
                        </button>
                        <button
                          type="button"
                          className={`link-btn${p.isActive ? ' link-btn--danger' : ''}`}
                          disabled={busyId === p.id}
                          onClick={() => toggleActive(p)}
                        >
                          {p.isActive ? t('Deactivate') : t('Reactivate')}
                        </button>
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
        <PartnerForm
          partner={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {ledgerPartner && (
        <PartnerLedger
          partner={ledgerPartner}
          onClose={() => {
            setLedgerPartner(null)
            load()
          }}
          onChanged={load}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function PartnerForm({ partner, onClose, onSaved }) {
  const { t } = useTranslation()
  const [form, setForm] = useState(
    partner
      ? {
          name: partner.name || '',
          email: partner.email || '',
          phone: partner.phone || '',
          ownershipPercent: (partner.ownershipBasisPoints / 100).toString(),
          notes: partner.notes || '',
          isActive: partner.isActive,
        }
      : {
          name: '',
          email: '',
          phone: '',
          ownershipPercent: '',
          notes: '',
          isActive: true,
        },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) return setError(t('Partner name is required.'))
    const pct = Number(form.ownershipPercent || 0)
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return setError(t('Ownership must be between 0% and 100%.'))
    }

    setSaving(true)
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        ownershipPercent: pct,
        notes: form.notes,
      }
      if (partner) {
        await api(`/api/partners/${partner.id}`, {
          method: 'PATCH',
          body: { ...body, isActive: form.isActive },
        })
      } else {
        await api('/api/partners', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={partner ? t('Edit {name}', { name: partner.name }) : t('Add partner')}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">{t('Partner name *')}</label>
            <input
              className="field__control"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              autoFocus
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Email')}</label>
            <input
              className="field__control"
              type="email"
              value={form.email}
              onChange={(e) => set('email', e.target.value)}
              placeholder="partner@munchivo.com"
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Phone')}</label>
            <input
              className="field__control"
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Ownership (%)')}</label>
            <input
              className="field__control"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.ownershipPercent}
              onChange={(e) => set('ownershipPercent', e.target.value)}
              placeholder={t('e.g. 33.33')}
            />
          </div>
          {partner && (
            <div className="field">
              <label className="field__label">{t('Status')}</label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => set('isActive', e.target.checked)}
                />
                <span>{t('Active partner')}</span>
              </label>
            </div>
          )}
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
            {saving ? t('Saving…') : partner ? t('Save changes') : t('Add partner')}
          </button>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------------------------------------------ */
function PartnerLedger({ partner, onClose, onChanged }) {
  const { t, locale } = useTranslation()
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    type: 'capital_contribution',
    amount: '',
    transactionDate: todayISO(),
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api(`/api/partners/${partner.id}/transactions`)
      setTransactions(data.transactions)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [partner.id])

  useEffect(() => {
    load()
  }, [load])

  const totals = useMemo(() => {
    const confirmed = transactions.filter((t) => t.status === 'confirmed')
    const sum = (type) =>
      confirmed
        .filter((t) => t.type === type)
        .reduce((s, t) => s + t.amountPoisha, 0)
    const capital = sum('capital_contribution')
    const drawings = sum('drawing')
    const profitShare = sum('profit_share')
    const loans = sum('loan')
    const repayments = sum('loan_repayment')
    return {
      capital,
      drawings,
      profitShare,
      loans,
      repayments,
      net: capital + profitShare + loans - drawings - repayments,
    }
  }, [transactions])

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function addTransaction(e) {
    e.preventDefault()
    setError('')
    if (!form.amount || Number(form.amount) <= 0) {
      return setError(t('Amount must be greater than zero.'))
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.transactionDate)) {
      return setError(t('Choose a valid date.'))
    }
    setSaving(true)
    try {
      await api(`/api/partners/${partner.id}/transactions`, {
        method: 'POST',
        body: form,
      })
      setForm((f) => ({ ...f, amount: '', description: '' }))
      await load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function cancelTransaction(txn) {
    if (!confirm(t('Cancel this ledger entry? The history will be kept.'))) return
    setBusyId(txn.id)
    setError('')
    try {
      await api(
        `/api/partners/${partner.id}/transactions/${txn.id}`,
        { method: 'DELETE' },
      )
      await load()
      onChanged()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Modal
      title={t('{name} — partner ledger', { name: partner.name })}
      onClose={onClose}
      wide
    >
      <div className="ledger-summary">
        <div>
          <span className="stat-card__label">{t('Capital')}</span>
          <strong className="money">{formatMoney(totals.capital)}</strong>
        </div>
        <div>
          <span className="stat-card__label">{t('Drawings')}</span>
          <strong className="money">{formatMoney(totals.drawings)}</strong>
        </div>
        <div>
          <span className="stat-card__label">{t('Profit share')}</span>
          <strong className="money">{formatMoney(totals.profitShare)}</strong>
        </div>
        <div>
          <span className="stat-card__label">{t('Net')}</span>
          <strong className={`money${totals.net < 0 ? ' stock-low' : ''}`}>
            {formatMoney(totals.net)}
          </strong>
        </div>
      </div>

      <form onSubmit={addTransaction} className="ledger-form">
        <div className="ledger-form__grid">
          <div className="field">
            <label className="field__label">{t('Type')}</label>
            <select
              className="field__control"
              value={form.type}
              onChange={(e) => set('type', e.target.value)}
            >
              {TXN_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>{t(opt.label)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">{t('Amount (৳) *')}</label>
            <input
              className="field__control"
              type="number"
              min="0"
              step="0.01"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field__label">{t('Date *')}</label>
            <input
              className="field__control"
              type="date"
              value={form.transactionDate}
              onChange={(e) => set('transactionDate', e.target.value)}
            />
          </div>
          <div className="field ledger-form__description">
            <label className="field__label">{t('Description')}</label>
            <input
              className="field__control"
              placeholder={t('Optional note')}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>
          <div className="field ledger-form__submit">
            <button type="submit" className="btn btn--primary" disabled={saving}>
              {saving ? t('Adding…') : t('Add entry')}
            </button>
          </div>
        </div>
        {error && <div className="alert alert--error">{error}</div>}
      </form>

      {loading ? (
        <div className="empty">{t('Loading ledger…')}</div>
      ) : transactions.length === 0 ? (
        <div className="empty">
          <span className="empty__icon" aria-hidden="true">📒</span>
          <span className="empty__title">{t('No ledger entries yet')}</span>
          <span className="empty__hint">
            {t('Record capital contributions, drawings and loans above.')}
          </span>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>{t('Date')}</th>
                <th>{t('Type')}</th>
                <th>{t('Description')}</th>
                <th>{t('Amount')}</th>
                <th>{t('By')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((txn) => {
                const meta = TXN_LABEL[txn.type] || {
                  label: txn.type,
                  tone: 'neutral',
                }
                return (
                  <tr key={txn.id} className={txn.status === 'cancelled' ? 'row-muted' : ''}>
                    <td>{formatDate(txn.transactionDate, locale)}</td>
                    <td>
                      <span className={`badge badge--${meta.tone}`}>{t(meta.label)}</span>
                      {txn.status === 'cancelled' && (
                        <> <span className="badge badge--neutral">{t('Cancelled')}</span></>
                      )}
                    </td>
                    <td>{txn.description || '—'}</td>
                    <td className="money">
                      {txn.status === 'cancelled' ? (
                        <s>{formatMoney(txn.amountPoisha)}</s>
                      ) : (
                        formatMoney(txn.amountPoisha)
                      )}
                    </td>
                    <td>{txn.recorderName || '—'}</td>
                    <td>
                      {txn.status === 'confirmed' && (
                        <button
                          type="button"
                          className="link-btn link-btn--danger"
                          disabled={busyId === txn.id}
                          onClick={() => cancelTransaction(txn)}
                        >
                          {t('Cancel')}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
