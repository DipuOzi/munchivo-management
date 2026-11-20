import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, poishaToTaka } from '../shared/units.js'
import { formatDate, monthISO, todayISO } from '../shared/dates.js'
import Modal from '../components/ui/Modal.jsx'

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bkash', label: 'bKash' },
  { value: 'nagad', label: 'Nagad' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
]

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'confirmed', label: 'Active' },
  { value: 'cancelled', label: 'Cancelled' },
]

const PAID_OPTIONS = [
  { value: 'all', label: 'Paid & unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'unpaid', label: 'Unpaid' },
]

export default function ExpensesPage() {
  const [rows, setRows] = useState([])
  const [summary, setSummary] = useState(null)
  const [categories, setCategories] = useState([])
  const [month, setMonth] = useState(monthISO())
  const [filters, setFilters] = useState({
    categoryId: '',
    status: 'all',
    paid: 'all',
    search: '',
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadCategories = useCallback(async () => {
    try {
      const data = await api('/api/expense-categories')
      setCategories(data.categories)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const selected = month || monthISO()
      const [year, m] = selected.split('-').map(Number)
      const lastDay = new Date(year, m, 0).getDate()
      const params = new URLSearchParams({
        start: `${selected}-01`,
        end: `${selected}-${String(lastDay).padStart(2, '0')}`,
        status: filters.status,
        paid: filters.paid,
      })
      if (filters.categoryId) params.set('categoryId', filters.categoryId)
      if (filters.search.trim()) params.set('search', filters.search.trim())

      const data = await api(`/api/expenses?${params.toString()}`)
      setRows(data.expenses)
      setSummary(data.summary)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [month, filters])

  useEffect(() => {
    loadCategories()
  }, [loadCategories])

  useEffect(() => {
    const timer = setTimeout(load, filters.search ? 300 : 0)
    return () => clearTimeout(timer)
  }, [load, filters.search])

  function setFilter(field, value) {
    setFilters((f) => ({ ...f, [field]: value }))
  }

  async function markPaid(expense, isPaid) {
    setBusyId(expense.id)
    setError('')
    try {
      await api(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        body: { isPaid },
      })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  async function cancelExpense(expense) {
    if (!confirm(`Cancel "${expense.description}"? The record stays in history.`)) {
      return
    }
    setBusyId(expense.id)
    setError('')
    try {
      await api(`/api/expenses/${expense.id}`, { method: 'DELETE' })
      load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  function handleCategoryCreated(category) {
    setCategories((list) =>
      [...list, { ...category, expenseCount: 0 }].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    )
  }

  const s = summary || {
    totalPoisha: 0,
    paidPoisha: 0,
    unpaidPoisha: 0,
    count: 0,
    unpaidCount: 0,
  }

  return (
    <>
      <div>
        <h1>Expenses</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Rent, utilities, salaries, marketing and every other operating cost.
          Ingredient purchases are tracked separately under Purchases.
        </p>
      </div>

      <div className="stat-grid">
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Expenses this month</span>
            <span className="stat-card__icon stat-card__icon--inventory" aria-hidden="true">৳</span>
          </div>
          <span className="stat-card__value money">{formatMoney(s.totalPoisha)}</span>
          <span className="stat-card__hint">{s.count} record{s.count === 1 ? '' : 's'}</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Unpaid</span>
            <span className="stat-card__icon stat-card__icon--orders" aria-hidden="true">!</span>
          </div>
          <span className={`stat-card__value money${s.unpaidPoisha > 0 ? ' stock-low' : ''}`}>
            {formatMoney(s.unpaidPoisha)}
          </span>
          <span className="stat-card__hint">
            {s.unpaidCount} unpaid bill{s.unpaidCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Paid</span>
            <span className="stat-card__icon stat-card__icon--profit" aria-hidden="true">✓</span>
          </div>
          <span className="stat-card__value money">{formatMoney(s.paidPoisha)}</span>
          <span className="stat-card__hint">Settled this month</span>
        </div>
        <div className="card stat-card">
          <div className="stat-card__top">
            <span className="stat-card__label">Categories</span>
            <span className="stat-card__icon stat-card__icon--revenue" aria-hidden="true">▦</span>
          </div>
          <span className="stat-card__value">{categories.length}</span>
          <span className="stat-card__hint">Operating cost types</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          type="month"
          className="toolbar__select"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          aria-label="Expense month"
        />
        <select
          className="toolbar__select"
          value={filters.categoryId}
          onChange={(e) => setFilter('categoryId', e.target.value)}
          aria-label="Filter by category"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select
          className="toolbar__select"
          value={filters.status}
          onChange={(e) => setFilter('status', e.target.value)}
          aria-label="Filter by status"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <select
          className="toolbar__select"
          value={filters.paid}
          onChange={(e) => setFilter('paid', e.target.value)}
          aria-label="Filter by payment"
        >
          {PAID_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <input
          className="field__control toolbar__search"
          placeholder="Search description…"
          value={filters.search}
          onChange={(e) => setFilter('search', e.target.value)}
          aria-label="Search expenses"
        />
        <button type="button" className="btn btn--primary" onClick={() => setEditing('new')}>
          + Add Expense
        </button>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        {loading ? (
          <div className="empty">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🧾</span>
            <span className="empty__title">No expenses recorded</span>
            <span className="empty__hint">
              Add rent, utility bills, salaries and other running costs so your
              Reports page can show a true net profit.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Recorded by</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.status === 'cancelled' ? 'row-muted' : ''}>
                    <td>{formatDate(row.expenseDate)}</td>
                    <td>
                      <strong>{row.description}</strong>
                      {row.notes && (
                        <div className="cell-sub">{row.notes}</div>
                      )}
                    </td>
                    <td>{row.categoryName || 'Uncategorised'}</td>
                    <td className="cell-capitalize">{row.paymentMethod}</td>
                    <td>
                      {row.status === 'cancelled' ? (
                        <span className="badge badge--neutral">Cancelled</span>
                      ) : row.isPaid ? (
                        <span className="badge badge--success">Paid</span>
                      ) : (
                        <span className="badge badge--warning">Unpaid</span>
                      )}
                    </td>
                    <td className="money">
                      {row.status === 'cancelled' ? (
                        <s>{formatMoney(row.amountPoisha)}</s>
                      ) : (
                        formatMoney(row.amountPoisha)
                      )}
                    </td>
                    <td>{row.creatorName || '—'}</td>
                    <td>
                      {row.status === 'confirmed' && (
                        <div className="inline-actions">
                          <button
                            type="button"
                            className="link-btn"
                            onClick={() => setEditing(row)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="link-btn"
                            disabled={busyId === row.id}
                            onClick={() => markPaid(row, !row.isPaid)}
                          >
                            {row.isPaid ? 'Mark unpaid' : 'Mark paid'}
                          </button>
                          <button
                            type="button"
                            className="link-btn link-btn--danger"
                            disabled={busyId === row.id}
                            onClick={() => cancelExpense(row)}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          categories={categories}
          onCategoryCreated={handleCategoryCreated}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
            loadCategories()
          }}
        />
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ExpenseForm({ expense, categories, onCategoryCreated, onClose, onSaved }) {
  const [form, setForm] = useState(() =>
    expense
      ? {
          description: expense.description || '',
          amount: poishaToTaka(expense.amountPoisha),
          expenseDate: expense.expenseDate || todayISO(),
          categoryId: expense.categoryId || '',
          paymentMethod: expense.paymentMethod || 'cash',
          isPaid: expense.isPaid,
          paidAt: expense.paidAt || expense.expenseDate || todayISO(),
          notes: expense.notes || '',
        }
      : {
          description: '',
          amount: '',
          expenseDate: todayISO(),
          categoryId: categories[0]?.id || '',
          paymentMethod: 'cash',
          isPaid: true,
          paidAt: todayISO(),
          notes: '',
        },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [categoryBusy, setCategoryBusy] = useState(false)

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function addCategory() {
    const name = newCategory.trim()
    if (!name) return
    setCategoryBusy(true)
    setError('')
    try {
      const data = await api('/api/expense-categories', {
        method: 'POST',
        body: { name },
      })
      onCategoryCreated(data.category)
      set('categoryId', data.category.id)
      setNewCategory('')
      setShowNewCategory(false)
    } catch (err) {
      setError(err.message)
    } finally {
      setCategoryBusy(false)
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!form.description.trim()) return setError('Description is required.')
    if (!form.amount || Number(form.amount) <= 0) {
      return setError('Amount must be greater than zero.')
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.expenseDate)) {
      return setError('Choose a valid expense date.')
    }

    setSaving(true)
    try {
      const body = {
        description: form.description,
        amount: form.amount,
        expenseDate: form.expenseDate,
        categoryId: form.categoryId || null,
        paymentMethod: form.paymentMethod,
        isPaid: form.isPaid,
        paidAt: form.isPaid ? form.paidAt : null,
        notes: form.notes,
      }
      if (expense) {
        await api(`/api/expenses/${expense.id}`, { method: 'PATCH', body })
      } else {
        await api('/api/expenses', { method: 'POST', body })
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={expense ? 'Edit expense' : 'Add expense'} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">Description *</label>
            <input
              className="field__control"
              placeholder="e.g. Electricity bill — November"
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              autoFocus
            />
          </div>

          <div className="field field--full">
            <label className="field__label">Category</label>
            <div className="inline-actions" style={{ alignItems: 'center' }}>
              <select
                className="field__control"
                value={form.categoryId}
                onChange={(e) => set('categoryId', e.target.value)}
                style={{ flex: 1 }}
              >
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => setShowNewCategory((v) => !v)}
              >
                {showNewCategory ? 'Close' : '+ New category'}
              </button>
            </div>
            {showNewCategory && (
              <div className="inline-actions" style={{ marginTop: 6 }}>
                <input
                  className="field__control"
                  placeholder="New category name"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addCategory()
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="btn btn--dark btn--sm"
                  onClick={addCategory}
                  disabled={categoryBusy}
                >
                  {categoryBusy ? 'Adding…' : 'Add'}
                </button>
              </div>
            )}
          </div>

          <div className="field">
            <label className="field__label">Amount (৳) *</label>
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
            <label className="field__label">Date *</label>
            <input
              className="field__control"
              type="date"
              value={form.expenseDate}
              onChange={(e) => {
                set('expenseDate', e.target.value)
                if (!expense) set('paidAt', e.target.value)
              }}
            />
          </div>

          <div className="field">
            <label className="field__label">Payment method</label>
            <select
              className="field__control"
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label">Payment status</label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={form.isPaid}
                onChange={(e) => set('isPaid', e.target.checked)}
              />
              <span>Already paid</span>
            </label>
          </div>

          {form.isPaid && (
            <div className="field">
              <label className="field__label">Paid on</label>
              <input
                className="field__control"
                type="date"
                value={form.paidAt}
                onChange={(e) => set('paidAt', e.target.value)}
              />
            </div>
          )}

          <div className="field field--full">
            <label className="field__label">Notes</label>
            <textarea
              className="field__control"
              rows="2"
              placeholder="Optional reference, invoice number or note"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>
        </div>

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={saving}>
            {saving ? 'Saving…' : expense ? 'Save changes' : 'Add expense'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
