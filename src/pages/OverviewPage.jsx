import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney } from '../shared/units.js'

/**
 * SALES OVERVIEW — daily / monthly / yearly / lifetime sales performance.
 * Everything is computed live from recorded sales, so nothing has to be
 * reset manually: the "Today" card rolls over automatically at midnight,
 * while the database keeps the full history for the other periods.
 */
const PERIOD_ORDER = ['daily', 'monthly', 'yearly', 'lifetime']
const PERIOD_ICON = {
  daily: '◷',
  monthly: '▦',
  yearly: '📅',
  lifetime: '∞',
}

function PeriodCard({ period }) {
  return (
    <div className="card stat-card">
      <div className="stat-card__top">
        <span className="stat-card__label">{period.label}</span>
        <span className="stat-card__icon stat-card__icon--profit" aria-hidden="true">
          {PERIOD_ICON[period.key] || '•'}
        </span>
      </div>
      <div>
        <div className="stat-card__label">Profit</div>
        <span className="stat-card__value money">{formatMoney(period.profitPoisha)}</span>
      </div>
      <div className="summary-line">
        <span>Revenue</span>
        <strong className="money">{formatMoney(period.revenuePoisha)}</strong>
      </div>
      <div className="summary-line">
        <span>Cost (COGS)</span>
        <strong className="money">{formatMoney(period.cogsPoisha)}</strong>
      </div>
      <div className="summary-line">
        <span>Orders</span>
        <strong>{period.orders}</strong>
      </div>
      <div className="summary-line">
        <span>Items sold</span>
        <strong>{period.items}</strong>
      </div>
      <span className="stat-card__hint">{period.period}</span>
    </div>
  )
}

export default function OverviewPage() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api('/api/overview'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <>
        <div>
          <h1>Sales Overview</h1>
        </div>
        <div className="alert alert--error">{error}</div>
      </>
    )
  }

  if (loading || !data) {
    return (
      <>
        <div>
          <h1>Sales Overview</h1>
        </div>
        <div className="card">
          <div className="empty">Loading…</div>
        </div>
      </>
    )
  }

  const today = data.periods.daily

  return (
    <>
      <div>
        <h1>Sales Overview</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Live sales, cost and profit. Today resets automatically at midnight —
          the database keeps every record for the month, year and all-time totals.
        </p>
      </div>

      <div className="stat-grid">
        {PERIOD_ORDER.map((key) => (
          <PeriodCard key={key} period={data.periods[key]} />
        ))}
      </div>

      <div className="card card--flush" style={{ marginTop: 20 }}>
        <div className="card__title" style={{ padding: '0 16px' }}>
          <h3>Sold today</h3>
          <span className="badge badge--neutral">
            {today.orders} order{today.orders === 1 ? '' : 's'}
          </span>
        </div>
        {data.todayItems.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🧾</span>
            <span className="empty__title">Nothing sold today yet</span>
            <span className="empty__hint">
              Record a sale and today&apos;s items, cost and profit appear here.
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Qty sold</th>
                  <th>Revenue</th>
                  <th>Cost</th>
                  <th>Profit</th>
                </tr>
              </thead>
              <tbody>
                {data.todayItems.map((it) => (
                  <tr key={it.productName}>
                    <td><strong>{it.productName}</strong></td>
                    <td>{it.quantity}</td>
                    <td className="money">{formatMoney(it.revenuePoisha)}</td>
                    <td className="money">{formatMoney(it.cogsPoisha)}</td>
                    <td className="money">{formatMoney(it.profitPoisha)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td><strong>Total</strong></td>
                  <td><strong>{today.items}</strong></td>
                  <td className="money"><strong>{formatMoney(today.revenuePoisha)}</strong></td>
                  <td className="money"><strong>{formatMoney(today.cogsPoisha)}</strong></td>
                  <td className="money"><strong>{formatMoney(today.profitPoisha)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}