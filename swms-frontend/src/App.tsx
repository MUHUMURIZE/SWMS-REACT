import { lazy, Suspense } from 'react'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { ArrowLeft, ShieldX } from 'lucide-react'
import { AuthProvider } from './context/AuthContext'
import { AppLayout } from './components/AppLayout'
import { LoadingState } from './components/PageState'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Button, Card, PageHeader } from './components/ui'

const LoginPage = lazy(() => import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })))
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage').then((module) => ({ default: module.ForgotPasswordPage })))
const DashboardPage = lazy(() => import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const ResourcePage = lazy(() => import('./pages/ResourcePage').then((module) => ({ default: module.ResourcePage })))
const NotificationsPage = lazy(() => import('./pages/NotificationsPage').then((module) => ({ default: module.NotificationsPage })))
const SchedulingPage = lazy(() => import('./pages/SchedulingPage').then((module) => ({ default: module.SchedulingPage })))
const ReportsPage = lazy(() => import('./pages/ReportsPage').then((module) => ({ default: module.ReportsPage })))
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((module) => ({ default: module.ProfilePage })))
const DistrictsPage = lazy(() => import('./pages/DistrictsPage').then((module) => ({ default: module.DistrictsPage })))
const FleetPage = lazy(() => import('./pages/FleetPage').then((module) => ({ default: module.FleetPage })))
const IntegrationStatusPage = lazy(() => import('./pages/IntegrationStatusPage').then((module) => ({ default: module.IntegrationStatusPage })))

function AccessDeniedPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Access control" title="Access restricted" description="This account does not have permission to view the requested page." icon={ShieldX} />
      <Card className="flex flex-col items-start p-6 sm:p-8">
        <p className="max-w-lg text-sm leading-6 text-slate-600">
          SWMS uses role-based and district-scoped access. Return to your dashboard or contact an administrator if you believe this is incorrect.
        </p>
        <Link to="/dashboard" className="mt-5">
          <Button icon={ArrowLeft}>Return to dashboard</Button>
        </Link>
      </Card>
    </div>
  )
}

function AppRoutes() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl"><LoadingState label="Loading workspace…" /></div>}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
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
    </Suspense>
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
