import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api.js'

/**
 * Notification bell with live unread count. Polls every 30s and
 * registers the service worker so this device can receive push.
 */
export default function NotificationBell() {
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()

  const load = useCallback(async () => {
    try {
      const data = await api('/api/notifications')
      setUnread(data.unreadCount)
    } catch {
      // silent — bell is non-critical
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 30000)
    return () => clearInterval(timer)
  }, [load])

  // Register service worker once (needed for browser push later).
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }
  }, [])

  return (
    <button
      type="button"
      className="header__icon-btn"
      aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      onClick={() => navigate('/notifications')}
      style={{ position: 'relative' }}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" />
        <path d="M10 20a2.2 2.2 0 004 0" />
      </svg>
      {unread > 0 && (
        <span
          className="header__badge"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            background: 'var(--orange-deep)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'grid',
            placeItems: 'center',
            padding: '0 4px',
          }}
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )
}
