import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney, formatQty } from '../shared/units.js'

/**
 * DASHBOARD — real data from /api/dashboard:
 * today's revenue/orders/profit, 14-day revenue trend (pure SVG),
 * low stock, expiring soon, recent orders, top products.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const { t, locale } = useTranslation()
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
            {t('Good day,')} <em>{user?.name || t('Partner')}</em>
          </h1>
        </div>
        <div className="card">
          <div className="empty">{t('Loading…')}</div>
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
          ? t(data.today.orders === 1 ? '{count} order today' : '{count} orders today', {
              count: data.today.orders,
            })
          : t('No sales recorded today'),
      icon: '৳',
      cls: 'revenue',
    },
    {
      label: "Today's Orders",
      value: String(data.today.orders),
      hint: data.today.orders > 0 ? t('Keep it going!') : t('No orders recorded today'),
      icon: '#',
      cls: 'orders',
    },
    {
      label: "Today's Gross Profit",
      value: formatMoney(data.today.profit),
      hint: t('Revenue minus ingredient cost (COGS)'),
      icon: '↗',
      cls: 'profit',
    },
    {
      label: 'Supplier Dues',
      value: formatMoney(data.supplierDues),
      hint: t('Unpaid purchase balance'),
      icon: '▦',
      cls: 'inventory',
    },
  ]

  return (
    <>
      <div>
        <h1>
          {t('Good day,')} <em>{user?.name || t('Partner')}</em>
        </h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t('Here is how Munchivo is doing today.')}
        </p>
      </div>

      <div className="stat-grid">
        {stats.map((s) => (
          <div className="card stat-card" key={s.label}>
            <div className="stat-card__top">
              <span className="stat-card__label">{t(s.label)}</span>
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
            <h3>{t('Revenue — last 14 days')}</h3>
            <Link className="link-btn" to="/sales">
              {t('View sales')}
            </Link>
          </div>
          <TrendChart trend={data.trend} />
        </div>

        <div className="card">
          <div className="card__title">
            <h3>{t('Low Stock Alerts')}</h3>
            <Link className="link-btn" to="/inventory">
              {t('Inventory')}
            </Link>
          </div>
          {data.lowStock.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">📦</span>
              <span className="empty__title">{t('All stock levels healthy')}</span>
              <span className="empty__hint">
                {t('Set thresholds on ingredients and alerts appear here automatically.')}
              </span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.lowStock.map((i) => (
                <li key={i.id} className="mini-row mini-row--alert">
                  <span>
                    <strong>{i.name}</strong>
                    <span className="mini-row__sub">
                      {t('stock')} {formatQty(i.currentStockBase, i.displayUnit)} ·{' '}
                      {t('threshold')} {formatQty(i.lowStockThresholdBase, i.displayUnit)}
                    </span>
                  </span>
                  <Link className="link-btn" to="/purchases">
                    {t('Purchase')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>{t('Recent Orders')}</h3>
            <Link className="link-btn" to="/sales">
              {t('All sales')}
            </Link>
          </div>
          {data.recentOrders.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">🧾</span>
              <span className="empty__title">{t('No orders yet')}</span>
              <span className="empty__hint">{t('Record your first sale to see it here.')}</span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.recentOrders.map((o) => (
                <li className="mini-row" key={o.id}>
                  <span>
                    <strong>{o.orderNumber}</strong>
                    <span className="mini-row__sub">
                      {new Date(o.saleDate).toLocaleString(locale)} · {t(o.status)}
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
            <h3>{t('Expiring Soon')}</h3>
            <Link className="link-btn" to="/expiry">
              {t('Expiry page')}
            </Link>
          </div>
          {data.expiringBatches.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">✅</span>
              <span className="empty__title">{t('Nothing expiring in 7 days')}</span>
              <span className="empty__hint">
                {t('Purchase batches with expiry dates will surface here.')}
              </span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.expiringBatches.map((b) => (
                <li className="mini-row mini-row--alert" key={b.id}>
                  <span>
                    <strong>{b.name}</strong>
                    <span className="mini-row__sub">
                      {formatQty(b.quantityRemainingBase, b.displayUnit)} · {t('expires')}{' '}
                      {b.expiryDate}
                    </span>
                  </span>
                  <Link className="link-btn" to="/expiry">
                    {t('Review')}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>{t('Top Products — 30 days')}</h3>
          </div>
          {data.topProducts.length === 0 ? (
            <div className="empty">
              <span className="empty__icon" aria-hidden="true">🏆</span>
              <span className="empty__title">{t('No sales in the last 30 days')}</span>
            </div>
          ) : (
            <ul className="mini-list">
              {data.topProducts.map((p) => (
                <li className="mini-row" key={p.productId || p.name}>
                  <span>
                    <strong>{p.name}</strong>
                    <span className="mini-row__sub">
                      {t('{count} sold', { count: p.unitsSold })}
                    </span>
                  </span>
                  <strong className="money">{formatMoney(p.revenue)}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card">
          <div className="card__title">
            <h3>{t('Waste This Month')}</h3>
            <Link className="link-btn" to="/waste">
              {t('Waste log')}
            </Link>
          </div>
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🗑️</span>
            <span className="empty__title money">{formatMoney(data.wasteMonth)}</span>
            <span className="empty__hint">
              {t(
                data.wasteCount === 1
                  ? '{count} waste record this month.'
                  : '{count} waste records this month.',
                { count: data.wasteCount },
              )}
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

/* Tiny inline SVG bar chart — no chart library needed for the dashboard. */
function TrendChart({ trend }) {
  const { t: tr } = useTranslation()
  const max = Math.max(...trend.map((d) => d.revenue), 1)
  const w = 560
  const h = 140
  const gap = 6
  const barW = (w - gap * (trend.length - 1)) / trend.length

  return trend.every((d) => d.revenue === 0) ? (
    <div className="empty">
      <span className="empty__icon" aria-hidden="true">📈</span>
      <span className="empty__title">{tr('No sales data yet')}</span>
      <span className="empty__hint">
        {tr('Record your first sale and your daily revenue trend appears here.')}
      </span>
    </div>
  ) : (
    <svg
      viewBox={`0 0 ${w} ${h + 18}`}
      style={{ width: '100%', display: 'block' }}
      role="img"
      aria-label={tr('Daily revenue for the last 14 days')}
    >
      {trend.map((d, i) => {
        const barH = Math.round((d.revenue / max) * h)
        const x = i * (barW + gap)
        return (
          <g key={d.day}>
            <rect
              x={x}
              y={h - barH}
              width={barW}
              height={barH}
              rx="4"
              fill={i === trend.length - 1 ? 'var(--orange)' : 'var(--orange-soft, #ffd766)'}
            >
              <title>{`${d.day}: ${formatMoney(d.revenue)} (${tr('{count} orders', { count: d.orders })})`}</title>
            </rect>
            {i % 2 === 0 && (
              <text x={x + barW / 2} y={h + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">
                {d.day.slice(5)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
