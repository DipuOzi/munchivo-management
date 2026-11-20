import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar.jsx'
import Header from './Header.jsx'

export default function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  return (
    <div className="shell">
      <Sidebar open={sidebarOpen} />
      <div
        className={`sidebar-overlay${sidebarOpen ? ' is-open' : ''}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />
      <div className="main">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
