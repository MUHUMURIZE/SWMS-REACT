import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/api'

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { isAuthenticated, user } = useAuth()
  const location = useLocation()

  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/access-denied" replace />
  return <Outlet />
}
