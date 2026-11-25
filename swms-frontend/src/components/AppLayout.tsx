import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import type { UserRole } from '../types/api'

interface NavItem {
  to: string
  label: string
  roles?: UserRole[]
}

const navItems: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/companies', label: 'Companies', roles: ['ADMIN'] },
  { to: '/districts', label: 'Districts & Agreements', roles: ['ADMIN'] },
  { to: '/representatives', label: 'Representatives', roles: ['ADMIN'] },
  { to: '/collectors', label: 'Collectors', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE'] },
  { to: '/fleet', label: 'Fleet Management', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'] },
  { to: '/gps', label: 'GPS Tracking', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'] },
  { to: '/households', label: 'Households', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'] },
  { to: '/bins', label: 'Smart Bins', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'] },
  { to: '/devices', label: 'IoT Device Readiness', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE'] },
  { to: '/collections', label: 'Collections', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'] },
  { to: '/scheduling', label: 'Scheduling', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'] },
  { to: '/notifications', label: 'Notifications' },
  { to: '/reports', label: 'Reports', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE'] },
  { to: '/support', label: 'Support & Service Requests' },
  { to: '/profile', label: 'Profile' },
]

export function AppLayout() {
  const { user, logout } = useAuth()

  return (
    <div className="min-h-screen bg-[#f3f6f8]">
      <aside className="fixed inset-y-0 left-0 z-20 flex w-64 flex-col border-r border-slate-200 bg-[#102a43] text-white">
        <div className="flex h-20 items-center border-b border-white/10 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500 text-lg font-bold">S</div>
          <div className="ml-3">
            <div className="font-semibold">SWMS</div>
            <div className="text-xs text-slate-300">Waste Operations</div>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {navItems
            .filter((item) => !item.roles || (user && item.roles.includes(user.role)))
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2.5 text-sm transition ${
                    isActive ? 'bg-emerald-500 text-white' : 'text-slate-200 hover:bg-white/10'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="mb-3 text-xs text-slate-300">{user?.fullName}</div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10"
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="ml-64 min-h-screen">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-8">
          <div className="text-sm font-medium text-slate-500">National Waste Operations</div>
          <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{user?.role}</div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
