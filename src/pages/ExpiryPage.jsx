import { useCallback, useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { formatMoney, formatQty, fromBase } from '../shared/units.js'

/**
 * EXPIRY — purchase batches expiring within the configured window
 * (or already expired, still in stock).
 */
export default function ExpiryPage() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await api('/api/expiry'))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function wasteBatch(batch) {
    const days = Math.ceil(
      (new Date(`${batch.expiryDate}T23:59:59`) - new Date()) / (24 * 60 * 60 * 1000),
    )
    const expired = days < 0
    if (
      !confirm(
        `Record ALL remaining ${batch.name} (${formatQty(
          batch.quantityRemainingBase,
          batch.displayUnit,
        )}) as ${expired ? 'expired' : 'expiring'} waste? This deducts it from stock.`,
      )
    )
      return
    setBusy(true)
    try {
      await api('/api/waste', {
        method: 'POST',
        body: {
          ingredientId: batch.ingredientId,
          quantity: fromBase(batch.quantityRemainingBase, batch.displayUnit), // API expects display units
          reason: expired ? 'expired' : 'other',
          notes: `From Expiry page (batch expiry ${batch.expiryDate})`,
        },
      })
      load()
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div>
        <h1>Expiry</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Use ingredients before they expire — record waste for anything that
          has gone bad so costs stay accurate.
        </p>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      {loading ? (
        <div className="card">
          <div className="empty">Loading…</div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card__title">
              <h3>Ingredient batches expiring within 7 days</h3>
              {data.ingredientBatches.length > 0 && (
                <span className="badge badge--warning">{data.ingredientBatches.length} batches</span>
              )}
            </div>
            {data.ingredientBatches.length === 0 ? (
              <div className="empty">
                <span className="empty__icon" aria-hidden="true">✅</span>
                <span className="empty__title">Nothing expiring soon</span>
                <span className="empty__hint">
                  Purchase batches with expiry dates will appear here 7 days before expiry.
                </span>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Ingredient</th>
                      <th>Remaining</th>
                      <th>Expiry date</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ingredientBatches.map((b) => {
                      const expired = b.expiryDate < today
                      const daysLeft = Math.ceil(
                        (new Date(`${b.expiryDate}T23:59:59`) - new Date()) / (24 * 60 * 60 * 1000),
                      )
                      return (
                        <tr key={b.id}>
                          <td><strong>{b.name}</strong></td>
                          <td>{formatQty(b.quantityRemainingBase, b.displayUnit)}</td>
                          <td>{b.expiryDate}</td>
                          <td>
                            {expired ? (
                              <span className="badge badge--danger">Expired</span>
                            ) : (
                              <span className="badge badge--warning">{daysLeft} day{daysLeft === 1 ? '' : 's'} left</span>
                            )}
                          </td>
                          <td>
                            <button
                              type="button"
                              className="link-btn link-btn--danger"
                              disabled={busy}
                              onClick={() => wasteBatch(b)}
                            >
                              Record as waste
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
        </>
      )}
    </>
  )
}
