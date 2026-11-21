import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney, poishaToTaka } from '../shared/units.js'
import {
  formatDate,
  lastNDays,
  monthRange,
  todayISO,
  yearRange,
} from '../shared/dates.js'

const PRESETS = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'last-30', label: 'Last 30 days' },
  { id: 'last-90', label: 'Last 90 days' },
  { id: 'this-year', label: 'This year' },
]

const PAYMENT_LABEL = {
  cash: 'Cash',
  bkash: 'bKash',
  nagad: 'Nagad',
  bank: 'Bank',
  other: 'Other',
}

function rangeForPreset(id) {
  if (id === 'last-month') return monthRange(-1)
  if (id === 'last-30') return lastNDays(30)
  if (id === 'last-90') return lastNDays(90)
  if (id === 'this-year') return yearRange()
  return monthRange(0)
}

function pct(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0
}

export default function ReportsPage() {
  const { t, locale } = useTranslation()
  const [range, setRange] = useState(monthRange())
  const [activePreset, setActivePreset] = useState('this-month')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({
        start: range.start,
        end: range.end,
      })
      setData(await api(`/api/reports?${params.toString()}`))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => {
    load()
  }, [load])

  function choosePreset(id) {
    setActivePreset(id)
    setRange(rangeForPreset(id))
  }

  function setDate(field, value) {
    setActivePreset('custom')
    setRange((r) => ({ ...r, [field]: value }))
  }

  function exportCsv() {
    if (!data) return
    const s = data.summary
    const rows = [
      [t('Munchivo Management — financial report')],
      [t('Business'), data.business.businessName],
      [t('Period'), `${data.range.start} — ${data.range.end}`],
      [],
      [t('Profit & loss'), t('Amount (BDT)')],
      [t('Gross sales'), poishaToTaka(s.grossSalesPoisha)],
      [t('Discounts'), poishaToTaka(s.discountsPoisha)],
      [t('Refunds'), poishaToTaka(s.refundsPoisha)],
      [t('Net revenue'), poishaToTaka(s.revenuePoisha)],
      [t('Cost of goods sold (ingredients)'), poishaToTaka(s.cogsPoisha)],
      [t('Gross profit'), poishaToTaka(s.grossProfitPoisha)],
      [t('Operating expenses'), poishaToTaka(s.expensesPoisha)],
      [t('Waste'), poishaToTaka(s.wastePoisha)],
      [t('Net profit'), poishaToTaka(s.netProfitPoisha)],
      [],
      [t('Cash & balances')],
      [t('Purchases (stock received)'), poishaToTaka(s.purchasesPoisha)],
      [t('Unpaid expenses'), poishaToTaka(s.unpaidExpensesPoisha)],
      [t('Supplier dues'), poishaToTaka(s.supplierDuesPoisha)],
      [t('Inventory value'), poishaToTaka(s.inventoryValuePoisha)],
      [],
      [t('Daily summary'), t('Revenue'), t('COGS'), t('Expenses'), t('Waste'), t('Profit'), t('Orders')],
      ...data.daily.map((d) => [
        d.day,
        poishaToTaka(d.revenuePoisha),
        poishaToTaka(d.cogsPoisha),
        poishaToTaka(d.expensesPoisha),
        poishaToTaka(d.wastePoisha),
        poishaToTaka(d.profitPoisha),
        d.orders,
      ]),
      [],
      [t('Top products'), t('Units'), t('Revenue'), t('COGS')],
      ...data.topProducts.map((p) => [
        p.name,
        p.units,
        poishaToTaka(p.revenuePoisha),
        poishaToTaka(p.cogsPoisha),
      ]),
      [],
      [t('Expense breakdown'), t('Amount'), t('Count')],
      ...data.expenseBreakdown.map((e) => [
        e.category,
        poishaToTaka(e.amountPoisha),
        e.count,
      ]),
      [],
      [t('Partner'), t('Ownership %'), t('Capital'), t('Drawings'), t('Profit share'), t('Net')],
      ...data.partners.map((p) => [
        p.name,
        (p.ownershipBasisPoints / 100).toFixed(2),
        poishaToTaka(p.capitalPoisha),
        poishaToTaka(p.drawingsPoisha),
        poishaToTaka(p.profitSharePoisha),
        poishaToTaka(p.netPoisha),
      ]),
    ]

    const escape = (value) =>
      `"${String(value ?? '').replace(/"/g, '""')}"`
    const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `munchivo-report-${data.range.start}-to-${data.range.end}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const s = data?.summary
  const cards = s
    ? [
        {
          label: 'Net revenue',
          value: formatMoney(s.revenuePoisha),
          hint: t('{count} orders · avg {amount}', {
            count: s.orders,
            amount: formatMoney(s.averageOrderPoisha),
          }),
          icon: '৳',
          cls: 'revenue',
        },
        {
          label: 'Gross profit',
          value: formatMoney(s.grossProfitPoisha),
          hint: t('{pct}% gross margin', { pct: s.grossMarginPct }),
          icon: '↗',
          cls: 'profit',
        },
        {
          label: 'Operating expenses',
          value: formatMoney(s.expensesPoisha),
          hint: t(s.expenseCount === 1 ? '{count} record' : '{count} records', {
            count: s.expenseCount,
          }),
          icon: '▦',
          cls: 'orders',
        },
        {
          label: 'Waste',
          value: formatMoney(s.wastePoisha),
          hint: t(s.wasteCount === 1 ? '{count} record' : '{count} records', {
            count: s.wasteCount,
          }),
          icon: '🗑',
          cls: 'inventory',
        },
        {
          label: 'Net profit',
          value: formatMoney(s.netProfitPoisha),
          hint: t('{pct}% net margin', { pct: s.marginPct }),
          icon: '★',
          cls: s.netProfitPoisha >= 0 ? 'profit' : 'inventory',
        },
        {
          label: 'Inventory value',
          value: formatMoney(s.inventoryValuePoisha),
          hint: t(
            s.inventoryItemCount === 1
              ? '{count} active ingredient'
              : '{count} active ingredients',
            { count: s.inventoryItemCount },
          ),
          icon: '📦',
          cls: 'orders',
        },
      ]
    : []

  return (
    <>
      <div>
        <h1>{t('Reports')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(
            'Profit & loss, daily trend, payment mix, expenses, product performance and partner balances for any date range.',
          )}
        </p>
      </div>

      <div className="toolbar report-toolbar">
        <div className="preset-row">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn btn--sm ${
                activePreset === p.id ? 'btn--dark' : 'btn--ghost'
              }`}
              onClick={() => choosePreset(p.id)}
            >
              {t(p.label)}
            </button>
          ))}
        </div>
        <div className="date-range">
          <label>
            <span className="field__label">{t('From')}</span>
            <input
              type="date"
              className="field__control"
              value={range.start}
              max={range.end || todayISO()}
              onChange={(e) => setDate('start', e.target.value)}
            />
          </label>
          <label>
            <span className="field__label">{t('To')}</span>
            <input
              type="date"
              className="field__control"
              value={range.end}
              min={range.start}
              onChange={(e) => setDate('end', e.target.value)}
            />
          </label>
        </div>
        <div className="inline-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={exportCsv} disabled={!data}>
            {t('Export CSV')}
          </button>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()} disabled={!data}>
            {t('Print')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {loading || !data ? (
        <div className="card">
          <div className="empty">{t('Loading report…')}</div>
        </div>
      ) : (
        <>
          <div className="report-period">
            <span>
              <strong>{data.business.businessName}</strong> ·{' '}
              {formatDate(data.range.start, locale)} —{' '}
              {formatDate(data.range.end, locale)}
            </span>
            {s.netProfitPoisha < 0 && (
              <span className="badge badge--danger">{t('Loss in this period')}</span>
            )}
          </div>

          <div className="stat-grid">
            {cards.map((c) => (
              <div className="card stat-card" key={c.label}>
                <div className="stat-card__top">
                  <span className="stat-card__label">{t(c.label)}</span>
                  <span className={`stat-card__icon stat-card__icon--${c.cls}`} aria-hidden="true">
                    {c.icon}
                  </span>
                </div>
                <span className={`stat-card__value money${c.label === 'Net profit' && s.netProfitPoisha < 0 ? ' stock-low' : ''}`}>
                  {c.value}
                </span>
                <span className="stat-card__hint">{c.hint}</span>
              </div>
            ))}
          </div>

          <div className="report-grid">
            <div className="card">
              <div className="card__title">
                <h3>{t('Profit & loss')}</h3>
                <span className="badge badge--neutral">
                  {t('{count} days', { count: data.range.days })}
                </span>
              </div>
              <div className="pl-statement">
                <div className="pl-row">
                  <span>{t('Gross sales')}</span>
                  <strong className="money">{formatMoney(s.grossSalesPoisha)}</strong>
                </div>
                <div className="pl-row pl-row--sub">
                  <span>{t('Less discounts')}</span>
                  <strong className="money">−{formatMoney(s.discountsPoisha)}</strong>
                </div>
                <div className="pl-row pl-row--sub">
                  <span>{t('Less refunds')}</span>
                  <strong className="money">−{formatMoney(s.refundsPoisha)}</strong>
                </div>
                <div className="pl-row pl-row--total">
                  <span>{t('Net revenue')}</span>
                  <strong className="money">{formatMoney(s.revenuePoisha)}</strong>
                </div>
                <div className="pl-row pl-row--sub">
                  <span>{t('Cost of goods sold (ingredients)')}</span>
                  <strong className="money">−{formatMoney(s.cogsPoisha)}</strong>
                </div>
                <div className="pl-row pl-row--total">
                  <span>{t('Gross profit')}</span>
                  <strong className="money">{formatMoney(s.grossProfitPoisha)}</strong>
                </div>
                <div className="pl-row pl-row--sub">
                  <span>{t('Operating expenses')}</span>
                  <strong className="money">−{formatMoney(s.expensesPoisha)}</strong>
                </div>
                <div className="pl-row pl-row--sub">
                  <span>{t('Waste')}</span>
                  <strong className="money">−{formatMoney(s.wastePoisha)}</strong>
                </div>
                <div className={`pl-row pl-row--grand${s.netProfitPoisha < 0 ? ' stock-low' : ''}`}>
                  <span>{t('Net profit')}</span>
                  <strong className="money">{formatMoney(s.netProfitPoisha)}</strong>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card__title">
                <h3>{t('Balances')}</h3>
              </div>
              <div className="pl-statement">
                <div className="pl-row">
                  <span>{t('Purchases (stock received)')}</span>
                  <strong className="money">{formatMoney(s.purchasesPoisha)}</strong>
                </div>
                <div className="pl-row">
                  <span>{t('Unpaid expenses')}</span>
                  <strong className={`money${s.unpaidExpensesPoisha > 0 ? ' stock-low' : ''}`}>
                    {formatMoney(s.unpaidExpensesPoisha)}
                  </strong>
                </div>
                <div className="pl-row">
                  <span>{t('Supplier dues')}</span>
                  <strong className={`money${s.supplierDuesPoisha > 0 ? ' stock-low' : ''}`}>
                    {formatMoney(s.supplierDuesPoisha)}
                  </strong>
                </div>
                <div className="pl-row">
                  <span>{t('Inventory value')}</span>
                  <strong className="money">{formatMoney(s.inventoryValuePoisha)}</strong>
                </div>
                <div className="pl-row pl-row--total">
                  <span>{t('Average order value')}</span>
                  <strong className="money">{formatMoney(s.averageOrderPoisha)}</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__title">
              <h3>{t('Daily trend')}</h3>
              <div className="chart-legend">
                <span><i className="dot dot--revenue" /> {t('Revenue')}</span>
                <span><i className="dot dot--expense" /> {t('Expenses + waste')}</span>
              </div>
            </div>
            <ReportTrend daily={data.daily} />
          </div>

          <div className="report-grid">
            <div className="card card--flush">
              <div className="card__title" style={{ padding: '20px 20px 0' }}>
                <h3>{t('Payment mix')}</h3>
              </div>
              {data.paymentMethods.length === 0 ? (
                <div className="empty">
                  <span className="empty__icon" aria-hidden="true">💳</span>
                  <span className="empty__title">{t('No sales in this range')}</span>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('Method')}</th>
                        <th>{t('Orders')}</th>
                        <th>{t('Revenue')}</th>
                        <th>{t('Share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.paymentMethods.map((p) => (
                        <tr key={p.method}>
                          <td>{t(PAYMENT_LABEL[p.method] || p.method)}</td>
                          <td>{p.orders}</td>
                          <td className="money">{formatMoney(p.revenuePoisha)}</td>
                          <td>{pct(p.revenuePoisha, s.revenuePoisha)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card card--flush">
              <div className="card__title" style={{ padding: '20px 20px 0' }}>
                <h3>{t('Expense breakdown')}</h3>
              </div>
              {data.expenseBreakdown.length === 0 ? (
                <div className="empty">
                  <span className="empty__icon" aria-hidden="true">🧾</span>
                  <span className="empty__title">{t('No expenses in this range')}</span>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('Category')}</th>
                        <th>{t('Count')}</th>
                        <th>{t('Amount')}</th>
                        <th>{t('Share')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.expenseBreakdown.map((e) => (
                        <tr key={e.categoryId || e.category}>
                          <td>{e.category}</td>
                          <td>{e.count}</td>
                          <td className="money">{formatMoney(e.amountPoisha)}</td>
                          <td>{pct(e.amountPoisha, s.expensesPoisha)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          <div className="report-grid">
            <div className="card card--flush">
              <div className="card__title" style={{ padding: '20px 20px 0' }}>
                <h3>{t('Top products')}</h3>
              </div>
              {data.topProducts.length === 0 ? (
                <div className="empty">
                  <span className="empty__icon" aria-hidden="true">🏆</span>
                  <span className="empty__title">{t('No product sales in this range')}</span>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('Product')}</th>
                        <th>{t('Units')}</th>
                        <th>{t('Revenue')}</th>
                        <th>{t('Gross profit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topProducts.map((p) => (
                        <tr key={p.productId || p.name}>
                          <td><strong>{p.name}</strong></td>
                          <td>{p.units}</td>
                          <td className="money">{formatMoney(p.revenuePoisha)}</td>
                          <td className="money">
                            {formatMoney(p.revenuePoisha - p.cogsPoisha)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="card card--flush">
              <div className="card__title" style={{ padding: '20px 20px 0' }}>
                <h3>{t('Partner balances')}</h3>
              </div>
              {data.partners.length === 0 ? (
                <div className="empty">
                  <span className="empty__icon" aria-hidden="true">🤝</span>
                  <span className="empty__title">{t('No partners added yet')}</span>
                </div>
              ) : (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>{t('Partner')}</th>
                        <th>{t('Ownership')}</th>
                        <th>{t('Capital')}</th>
                        <th>{t('Net balance')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.partners.map((p) => (
                        <tr key={p.id}>
                          <td><strong>{p.name}</strong></td>
                          <td>{p.ownershipBasisPoints / 100}%</td>
                          <td className="money">{formatMoney(p.capitalPoisha)}</td>
                          <td className={`money${p.netPoisha < 0 ? ' stock-low' : ''}`}>
                            {formatMoney(p.netPoisha)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
function ReportTrend({ daily }) {
  const { t } = useTranslation()
  const hasMoney = daily.some(
    (d) => d.revenuePoisha > 0 || d.expensesPoisha > 0 || d.wastePoisha > 0,
  )
  if (!hasMoney) {
    return (
      <div className="empty">
        <span className="empty__icon" aria-hidden="true">📈</span>
        <span className="empty__title">{t('No activity in this range')}</span>
        <span className="empty__hint">
          {t('Record sales and expenses to see the daily trend.')}
        </span>
      </div>
    )
  }

  const max = Math.max(
    ...daily.map((d) => Math.max(d.revenuePoisha, d.expensesPoisha + d.wastePoisha)),
    1,
  )
  const groupW = 18
  const barW = 7
  const gap = 2
  const w = Math.max(620, daily.length * groupW)
  const h = 160

  return (
    <div className="chart-scroll">
      <svg
        viewBox={`0 0 ${w} ${h + 24}`}
        style={{ width: w, minWidth: '100%', display: 'block' }}
        role="img"
        aria-label={t('Daily revenue versus expenses')}
      >
        {daily.map((d, i) => {
          const x = i * groupW
          const revH = Math.round((d.revenuePoisha / max) * h)
          const expH = Math.round(
            ((d.expensesPoisha + d.wastePoisha) / max) * h,
          )
          return (
            <g key={d.day}>
              <rect
                x={x}
                y={h - revH}
                width={barW}
                height={revH}
                rx="2"
                fill={d.profitPoisha < 0 ? '#c99b00' : 'var(--orange)'}
              >
                <title>{`${d.day} · ${t('revenue {amount}', { amount: formatMoney(d.revenuePoisha) })}`}</title>
              </rect>
              <rect
                x={x + barW + gap}
                y={h - expH}
                width={barW}
                height={expH}
                rx="2"
                fill="var(--orange-deep)"
              >
                <title>{`${d.day} · ${t('expenses + waste {amount}', {
                  amount: formatMoney(d.expensesPoisha + d.wastePoisha),
                })}`}</title>
              </rect>
              {daily.length <= 40 && i % 2 === 0 && (
                <text
                  x={x + barW}
                  y={h + 16}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--muted)"
                >
                  {d.day.slice(5)}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
