import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { useTranslation } from './lib/i18n.jsx'
import AppLayout from './components/layout/AppLayout.jsx'
import LoginPage from './pages/LoginPage.jsx'
import DashboardPage from './pages/DashboardPage.jsx'
import OverviewPage from './pages/OverviewPage.jsx'
import InventoryPage from './pages/InventoryPage.jsx'
import UsagePage from './pages/UsagePage.jsx'
import PurchasesPage from './pages/PurchasesPage.jsx'
import RecipesPage from './pages/RecipesPage.jsx'
import CalculatorPage from './pages/CalculatorPage.jsx'
import ProductsPage from './pages/ProductsPage.jsx'
import SalesPage from './pages/SalesPage.jsx'
import WastePage from './pages/WastePage.jsx'
import ExpiryPage from './pages/ExpiryPage.jsx'
import NotificationsPage from './pages/NotificationsPage.jsx'
import ExpensesPage from './pages/ExpensesPage.jsx'
import PartnersPage from './pages/PartnersPage.jsx'
import ReportsPage from './pages/ReportsPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--cream)',
        color: 'var(--muted)',
        fontFamily: 'var(--font-body)',
        fontSize: 14,
      }}
    >
      {t('Loading…')}
    </div>
  )
}

function Protected({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <LoadingScreen />
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="overview" element={<OverviewPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/usage" element={<UsagePage />} />
        <Route path="purchases" element={<PurchasesPage />} />
        <Route path="recipes" element={<RecipesPage />} />
        <Route path="calculator" element={<CalculatorPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="waste" element={<WastePage />} />
        <Route path="expiry" element={<ExpiryPage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="partners" element={<PartnersPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
