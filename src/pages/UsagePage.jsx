import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, formatQty } from '../shared/units.js'
import Modal from '../components/ui/Modal.jsx'

/**
 * USAGE & RECONCILIATION
 * Daily / range ingredient consumption, manual usage, and end-of-day stock
 * reconciliation. All figures come from the inventory movement ledger.
 */

const RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: 'Last 7 days' },
  { key: '30d', label: 'Last 30 days' },
  { key: 'custom', label: 'Custom' },
]

const USAGE_REASONS = [
  { value: 'staff_meal', label: 'Staff meal' },
  { value: 'sample', label: 'Free sample' },
  { value: 'testing', label: 'Testing / R&D' },
  { value: 'personal', label: 'Personal use' },
  { value: 'other', label: 'Other' },
]
const REASON_LABEL = Object.fromEntries(USAGE_REASONS.map((r) => [r.value, r.label]))

function todayStr() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(
    n.getDate(),
  ).padStart(2, '0')}`
}

function num(n) {
  return (n || 0).toLocaleString()
}

/* ---------- Charts (inline SVG, same approach as the dashboard) ---------- */

function DailyBars({ daily }) {
  const max = Math.max(...daily.map((d) => d.cost), 1)
  const w = 620
  const h = 150
  const gap = 6
  const barW = Math.max((w - gap * (daily.length - 1)) / daily.length, 4)
  if (daily.every((d) => d.cost === 0)) {
    return <div className="empty">No consumption in this period.</div>
  }
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} style={{ width: '100%', display: 'block' }} role="img" aria-label="Daily consumption cost">
      {daily.map((d, i) => {
        const barH = Math.round((d.cost / max) * h)
        const x = i * (barW + gap)
        return (
          <g key={d.day}>
            <rect x={x} y={h - barH} width={barW} height={barH} rx="3" fill="var(--orange)">
              <title>{`${d.day}: ${formatMoney(d.cost)}`}</title>
            </rect>
            {(daily.length <= 14 || i % Math.ceil(daily.length / 12) === 0) && (
              <text x={x + barW / 2} y={h + 14} textAnchor="middle" fontSize="9" fill="var(--muted)">
                {d.day.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function IngredientBars({ ingredients }) {
  const top = ingredients.slice(0, 8)
  if (top.length === 0) return <div className="empty">No ingredient consumption yet.</div>
  const max = Math.max(...top.map((i) => i.totalCost), 1)
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {top.map((i) => (
        <div key={i.ingredientId}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span>{i.name}</span>
            <strong className="money">{formatMoney(i.totalCost)}</strong>
          </div>
          <div style={{ height: 8, background: 'var(--surface-alt)', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ width: `${(i.totalCost / max) * 100}%`, height: '100%', background: 'var(--orange)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function TypeBreakdown({ byType }) {
  const rows = [
    { label: 'Sales consumption', value: byType.sales.cost, color: 'var(--success)' },
    { label: 'Waste & spoilage', value: byType.waste.cost, color: 'var(--danger)' },
    { label: 'Manual usage', value: byType.manual.cost, color: 'var(--orange)' },
    { label: 'Expiry', value: byType.expiry.cost, color: 'var(--muted)' },
  ]
  const total = rows.reduce((s, r) => s + Math.max(r.value, 0), 0) || 1
  return (
    <div>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', background: 'var(--surface-alt)' }}>
        {rows.map((r) => (
          <div key={r.label} style={{ width: `${(Math.max(r.value, 0) / total) * 100}%`, background: r.color }} title={r.label} />
        ))}
      </div>
      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        {rows.map((r) => (
          <div key={r.label} className="summary-line">
            <span>
              <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: r.color, marginRight: 8 }} />
              {r.label}
            </span>
            <strong className="money">{formatMoney(r.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------- Page ------------------------------- */

export default function UsagePage() {
  const [tab, setTab] = useState('overview')

  return (
    <>
      <div>
        <h1>Inventory Usage &amp; Reconciliation</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Track what ingredients are consumed, record manual usage, and reconcile
          physical stock at the end of each day. All figures come from the stock ledger.
        </p>
      </div>

      <div className="toolbar" style={{ marginBottom: 16 }}>
        <button className={`btn btn--sm ${tab === 'overview' ? 'btn--dark' : 'btn--ghost'}`} onClick={() => setTab('overview')}>Overview</button>
        <button className={`btn btn--sm ${tab === 'report' ? 'btn--dark' : 'btn--ghost'}`} onClick={() => setTab('report')}>Daily Report</button>
        <button className={`btn btn--sm ${tab === 'reconciliation' ? 'btn--dark' : 'btn--ghost'}`} onClick={() => setTab('reconciliation')}>Reconciliation</button>
      </div>

      {tab === 'overview' && <OverviewTab />}
      {tab === 'report' && <ReportTab />}
      {tab === 'reconciliation' && <ReconciliationTab />}
    </>
  )
}

function StatCard({ label, value, hint, icon }) {
  return (
    <div className="card stat-card">
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon && <span className="stat-card__icon stat-card__icon--profit" aria-hidden="true">{icon}</span>}
      </div>
      <span className="stat-card__value">{value}</span>
      {hint && <span className="stat-card__hint">{hint}</span>}
    </div>
  )
}

/* ----------------------------- Overview ----------------------------- */

function OverviewTab() {
  const [range, setRange] = useState('7d')
  const [customStart, setCustomStart] = useState(todayStr())
  const [customEnd, setCustomEnd] = useState(todayStr())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [usageOpen, setUsageOpen] = useState(false)
  const [records, setRecords] = useState([])
  const [ingredients, setIngredients] = useState([])

  const loadRecords = useCallback(async () => {
    try {
      const [rec, ing] = await Promise.all([
        api('/api/usage/records?status=all'),
        api('/api/ingredients?status=active'),
      ])
      setRecords(rec.records)
      setIngredients(ing.ingredients)
    } catch {
      /* non-fatal */
    }
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ range })
      if (range === 'custom') {
        params.set('start', customStart)
        params.set('end', customEnd)
      }
      setData(await api(`/api/usage?${params.toString()}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [range, customStart, customEnd])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  if (error) return <div className="alert alert--error">{error}</div>
  if (loading || !data) return <div className="card"><div className="empty">Loading…</div></div>

  const s = data.summary
  return (
    <>
      <div className="toolbar">
        {RANGES.map((r) => (
          <button key={r.key} className={`btn btn--sm ${range === r.key ? 'btn--dark' : 'btn--ghost'}`} onClick={() => setRange(r.key)}>
            {r.label}
          </button>
        ))}
        {range === 'custom' && (
          <>
            <input className="field__control" type="date" style={{ maxWidth: 160 }} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
            <span style={{ color: 'var(--muted)' }}>→</span>
            <input className="field__control" type="date" style={{ maxWidth: 160 }} value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
          </>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn--primary btn--sm" onClick={() => setUsageOpen(true)}>Record manual usage</button>
      </div>

      <div className="stat-grid">
        <StatCard label="Total consumption cost" value={formatMoney(s.totalConsumptionCost)} hint={data.range.label} icon="৳" />
        <StatCard label="Sales consumption" value={formatMoney(s.salesCost)} icon="🧾" />
        <StatCard label="Waste & spoilage" value={formatMoney(s.wasteCost)} icon="🗑" />
        <StatCard label="Manual usage" value={formatMoney(s.manualCost)} icon="🥄" />
        <StatCard label="Ingredients used" value={num(s.ingredientsUsed)} icon="📦" />
        <StatCard label="Unusual consumption" value={num(s.unusualCount)} hint="vs. previous period" icon="⚠" />
        <StatCard
          label="Expected closing value"
          value={formatMoney(s.expectedClosingValue)}
          hint="Stock on hand at avg cost"
          icon="📊"
        />
        <StatCard
          label="Adjustments"
          value={formatMoney(s.adjustmentCost)}
          hint={`Net qty ${num(s.adjustmentQty)} base`}
          icon="⚖"
        />
      </div>

      {data.unusual.length > 0 && (
        <div className="alert alert--info" style={{ marginTop: 16 }}>
          <strong>Unusually high consumption:</strong>{' '}
          {data.unusual.map((u) => `${u.name} (${formatMoney(u.currentCost)})`).join(', ')}
        </div>
      )}

      <div className="dash-grid" style={{ marginTop: 20 }}>
        <div className="card">
          <div className="card__title"><h3>Daily consumption cost</h3></div>
          <DailyBars daily={data.daily} />
        </div>
        <div className="card">
          <div className="card__title"><h3>Usage by type</h3></div>
          <TypeBreakdown byType={data.byType} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card__title"><h3>Ingredient-wise consumption</h3></div>
        <IngredientBars ingredients={data.ingredients} />
      </div>

      <div className="card card--flush" style={{ marginTop: 20 }}>
        <div className="card__title" style={{ padding: '0 16px' }}><h3>Ingredient breakdown</h3></div>
        {data.ingredients.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">📦</span>
            <span className="empty__title">No consumption recorded</span>
            <span className="empty__hint">Sales, waste and manual usage will appear here.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Sales</th>
                  <th>Waste</th>
                  <th>Other</th>
                  <th>Total qty</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((i) => (
                  <tr key={i.ingredientId}>
                    <td><strong>{i.name}</strong></td>
                    <td>{formatQty(i.salesQty, i.displayUnit)}</td>
                    <td>{formatQty(i.wasteQty, i.displayUnit)}</td>
                    <td>{formatQty(i.manualQty + i.expiryQty, i.displayUnit)}</td>
                    <td>{formatQty(i.totalQty, i.displayUnit)}</td>
                    <td className="money">{formatMoney(i.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card card--flush" style={{ marginTop: 20 }}>
        <div className="card__title" style={{ padding: '0 16px' }}>
          <h3>Recent manual usage</h3>
          <span className="badge badge--neutral">{records.filter((r) => r.status === 'confirmed').length} confirmed</span>
        </div>
        {records.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🥄</span>
            <span className="empty__title">No manual usage recorded</span>
            <span className="empty__hint">Staff meals, samples, testing and other non-sale usage appear here.</span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Ingredient</th><th>Qty</th><th>Reason</th><th>Cost</th><th>By</th><th /></tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id}>
                    <td>{new Date(r.createdAt).toLocaleString()}</td>
                    <td><strong>{r.ingredientName}</strong></td>
                    <td>{formatQty(r.quantityBase, r.ingredientUnit)}</td>
                    <td>
                      <span className="badge badge--neutral">{REASON_LABEL[r.reason] || r.reason}</span>
                      {r.status === 'cancelled' && <span className="badge badge--warning" style={{ marginLeft: 6 }}>cancelled</span>}
                    </td>
                    <td className="money">{formatMoney(r.quantityBase * r.unitCostPoisha)}</td>
                    <td>{r.recorderName || '—'}</td>
                    <td>
                      {r.status === 'confirmed' && (
                        <ManualUsageCancel id={r.id} onDone={loadRecords} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {usageOpen && (
        <ManualUsageModal
          ingredients={ingredients}
          onClose={() => setUsageOpen(false)}
          onSaved={() => {
            setUsageOpen(false)
            loadRecords()
            load()
          }}
        />
      )}
    </>
  )
}

function ManualUsageCancel({ id, onDone }) {
  const [busy, setBusy] = useState(false)
  const cancel = async () => {
    if (!window.confirm('Cancel this manual usage and return the stock?')) return
    setBusy(true)
    try {
      await api(`/api/usage/${id}`, { method: 'DELETE' })
      onDone()
    } catch (err) {
      window.alert(err.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <button className="link-btn link-btn--danger" onClick={cancel} disabled={busy}>
      {busy ? '…' : 'Cancel'}
    </button>
  )
}

function ManualUsageModal({ ingredients, onClose, onSaved }) {
  const [form, setForm] = useState({ ingredientId: '', quantity: '', unit: '', reason: 'staff_meal', notes: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const ingredient = ingredients.find((i) => i.id === form.ingredientId)
  const unit = form.unit || ingredient?.displayUnit || ''

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.ingredientId) return setError('Select an ingredient.')
    if (!form.quantity || Number(form.quantity) <= 0) return setError('Quantity must be greater than zero.')
    if (!window.confirm('Confirm this stock usage? It will deduct inventory.')) return
    setSaving(true)
    try {
      await api('/api/usage', {
        method: 'POST',
        body: { ingredientId: form.ingredientId, quantity: Number(form.quantity), unit, reason: form.reason, notes: form.notes },
      })
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title="Record Manual Usage" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="form-grid">
          <div className="field field--full">
            <label className="field__label">Ingredient *</label>
            <select
              className="field__control"
              value={form.ingredientId}
              onChange={(e) => setForm((f) => ({ ...f, ingredientId: e.target.value, unit: ingredients.find((i) => i.id === e.target.value)?.displayUnit || '' }))}
            >
              <option value="">— select —</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>{i.name} (stock: {formatQty(i.currentStockBase, i.displayUnit)})</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="field__label">Quantity {unit ? `(${unit})` : ''} *</label>
            <input className="field__control" type="number" min="0" step="any" value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
          </div>
          <div className="field">
            <label className="field__label">Reason *</label>
            <select className="field__control" value={form.reason} onChange={(e) => set('reason', e.target.value)}>
              {USAGE_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="field field--full">
            <label className="field__label">Notes</label>
            <input className="field__control" value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
        </div>

        {ingredient && form.quantity && (
          <div className="cost-preview">
            <div className="summary-line">
              <span>Estimated cost</span>
              <strong className="money">{formatMoney(Math.round(Number(form.quantity) * ingredient.avgCostPoisha))}</strong>
            </div>
          </div>
        )}

        {error && <div className="alert alert--error">{error}</div>}

        <div className="modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn--primary" disabled={saving}>{saving ? 'Saving…' : 'Record usage'}</button>
        </div>
      </form>
    </Modal>
  )
}

/* ---------------------------- Daily Report ---------------------------- */

function ReportTab() {
  const [date, setDate] = useState(todayStr())
  const [search, setSearch] = useState('')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ date })
      if (search) params.set('search', search)
      setData(await api(`/api/usage/daily-report?${params.toString()}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [date, search])

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [load, search])

  const exportCsv = () => {
    if (!data) return
    const header = [
      'Ingredient', 'Opening', 'Purchased', 'Sales', 'Production', 'Waste', 'Other',
      'Total consumed', 'Expected closing', 'Actual closing', 'Difference', 'Consumption cost',
    ]
    const rows = data.ingredients.map((i) => [
      i.name,
      i.openingBase, i.purchasedBase, i.salesBase, i.productionBase, i.wasteBase, i.otherBase,
      i.totalConsumedBase, i.expectedClosingBase,
      i.actualClosingBase == null ? '' : i.actualClosingBase,
      i.differenceBase == null ? '' : i.differenceBase,
      (i.consumptionCost / 100).toFixed(2),
    ])
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `usage-report-${date}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (error) return <div className="alert alert--error">{error}</div>

  return (
    <>
      <div className="toolbar">
        <label style={{ fontSize: 13, color: 'var(--muted)' }}>Date</label>
        <input className="field__control" type="date" style={{ maxWidth: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <input className="field__control" placeholder="Search ingredient…" style={{ maxWidth: 220 }} value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn--primary btn--sm" onClick={exportCsv} disabled={!data}>Export CSV</button>
      </div>

      {loading || !data ? (
        <div className="card"><div className="empty">Loading…</div></div>
      ) : data.ingredients.length === 0 ? (
        <div className="card">
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">📅</span>
            <span className="empty__title">No movements on {date}</span>
            <span className="empty__hint">Choose another date or record sales / usage.</span>
          </div>
        </div>
      ) : (
        <div className="card card--flush">
          <div className="card__title" style={{ padding: '0 16px' }}>
            <h3>Daily usage — {date}</h3>
            <span className="badge badge--neutral">Cost {formatMoney(data.totals.consumptionCost)}</span>
          </div>
          <div className="table-wrap">
            <table className="table overview-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Opening</th>
                  <th>Purchased</th>
                  <th>Sales</th>
                  <th>Waste</th>
                  <th>Other</th>
                  <th>Total used</th>
                  <th>Expected</th>
                  <th>Actual</th>
                  <th>Diff</th>
                  <th>Cost</th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((i) => (
                  <tr key={i.ingredientId}>
                    <td className="row-label">{i.name}{i.displayUnit ? ` (${i.displayUnit})` : ''}</td>
                    <td>{i.openingBase}</td>
                    <td>{i.purchasedBase}</td>
                    <td>{i.salesBase}</td>
                    <td>{i.wasteBase}</td>
                    <td>{i.otherBase}</td>
                    <td>{i.totalConsumedBase}</td>
                    <td>{i.expectedClosingBase}</td>
                    <td>{i.actualClosingBase == null ? '—' : i.actualClosingBase}</td>
                    <td>{i.differenceBase == null ? '—' : i.differenceBase}</td>
                    <td className="money">{formatMoney(i.consumptionCost)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{data.totals.totalConsumedBase}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td className="money">{formatMoney(data.totals.consumptionCost)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

/* --------------------------- Reconciliation --------------------------- */

function ReconciliationTab() {
  const today = todayStr()
  const [date, setDate] = useState(today)
  const [data, setData] = useState(null)
  const [inputs, setInputs] = useState({})
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    setMsg('')
    try {
      const sheet = await api(`/api/usage/reconciliation?date=${date}`)
      setData(sheet)
      const pre = {}
      for (const i of sheet.ingredients) {
        if (i.reconciled) pre[i.ingredientId] = { actual: String(i.actualClosingBase), note: i.explanation || '' }
      }
      setInputs(pre)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const setInput = (id, field, value) =>
    setInputs((prev) => ({ ...prev, [id]: { actual: prev[id]?.actual || '', note: prev[id]?.note || '', [field]: value } }))

  const counts = useMemo(() => {
    if (!data) return []
    return data.ingredients
      .filter((i) => inputs[i.ingredientId]?.actual !== undefined && inputs[i.ingredientId]?.actual !== '')
      .map((i) => ({ ingredientId: i.ingredientId, actualQuantity: inputs[i.ingredientId].actual, explanation: inputs[i.ingredientId].note }))
  }, [data, inputs])

  const confirm = async () => {
    setSaving(true)
    setError('')
    setMsg('')
    try {
      await api('/api/usage/reconciliation', { method: 'POST', body: { date, counts } })
      setMsg('Reconciliation saved. Stock adjusted to the counted quantities.')
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (error && !data) return <div className="alert alert--error">{error}</div>
  if (loading || !data) return <div className="card"><div className="empty">Loading…</div></div>

  const isToday = date === today
  const reconciledCount = data.ingredients.filter((i) => i.reconciled).length

  return (
    <>
      <div className="toolbar">
        <label style={{ fontSize: 13, color: 'var(--muted)' }}>Business date</label>
        <input className="field__control" type="date" style={{ maxWidth: 170 }} value={date} onChange={(e) => setDate(e.target.value)} />
        <span className="badge badge--neutral">{reconciledCount} of {data.ingredients.length} counted</span>
      </div>

      {error && <div className="alert alert--error">{error}</div>}
      {msg && <div className="alert alert--success">{msg}</div>}
      {!isToday && (
        <div className="alert alert--info">
          You are viewing <strong>{date}</strong>. Only <strong>today</strong> can be confirmed; past days are read-only.
        </div>
      )}

      <div className="card card--flush">
        <div className="card__title" style={{ padding: '0 16px' }}>
          <h3>Physical count — {date}</h3>
        </div>
        {data.ingredients.length === 0 ? (
          <div className="empty">No stock to reconcile.</div>
        ) : (
          <div className="table-wrap">
            <table className="table overview-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Expected</th>
                  <th>Actual count</th>
                  <th>Difference</th>
                  <th>Explanation</th>
                </tr>
              </thead>
              <tbody>
                {data.ingredients.map((i) => {
                  const val = inputs[i.ingredientId]?.actual
                  const diff = val !== undefined && val !== '' ? Number(val) - Number(i.expectedClosingBase) : null
                  return (
                    <tr key={i.ingredientId}>
                      <td className="row-label">{i.name}{i.displayUnit ? ` (${i.displayUnit})` : ''}</td>
                      <td>{formatQty(i.expectedClosingBase, i.displayUnit)} <span style={{ color: 'var(--muted)' }}>({i.expectedClosingBase})</span></td>
                      <td>
                        <input
                          className="field__control"
                          type="number"
                          step="any"
                          style={{ maxWidth: 120 }}
                          value={val ?? ''}
                          onChange={(e) => setInput(i.ingredientId, 'actual', e.target.value)}
                          disabled={!isToday}
                        />
                      </td>
                      <td className={diff == null ? '' : diff < 0 ? 'value-negative' : diff > 0 ? 'value-profit' : ''}>
                        {diff == null ? '—' : diff}
                      </td>
                      <td>
                        <input
                          className="field__control"
                          placeholder="Reason (if different)"
                          value={inputs[i.ingredientId]?.note ?? ''}
                          onChange={(e) => setInput(i.ingredientId, 'note', e.target.value)}
                          disabled={!isToday}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isToday && (
        <div className="toolbar" style={{ marginTop: 16 }}>
          <button className="btn btn--primary" onClick={confirm} disabled={saving || counts.length === 0}>
            {saving ? 'Saving…' : `Confirm reconciliation${counts.length ? ` (${counts.length})` : ''}`}
          </button>
          <span style={{ color: 'var(--muted)', fontSize: 13 }}>
            Confirming creates an explicit stock adjustment for any difference.
          </span>
        </div>
      )}

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card__title"><h3>Reconciliation history</h3></div>
        {data.history.length === 0 ? (
          <div className="empty">No reconciliations recorded yet.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th>Date</th><th>Ingredient</th><th>Expected</th><th>Actual</th><th>Diff</th><th>By</th></tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.date}</td>
                    <td>{h.ingredientName}</td>
                    <td>{h.expectedBase}</td>
                    <td>{h.actualBase}</td>
                    <td className={h.differenceBase < 0 ? 'value-negative' : h.differenceBase > 0 ? 'value-profit' : ''}>{h.differenceBase}</td>
                    <td>{h.userName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  )
}