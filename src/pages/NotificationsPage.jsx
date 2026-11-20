import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

/**
 * NOTIFICATIONS — the notification center.
 * - In-app list with read/unread state (per user).
 * - "Enable browser push" registers this device for Web Push so LOW
 *   STOCK alerts arrive even when the app is closed.
 */
export default function NotificationsPage() {
  const [items, setItems] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [pushState, setPushState] = useState('unknown') // unknown | unsupported | denied | off | on | working
  const [testResult, setTestResult] = useState('')
  const swReg = useRef(null)

  const load = useCallback(async () => {
    try {
      const data = await api('/api/notifications')
      setItems(data.notifications)
      setUnread(data.unreadCount)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Detect push capability on mount
  useEffect(() => {
    async function check() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushState('unsupported')
        return
      }
      if (Notification.permission === 'denied') {
        setPushState('denied')
        return
      }
      swReg.current = await navigator.serviceWorker.getRegistration()
      if (swReg.current) {
        const sub = await swReg.current.pushManager.getSubscription()
        setPushState(sub ? 'on' : 'off')
      } else {
        setPushState('off')
      }
    }
    check()
  }, [])

  async function enablePush() {
    setError('')
    setTestResult('')
    try {
      setPushState('working')
      const reg = swReg.current || (await navigator.serviceWorker.register('/sw.js'))
      swReg.current = reg

      const { publicKey } = await api('/api/push/vapid-public')

      let sub = await reg.pushManager.getSubscription()
      const vapidConverted = urlBase64ToUint8Array(publicKey)
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidConverted,
        })
      }

      const json = sub.toJSON()
      await api('/api/push/subscribe', {
        method: 'POST',
        body: { endpoint: sub.endpoint, keys: json.keys },
      })
      setPushState('on')
      setTestResult('This device will now receive low-stock alerts.')
    } catch (err) {
      setPushState(Notification.permission === 'denied' ? 'denied' : 'off')
      setError(`Could not enable push: ${err.message}`)
    }
  }

  async function sendTest() {
    setTestResult('')
    try {
      const r = await api('/api/push/test', { method: 'POST', body: {} })
      setTestResult(
        r.sent > 0
          ? 'Test sent — check your notification area (works even when the app tab is in the background).'
          : 'No subscribed devices found. Enable browser push first.',
      )
    } catch (err) {
      setTestResult(err.message)
    }
  }

  async function markAll() {
    await api('/api/notifications', { method: 'POST', body: { action: 'read-all' } })
    load()
  }

  async function markOne(id) {
    await api('/api/notifications', { method: 'POST', body: { action: 'read', id } })
    load()
  }

  return (
    <>
      <div>
        <h1>Notifications</h1>
        <p style={{ color: 'var(--muted)', marginTop: 6, fontSize: 14 }}>
          Automatic low-stock and expiry alerts for the whole team.
        </p>
      </div>

      <div className="card">
        <div className="card__title">
          <h3>Browser push</h3>
          {pushState === 'on' && <span className="badge badge--success">Enabled on this device</span>}
          {pushState === 'off' && <span className="badge badge--neutral">Off</span>}
          {pushState === 'denied' && <span className="badge badge--danger">Blocked in browser settings</span>}
          {pushState === 'unsupported' && <span className="badge badge--neutral">Not supported by this browser</span>}
        </div>
        <p style={{ fontSize: 13.5, color: 'var(--muted)', margin: '0 0 12px' }}>
          Low-stock alerts are created automatically when ingredient stock hits
          its threshold. Enable push to receive them on this device even when
          the management app is closed.
        </p>
        <div className="inline-actions">
          {pushState === 'off' && (
            <button type="button" className="btn btn--primary btn--sm" onClick={enablePush}>
              Enable browser push
            </button>
          )}
          {pushState === 'on' && (
            <button type="button" className="btn btn--dark btn--sm" onClick={sendTest}>
              Send test notification
            </button>
          )}
          {pushState === 'denied' && (
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>
              Push was blocked — reset notification permissions in your browser
              settings (click the lock icon in the address bar).
            </span>
          )}
        </div>
        {testResult && <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 0 }}>{testResult}</p>}
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        <div className="card__title" style={{ padding: '16px 20px 0' }}>
          <h3>All notifications</h3>
          {unread > 0 && (
            <button type="button" className="link-btn" onClick={markAll}>
              Mark all read ({unread})
            </button>
          )}
        </div>
        {loading ? (
          <div className="empty">Loading…</div>
        ) : items.length === 0 ? (
          <div className="empty">
            <span className="empty__icon" aria-hidden="true">🔔</span>
            <span className="empty__title">No notifications yet</span>
            <span className="empty__hint">
              Low-stock alerts appear automatically as ingredients run out.
            </span>
          </div>
        ) : (
          <ul className="notif-list">
            {items.map((n) => (
              <li key={n.id} className={`notif-item${n.readAt ? '' : ' notif-item--unread'}`}>
                <div className="notif-item__main">
                  <div className="notif-item__title">
                    {n.severity === 'critical' && <span className="badge badge--danger">Critical</span>}
                    {n.severity === 'warning' && <span className="badge badge--warning">Warning</span>}
                    {n.severity === 'info' && <span className="badge badge--neutral">Info</span>}
                    <strong>{n.title}</strong>
                    {!n.readAt && <span className="notif-item__dot" aria-label="unread" />}
                  </div>
                  <p className="notif-item__body">{n.body}</p>
                  <span className="notif-item__time">{new Date(n.createdAt).toLocaleString()}</span>
                </div>
                {!n.readAt && (
                  <button type="button" className="link-btn" onClick={() => markOne(n.id)}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

/* VAPID keys arrive base64url — the browser needs a Uint8Array. */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}
