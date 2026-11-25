import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ResourcePage } from './pages/ResourcePage'
import { NotificationsPage } from './pages/NotificationsPage'
import { SchedulingPage } from './pages/SchedulingPage'
import { ReportsPage } from './pages/ReportsPage'
import { ProfilePage } from './pages/ProfilePage'
import { DistrictsPage } from './pages/DistrictsPage'
import { FleetPage } from './pages/FleetPage'
import { IntegrationStatusPage } from './pages/IntegrationStatusPage'

function AccessDeniedPage() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-2 text-sm text-slate-500">Your account is not authorized to view this page.</p>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/access-denied" element={<AccessDeniedPage />} />
          <Route element={<ProtectedRoute roles={['ADMIN']} />}>
            <Route path="/districts" element={<DistrictsPage />} />
            <Route path="/companies" element={<ResourcePage kind="companies" />} />
            <Route path="/representatives" element={<ResourcePage kind="representatives" />} />
          </Route>
          <Route element={<ProtectedRoute roles={['ADMIN', 'COMPANY_REPRESENTATIVE']} />}>
            <Route path="/collectors" element={<ResourcePage kind="collectors" />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/devices" element={<IntegrationStatusPage kind="devices" />} />
          </Route>
          <Route element={<ProtectedRoute roles={['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR']} />}>
            <Route path="/fleet" element={<FleetPage />} />
            <Route path="/gps" element={<IntegrationStatusPage kind="gps" />} />
          </Route>
          <Route element={<ProtectedRoute roles={['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR']} />}>
            <Route path="/households" element={<ResourcePage kind="households" />} />
            <Route path="/bins" element={<ResourcePage kind="bins" />} />
            <Route path="/collections" element={<ResourcePage kind="collections" />} />
            <Route path="/scheduling" element={<SchedulingPage />} />
          </Route>
          <Route path="/support" element={<IntegrationStatusPage kind="support" />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
