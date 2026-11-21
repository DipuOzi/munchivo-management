import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useTranslation } from '../lib/i18n.jsx'
import { formatMoney } from '../shared/units.js'

/**
 * SALES OVERVIEW — daily / monthly / yearly / lifetime sales performance.
 * Everything is computed live from recorded sales, so nothing has to be
 * reset manually: the "Today" column rolls over automatically at midnight,
 * while the database keeps the full history for the other columns.
 */
const COLS = ['daily', 'monthly', 'yearly', 'lifetime']
const COL_LABEL = {
  daily: 'Today',
  monthly: 'This month',
  yearly: 'This year',
  lifetime: 'All time',
}

function formatPeriod(key, raw, locale) {
  if (!raw || key === 'lifetime') return null
  if (key === 'yearly') return raw
  const parts = raw.split('-').map(Number)
  if (key === 'monthly') {
    return new Date(parts[0], parts[1] - 1, 1).toLocaleDateString(locale, {
      month: 'long',
      year: 'numeric',
    })
  }
  return new Date(parts[0], parts[1] - 1, parts[2]).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function profitClass(value) {
  return value < 0 ? 'value-negative' : 'value-profit'
}

export default function OverviewPage() {
  const { t, locale } = useTranslation()
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
          <h1>{t('Sales Overview')}</h1>
        </div>
        <div className="alert alert--error">{error}</div>
      </>
    )
  }

  if (loading || !data) {
    return (
      <>
        <div>
          <h1>{t('Sales Overview')}</h1>
        </div>
        <div className="card">
          <div className="empty">{t('Loading…')}</div>
        </div>
      </>
    )
  }

  const { periods, todayItems } = data
  const today = periods.daily

  return (
    <>
      <div>
        <h1>{t('Sales Overview')}</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          {t(
            'Revenue, cost and profit at a glance. Today updates automatically and resets at midnight — every record stays saved for the month, year and all-time totals.',
          )}
        </p>
      </div>

      <div className="card">
        <div className="card__title">
          <h3>{t('Sales performance')}</h3>
        </div>
        <div className="table-wrap">
          <table className="table overview-table">
            <thead>
              <tr>
                <th>{t('Metric')}</th>
                {COLS.map((key) => (
                  <th key={key}>
                    {t(COL_LABEL[key])}
                    <span className="th-period">
                      {formatPeriod(key, periods[key].period, locale) ??
                        t('Since the beginning')}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="row-label">{t('Revenue')}</td>
                {COLS.map((key) => (
                  <td key={key} className="money">{formatMoney(periods[key].revenuePoisha)}</td>
                ))}
              </tr>
              <tr>
                <td className="row-label">{t('Cost of goods')}</td>
                {COLS.map((key) => (
                  <td key={key} className="money">{formatMoney(periods[key].cogsPoisha)}</td>
                ))}
              </tr>
              <tr className="row-profit">
                <td className="row-label">{t('Profit')}</td>
                {COLS.map((key) => (
                  <td
                    key={key}
                    className={`money ${profitClass(periods[key].profitPoisha)}`}
                  >
                    {formatMoney(periods[key].profitPoisha)}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="row-label">{t('Orders')}</td>
                {COLS.map((key) => (
                  <td key={key}>{periods[key].orders}</td>
                ))}
              </tr>
              <tr>
                <td className="row-label">{t('Items sold')}</td>
                {COLS.map((key) => (
                  <td key={key}>{periods[key].items}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="overview-note">
          <span className="overview-note__dot" aria-hidden="true" />
          {t('Live totals from recorded sales · cancelled sales are excluded')}
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card__title">
          <h3>{t('Sold today')}</h3>
          <span className="badge badge--neutral">
            {t(today.orders === 1 ? '{count} order' : '{count} orders', {
              count: today.orders,
            })}
          </span>
        </div>
        {todayItems.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🧾</span>
            <span className="empty__title">{t('Nothing sold today yet')}</span>
            <span className="empty__hint">
              {t("Record a sale and today's items, cost and profit appear here.")}
            </span>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table overview-table">
              <thead>
                <tr>
                  <th>{t('Product')}</th>
                  <th>{t('Qty sold')}</th>
                  <th>{t('Revenue')}</th>
                  <th>{t('Cost')}</th>
                  <th>{t('Profit')}</th>
                </tr>
              </thead>
              <tbody>
                {todayItems.map((it) => (
                  <tr key={it.productName}>
                    <td className="row-label">{it.productName}</td>
                    <td>{it.quantity}</td>
                    <td className="money">{formatMoney(it.revenuePoisha)}</td>
                    <td className="money">{formatMoney(it.cogsPoisha)}</td>
                    <td className={`money ${profitClass(it.profitPoisha)}`}>
                      {formatMoney(it.profitPoisha)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('Total')}</td>
                  <td>{today.items}</td>
                  <td className="money">{formatMoney(today.revenuePoisha)}</td>
                  <td className="money">{formatMoney(today.cogsPoisha)}</td>
                  <td className={`money ${profitClass(today.profitPoisha)}`}>
                    {formatMoney(today.profitPoisha)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </>
  )
}