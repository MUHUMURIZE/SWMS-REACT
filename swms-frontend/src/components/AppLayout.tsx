import { useMemo, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronDown,
  CircleHelp,
  House,
  LayoutDashboard,
  LogOut,
  Map,
  MapPinned,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Recycle,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { notificationService } from '../services/resources'
import type { UserRole } from '../types/api'

interface NavItem {
  to: string
  label: string
  roles?: UserRole[]
  icon: typeof LayoutDashboard
}

interface NavGroup {
  label: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    label: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'Organization',
    items: [
      { to: '/companies', label: 'Companies', roles: ['ADMIN'], icon: Building2 },
      { to: '/districts', label: 'Districts & Agreements', roles: ['ADMIN'], icon: MapPinned },
      { to: '/representatives', label: 'Representatives', roles: ['ADMIN'], icon: BriefcaseBusiness },
      { to: '/collectors', label: 'Collectors', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE'], icon: UsersRound },
      { to: '/fleet', label: 'Fleet Management', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'], icon: Truck },
    ],
  },
  {
    label: 'Field operations',
    items: [
      { to: '/households', label: 'Households', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'], icon: House },
      { to: '/bins', label: 'Smart Bins', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'], icon: Trash2 },
      { to: '/devices', label: 'Smart Bin Monitoring', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE'], icon: ShieldCheck },
      { to: '/collections', label: 'Collections', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'], icon: Recycle },
      { to: '/scheduling', label: 'Scheduling', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'], icon: CalendarDays },
      { to: '/gps', label: 'GPS Tracking', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE', 'COLLECTOR'], icon: Map },
    ],
  },
  {
    label: 'Insights',
    items: [
      { to: '/reports', label: 'Reports', roles: ['ADMIN', 'COMPANY_REPRESENTATIVE'], icon: ChartNoAxesCombined },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/notifications', label: 'Notifications', icon: Bell },
      { to: '/support', label: 'Support status', icon: CircleHelp },
      { to: '/profile', label: 'Profile & security', icon: UserRound },
    ],
  },
]

const roleLabels: Record<UserRole, string> = {
  ADMIN: 'National Administrator',
  COMPANY_REPRESENTATIVE: 'Company Representative',
  COLLECTOR: 'Waste Collector',
  HOUSEHOLD: 'Household Account',
}

export function AppLayout() {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const notificationQuery = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 50, offset: 0 }),
    enabled: Boolean(user),
    staleTime: 30_000,
  })

  const activePage = useMemo(
    () => navGroups.flatMap((group) => group.items).find((item) => item.to === location.pathname),
    [location.pathname],
  )
  const unreadCount = notificationQuery.data?.filter((item) => !item.readAt).length || 0

  return (
    <div className="min-h-screen bg-[#f4f7f5] text-slate-900">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation backdrop"
          className="fixed inset-0 z-30 bg-slate-950/45 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-white/10 bg-forest-950 text-white shadow-2xl shadow-forest-950/15 transition-[width,transform] duration-200 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[5.25rem]' : 'lg:w-[17rem]'}`}
        aria-label="Main navigation"
      >
        <div className={`flex h-[4.75rem] shrink-0 items-center border-b border-white/10 ${collapsed ? 'px-4' : 'px-5'}`}>
          <Link to="/dashboard" aria-label="SWMS dashboard" className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-leaf-500 text-white shadow-lg shadow-black/15">
              <Recycle size={23} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <span className={collapsed ? 'lg:hidden' : ''}>
              <span className="block text-[0.95rem] font-bold tracking-wide">SWMS</span>
              <span className="mt-0.5 block text-[0.65rem] font-medium tracking-wide text-emerald-100/65">WASTE OPERATIONS</span>
            </span>
          </Link>
          <button
            type="button"
            aria-label="Close navigation"
            className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10 lg:hidden"
            onClick={() => setMobileOpen(false)}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
          {navGroups.map((group) => {
            const items = group.items.filter((item) => !item.roles || (user && item.roles.includes(user.role)))
            if (items.length === 0) return null

            return (
              <div key={group.label}>
                <div className={`mb-2 px-3 text-[0.62rem] font-bold uppercase tracking-[0.15em] text-emerald-100/45 ${collapsed ? 'lg:sr-only' : ''}`}>
                  {group.label}
                </div>
                <div className="space-y-1">
                  {items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      key={to}
                      to={to}
                      title={collapsed ? label : undefined}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        `group flex min-h-10 items-center gap-3 rounded-lg px-3 text-[0.84rem] font-medium transition-colors ${
                          collapsed ? 'lg:justify-center lg:px-0' : ''
                        } ${
                          isActive
                            ? 'bg-white/12 text-white shadow-sm ring-1 ring-inset ring-white/10'
                            : 'text-emerald-50/70 hover:bg-white/[0.07] hover:text-white'
                        }`
                      }
                    >
                      <Icon size={18} strokeWidth={1.8} className="shrink-0" aria-hidden="true" />
                      <span className={collapsed ? 'lg:sr-only' : ''}>{label}</span>
                      {to === '/notifications' && unreadCount > 0 && (
                        <span className={`ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-amber-300 px-1.5 py-0.5 text-[0.65rem] font-bold text-forest-950 ${collapsed ? 'lg:hidden' : ''}`}>
                          {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>

        <div className={`shrink-0 border-t border-white/10 p-3 ${collapsed ? 'lg:px-2' : ''}`}>
          <div className={`mb-3 flex items-center gap-3 rounded-xl bg-white/[0.06] p-3 ${collapsed ? 'lg:justify-center lg:px-1' : ''}`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-forest-900">
              {user?.fullName?.trim().charAt(0).toUpperCase() || 'U'}
            </span>
            <span className={`min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
              <span className="block truncate text-xs font-semibold">{user?.fullName}</span>
              <span className="mt-0.5 block truncate text-[0.65rem] text-emerald-100/55">
                {user ? roleLabels[user.role] : ''}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            title={collapsed ? 'Sign out' : undefined}
            className={`flex min-h-10 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-emerald-50/70 transition hover:bg-white/[0.07] hover:text-white ${
              collapsed ? 'lg:justify-center lg:px-0' : ''
            }`}
          >
            <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
            <span className={collapsed ? 'lg:sr-only' : ''}>Sign out</span>
          </button>
        </div>
      </aside>

      <div className={`min-h-screen transition-[margin] duration-200 ${collapsed ? 'lg:ml-[5.25rem]' : 'lg:ml-[17rem]'}`}>
        <header className="sticky top-0 z-20 flex h-[4.75rem] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Open navigation"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={19} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!collapsed}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 lg:inline-flex"
              onClick={() => setCollapsed((value) => !value)}
            >
              {collapsed
                ? <PanelLeftOpen size={18} aria-hidden="true" />
                : <PanelLeftClose size={18} aria-hidden="true" />}
            </button>
            <div className="min-w-0">
              <nav aria-label="Breadcrumb">
                <ol className="flex items-center gap-1.5 truncate text-xs font-medium text-slate-500">
                  <li><Link to="/dashboard" className="hover:text-forest-800">Workspace</Link></li>
                  <li aria-hidden="true">/</li>
                  <li aria-current="page" className="truncate text-slate-700">{activePage?.label || 'Workspace'}</li>
                </ol>
              </nav>
              <div className="mt-0.5 truncate text-sm font-semibold text-slate-800">
                {user ? roleLabels[user.role] : 'Operations workspace'}
              </div>
            </div>
          </div>
          <div className="ml-3 flex shrink-0 items-center gap-2 sm:gap-3">
            <Link
              to="/notifications"
              aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-forest-800"
            >
              <Bell size={18} strokeWidth={1.9} aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
              )}
            </Link>
            <details className="group relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-transparent py-1.5 pl-1.5 pr-2 transition hover:border-slate-200 hover:bg-slate-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-forest-900">
                  {user?.fullName?.trim().charAt(0).toUpperCase() || 'U'}
                </span>
                <span className="hidden max-w-36 text-left sm:block">
                  <span className="block truncate text-xs font-semibold text-slate-800">{user?.fullName}</span>
                  <span className="block truncate text-[0.65rem] text-slate-500">{user?.email}</span>
                </span>
                <ChevronDown size={15} className="hidden text-slate-500 sm:block" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-xl shadow-slate-900/10">
                <Link to="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                  <UserRound size={16} aria-hidden="true" /> Profile & security
                </Link>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-700 hover:bg-red-50"
                >
                  <LogOut size={16} aria-hidden="true" /> Sign out
                </button>
              </div>
            </details>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-9">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
