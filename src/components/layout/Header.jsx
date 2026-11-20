import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import NotificationBell from './NotificationBell.jsx'

export default function Header({ onMenuClick }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <header className="header">
      <button
        type="button"
        className="header__icon-btn header__menu-btn"
        onClick={onMenuClick}
        aria-label="Open menu"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      </button>

      <div className="header__actions">
        <NotificationBell />
        <button
          type="button"
          className="btn btn--dark btn--sm"
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </header>
  )
}
