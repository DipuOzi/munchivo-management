import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import logoUrl from '/images/munchivo-logo.svg'

const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/overview', label: 'Sales Overview', icon: 'cash' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/inventory', label: 'Inventory', icon: 'box' },
      { to: '/purchases', label: 'Purchases', icon: 'cart' },
      { to: '/recipes', label: 'Recipes', icon: 'book' },
      { to: '/calculator', label: 'Calculator', icon: 'calc' },
      { to: '/products', label: 'Products', icon: 'tag' },
      { to: '/sales', label: 'Sales', icon: 'cash' },
      { to: '/waste', label: 'Waste', icon: 'trash' },
      { to: '/expiry', label: 'Expiry', icon: 'clock' },
    ],
  },
  {
    label: 'Business',
    items: [
      { to: '/expenses', label: 'Expenses', icon: 'wallet' },
      { to: '/partners', label: 'Partners', icon: 'people' },
      { to: '/reports', label: 'Reports', icon: 'chart' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/notifications', label: 'Notifications', icon: 'bell' },
      { to: '/settings', label: 'Settings', icon: 'gear' },
    ],
  },
]

function NavIcon({ name }) {
  const icons = {
    grid: (
      <>
        <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
        <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
        <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
      </>
    ),
    box: (
      <>
        <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
        <path d="M3.3 8.2L12 13l8.7-4.8" />
        <path d="M12 22V13" />
      </>
    ),
    cart: (
      <>
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="18" cy="20" r="1.4" />
        <path d="M2.5 3.5h2l2.4 12h11.2l2.4-8.5H6" />
      </>
    ),
    truck: (
      <>
        <path d="M1.5 5.5h13v11h-13z" />
        <path d="M14.5 9h4l3 3.5v4h-7" />
        <circle cx="5.5" cy="18.5" r="1.8" />
        <circle cx="17.5" cy="18.5" r="1.8" />
      </>
    ),
    book: (
      <>
        <path d="M4 4.5A2.5 2.5 0 016.5 2H20v17.5H6.5A2.5 2.5 0 004 22V4.5z" />
        <path d="M4 17.5A2.5 2.5 0 016.5 15H20" />
      </>
    ),
    tag: (
      <>
        <path d="M20.6 12.3L12 21l-9-9 8.7-8.7L21 3.7l-.4 8.6z" />
        <circle cx="16" cy="8" r="1.2" />
      </>
    ),
    flame: (
      <path d="M12 22c4.4 0 7-2.8 7-6.6 0-3.4-2.2-6-4-8.4-.5 2-1.4 3-2.7 3.4.4-2.6-.8-6.2-3.6-8.4.3 3.3-1 5-2.5 6.9C4.8 10.6 5 12.7 5 15.4 5 19.2 7.6 22 12 22z" />
    ),
    cash: (
      <>
        <rect x="2" y="6" width="20" height="13" rx="2.5" />
        <circle cx="12" cy="12.5" r="3" />
      </>
    ),
    wallet: (
      <>
        <path d="M3 7.5A2.5 2.5 0 015.5 5H19v3" />
        <path d="M3 7.5V18a2 2 0 002 2h15a1 1 0 001-1v-9a1 1 0 00-1-1H5.5A2.5 2.5 0 013 7.5z" />
        <circle cx="16.5" cy="14.5" r="1.2" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3.2" />
        <path d="M2.5 20c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
        <path d="M16 5.4a3.2 3.2 0 010 5.2" />
        <path d="M18.5 14.9c1.7.8 2.7 2.5 3 5.1" />
      </>
    ),
    chart: (
      <>
        <path d="M3.5 3.5v17h17" />
        <path d="M8 15.5v-5" />
        <path d="M13 15.5V7" />
        <path d="M18 15.5v-8" />
      </>
    ),
    bell: (
      <>
        <path d="M6 9a6 6 0 0112 0c0 5 2 6 2 6H4s2-1 2-6z" />
        <path d="M10 20a2.2 2.2 0 004 0" />
      </>
    ),
    gear: (
      <>
        <circle cx="12" cy="12" r="3.2" />
        <path d="M19 12a7 7 0 00-.14-1.4l2.1-1.6-2-3.5-2.5 1a7 7 0 00-2.4-1.4L13.6 2h-3.2l-.5 2.7a7 7 0 00-2.4 1.4l-2.5-1-2 3.5 2.1 1.6a7 7 0 000 2.8l-2.1 1.6 2 3.5 2.5-1a7 7 0 002.4 1.4l.5 2.7h3.2l.5-2.7a7 7 0 002.4-1.4l2.5 1 2-3.5-2.1-1.6A7 7 0 0019 12z" />
      </>
    ),
    calc: (
      <>
        <rect x="4" y="2.5" width="16" height="19" rx="3" />
        <path d="M8 6.5h8" />
        <path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9.5 7V4.5h5V7" />
        <path d="M6.5 7l1 13h9l1-13" />
        <path d="M10.5 11v5.5M13.5 11v5.5" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3.5 2" />
      </>
    ),
  }

  return (
    <svg
      className="sidebar__link-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name] || icons.grid}
    </svg>
  )
}

export default function Sidebar({ open }) {
  const { user } = useAuth()

  return (
    <aside className={`sidebar${open ? ' is-open' : ''}`}>
      <div className="sidebar__brand">
        <img className="sidebar__logo" src={logoUrl} alt="Munchivo logo" />
        <div className="sidebar__brand-name">
          <strong>Munchivo</strong>
          <span>Management</span>
        </div>
      </div>

      <nav className="sidebar__nav" aria-label="Main navigation">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="sidebar__section">{section.label}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `sidebar__link${isActive ? ' is-active' : ''}`
                }
              >
                <NavIcon name={item.icon} />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar__footer">
        <div className="sidebar__user">
          <div className="sidebar__avatar">
            {user?.name?.charAt(0).toUpperCase() || 'M'}
          </div>
          <div className="sidebar__user-meta">
            <span className="sidebar__user-name">{user?.name || 'Partner'}</span>
            <span className="sidebar__user-role">Owner</span>
          </div>
        </div>
      </div>
    </aside>
  )
}
