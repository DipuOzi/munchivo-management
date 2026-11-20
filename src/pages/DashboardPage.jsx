import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { formatMoney, formatQty } from '../shared/units.js'

/**
 * DASHBOARD — real data from /api/dashboard:
 * today's revenue/orders/profit, 14-day revenue trend (pure SVG),
 * low stock, expiring soon, recent orders, top products.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/dashboard')
      .then(setData)
      .catch((err) => setError(err.message))
  }, [])

  if (error) {
    return <div className="alert alert--error">{error}</div>
  }

  if (!data) {
    return (
      <>
        <div>
          <h1>
            Good day, <em>{user?.name || 'Partner'}</em>
          </h1>
        </div>
        <div className="card">
          <div className="empty">Loading…</div>
        </div>
      </>
    )
  }

  const stats = [
    {
      label: "Today's Revenue",
      value: formatMoney(data.today.revenue),
      hint:
        data.today.orders > 0
          ? `${data.today.orders} order${data.today.orders === 1 ? '' : 's'} today`
          : 'No sales recorded today',
      icon: '৳',
      cls: 'revenue',
    },
    {
      label: "Today's Orders",
      value: String(data.today.orders),
      hint: data.today.orders > 0 ? 'Keep it going!' : 'No orders recorded today',
      icon: '#',
      cls: 'orders',
    },
    {
      label: "Today's Gross Profit",
      value: formatMoney(data.today.profit),
      hint: 'Revenue minus ingredient cost (COGS)',
      icon: '↗',
      cls: 'profit',
    },
    {
      label: 'Supplier Dues',
      value: formatMoney(data.supplierDues),
      hint: 'Unpaid purchase balance',
      icon: '▦',
      cls: 'inventory',
    },
  ]

  return (
    <>
      <div>
        <h1>
          Good day, <em>{user?.name || 'Partner'}</em>
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Here is how Munchivo is doing today.
        </p>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="card stat-card" key={s.label}>
            <div className="stat-card__top">
              <span className="stat-card__label">{s.label}</span>
              <span className={`stat-card__icon stat-card__icon--${s.cls}`} aria-hidden="true">
                {s.icon}
              </span>
            </div>
            <span className="stat-card__value">{s.value}</span>
            <span className="stat-card__hint">{s.hint}</span>
          </div>
        ))}
      </div>

      <div className="dash-grid">
        <div className="card">
          <div className="card__title">
            <h3>Revenue — last 14 days</h3>
            <Link className="link-btn" to="/sales">
              View sales
            </Link>
          </div>
          <TrendChart trend={data.trend} />
        </div>

        <div className="card">
          <div className="card__title">
            <h3>Low Stock Alerts</h3>
            <Link className="link-btn" to="/inventory">
              Inventory
            </Link>
          </div>
          {data.lowStock.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">📦</span>
              <span className="empty__title">All stock levels healthy</span>
              <span className="empty__hint">
                Set thresholds on ingredients and alerts appear here automatically.
              </span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.lowStock.map((i) => (
                <li key={i.id} className="mini-row mini-row--alert">
                  <span>
                    <strong>{i.name}</strong>
                    <span className="mini-row__sub">
                      stock {formatQty(i.currentStockBase, i.displayUnit)} · threshold{' '}
                      {formatQty(i.lowStockThresholdBase, i.displayUnit)}
                    </span>
                  </span>
                  <Link className="link-btn" to="/purchases">
                    Purchase
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>Recent Orders</h3>
            <Link className="link-btn" to="/sales">
              All sales
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">🧾</span>
              <span className="empty__title">No orders yet</span>
              <span className="empty__hint">Record your first sale to see it here.</span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.recentOrders.map((o) => (
                <li className="mini-row" key={o.id}>
                  <span>
                    <strong>{o.orderNumber}</strong>
                    <span className="mini-row__sub">
                      {new Date(o.saleDate).toLocaleString()} · {o.status}
                    </span>
                  </span>
                  <strong className="money">{formatMoney(o.totalPoisha)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>Expiring Soon</h3>
            <Link className="link-btn" to="/expiry">
              Expiry page
            </Link>
          </div>
          {data.expiringBatches.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">✅</span>
              <span className="empty__title">Nothing expiring in 7 days</span>
              <span className="empty__hint">
                Purchase batches with expiry dates will surface here.
              </span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.expiringBatches.map((b) => (
                <li className="mini-row mini-row--alert" key={b.id}>
                  <span>
                    <strong>{b.name}</strong>
                    <span className="mini-row__sub">
                      {formatQty(b.quantityRemainingBase, b.displayUnit)} · expires {b.expiryDate}
                    </span>
                  </span>
                  <Link className="link-btn" to="/expiry">
                    Review
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>Top Products — 30 days</h3>
          </div>
          {data.topProducts.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">🏆</span>
              <span className="empty__title">No sales in the last 30 days</span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.topProducts.map((p) => (
                <li className="mini-row" key={p.productId || p.name}>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="mini-row__sub">{p.unitsSold} sold</span>
                  </span>
                  <strong className="money">{formatMoney(p.revenue)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>Waste This Month</h3>
            <Link className="link-btn" to="/waste">
              Waste log
            </Link>
          </div>
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🗑️</span>
            <span className="empty__title money">{formatMoney(data.wasteMonth)}</span>
            <span className="empty__hint">
              {data.wasteCount} waste record{data.wasteCount === 1 ? '' : 's'} this month.
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

/* Tiny inline SVG bar chart — no chart library needed for the dashboard. */
function TrendChart({ trend }) {
  const max = Math.max(...trend.map((t) => t.revenue), 1)
  const w = 560
  const h = 140
  const gap = 6
  const barW = (w - gap * (trend.length - 1)) / trend.length

  return trend.every((t) => t.revenue === 0) ? (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">📈</span>
      <span className="empty__title">No sales data yet</span>
      <span className="empty__hint">
        Record your first sale and your daily revenue trend appears here.
      </span>
    </div>
  ) : (
    <svg
      viewBox={`0 0 ${w} ${h + 18}`}
      style={{ width: '100%', display: 'block' }}
      role="img"
      aria-label="Daily revenue for the last 14 days"
    >
      {trend.map((t, i) => {
        const barH = Math.round((t.revenue / max) * h)
        const x = i * (barW + gap)
        return (
          <g key={t.day}>
            <rect
              x={x}
              y={h - barH}
              width={barW}
              height={barH}
              rx="4"
              fill={i === trend.length - 1 ? 'var(--orange)' : 'var(--orange-soft, #ffd766)'}
            >
              <title>{`${t.day}: ${formatMoney(t.revenue)} (${t.orders} orders)`}</title>
            </rect>
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={h + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {t.day.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
