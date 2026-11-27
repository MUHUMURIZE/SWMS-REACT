import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  Clock3,
  House,
  LayoutDashboard,
  MapPinned,
  Recycle,
  ShieldCheck,
  Trash2,
  Truck,
  UsersRound,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useAuth } from '../context/AuthContext'
import { CollectorRouteSection } from '../components/CollectorRouteSection'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Card, PageHeader, SectionHeading } from '../components/ui'
import { dashboardService, notificationService } from '../services/resources'
import type { UserRole } from '../types/api'

interface MetricDefinition {
  key: string
  label: string
  icon: typeof Recycle
  color: string
  description?: string
}

interface ChartRow {
  label: string
  value: number
  extra?: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const metricDefinitions: Record<UserRole, MetricDefinition[]> = {
  ADMIN: [
    { key: 'totalCompanies', label: 'Companies', icon: Building2, color: 'bg-sky-50 text-sky-700' },
    { key: 'totalDistricts', label: 'Registered districts', icon: MapPinned, color: 'bg-violet-50 text-violet-700' },
    { key: 'activeAgreements', label: 'Active agreements', icon: ShieldCheck, color: 'bg-emerald-50 text-emerald-700' },
    { key: 'totalCollections', label: 'Collections recorded', icon: Recycle, color: 'bg-teal-50 text-teal-700' },
    { key: 'pendingCollections', label: 'Pending collections', icon: Clock3, color: 'bg-amber-50 text-amber-700' },
    { key: 'overdueCollections', label: 'Overdue collections', icon: AlertTriangle, color: 'bg-rose-50 text-rose-700' },
  ],
  COMPANY_REPRESENTATIVE: [
    { key: 'totalCollectors', label: 'Authorized collectors', icon: UsersRound, color: 'bg-sky-50 text-sky-700' },
    { key: 'totalHouseholds', label: 'Authorized households', icon: House, color: 'bg-violet-50 text-violet-700' },
    { key: 'totalCollections', label: 'Collections', icon: Recycle, color: 'bg-teal-50 text-teal-700' },
    { key: 'completedCollections', label: 'Completed', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
    { key: 'overdueCollections', label: 'Overdue', icon: AlertTriangle, color: 'bg-rose-50 text-rose-700' },
    { key: 'fullBinMetrics', label: 'Bins requiring attention', icon: Trash2, color: 'bg-amber-50 text-amber-700' },
  ],
  COLLECTOR: [
    { key: 'todayCollections', label: "Today's collections", icon: CalendarDays, color: 'bg-sky-50 text-sky-700' },
    { key: 'myHouseholds', label: 'Authorized households', icon: House, color: 'bg-violet-50 text-violet-700' },
    { key: 'pendingCollections', label: 'Pending', icon: Clock3, color: 'bg-amber-50 text-amber-700' },
    { key: 'completedCollections', label: 'Completed', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
    { key: 'overdueCollections', label: 'Overdue', icon: AlertTriangle, color: 'bg-rose-50 text-rose-700' },
    { key: 'binsRequiringImmediatePickup', label: 'Bins needing pickup', icon: Trash2, color: 'bg-orange-50 text-orange-700' },
  ],
  HOUSEHOLD: [
    { key: 'totalCollections', label: 'Collections', icon: Recycle, color: 'bg-sky-50 text-sky-700' },
    { key: 'completedCollections', label: 'Completed', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
    { key: 'pendingCollections', label: 'Upcoming', icon: CalendarDays, color: 'bg-amber-50 text-amber-700' },
    { key: 'missedCollections', label: 'Missed', icon: AlertTriangle, color: 'bg-rose-50 text-rose-700' },
  ],
}

const roleTitles: Record<UserRole, string> = {
  ADMIN: 'National operations',
  COMPANY_REPRESENTATIVE: 'Company operations',
  COLLECTOR: 'Field operations',
  HOUSEHOLD: 'Household overview',
}

const quickLinks: Record<UserRole, Array<{ to: string; label: string; icon: typeof Recycle }>> = {
  ADMIN: [
    { to: '/districts', label: 'District agreements', icon: MapPinned },
    { to: '/companies', label: 'Companies', icon: Building2 },
    { to: '/fleet', label: 'Manage fleet', icon: Truck },
    { to: '/reports', label: 'View reports', icon: ChartNoAxesCombined },
  ],
  COMPANY_REPRESENTATIVE: [
    { to: '/collectors', label: 'Collectors', icon: UsersRound },
    { to: '/fleet', label: 'Manage fleet', icon: Truck },
    { to: '/scheduling', label: 'Scheduling', icon: CalendarDays },
    { to: '/reports', label: 'View reports', icon: ChartNoAxesCombined },
  ],
  COLLECTOR: [
    { to: '/households', label: 'My households', icon: House },
    { to: '/collections', label: 'Collections', icon: Recycle },
    { to: '/devices', label: 'Smart-bin monitoring', icon: Trash2 },
    { to: '/gps', label: 'GPS vehicle tracking', icon: MapPinned },
  ],
  HOUSEHOLD: [
    { to: '/bins', label: 'My bin', icon: Trash2 },
    { to: '/collections', label: 'My collections', icon: Recycle },
    { to: '/notifications', label: 'Notifications', icon: Bell },
    { to: '/profile', label: 'Account profile', icon: House },
  ],
}

function chartRows(
  value: unknown,
  labelKey: string,
  valueKey: string,
  extraKey?: string,
): ChartRow[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    if (!isRecord(item)) return []
    const record = item
    const label = record[labelKey]
    const amount = record[valueKey]
    const extra = extraKey ? record[extraKey] : undefined
    if (typeof label !== 'string' || typeof amount !== 'number') return []
    return [{
      label,
      value: amount,
      ...(typeof extra === 'number' ? { extra } : {}),
    }]
  })
}

function metricValue(data: Record<string, unknown>, key: string) {
  const value = data[key]
  return typeof value === 'number' ? value.toLocaleString() : '—'
}

function formatRoleName(role?: UserRole) {
  return role === 'ADMIN'
    ? 'national administrator'
    : role === 'COMPANY_REPRESENTATIVE'
      ? 'company representative'
      : role === 'COLLECTOR'
        ? 'field collector'
        : 'household member'
}

function AnalyticsPanel({
  title,
  description,
  data,
  valueLabel,
  extraKey,
}: {
  title: string
  description: string
  data: ChartRow[]
  valueLabel: string
  extraKey?: string
}) {
  return (
    <Card className="min-w-0 p-5">
      <SectionHeading title={title} description={description} />
      {data.length === 0 ? (
        <EmptyState label="No report data is available for this period." />
      ) : (
        <div className="h-[17rem] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid stroke="#e9efeb" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#77857c', fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#77857c', fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: '#f1f7f3' }}
                contentStyle={{ borderRadius: 12, borderColor: '#dfe9e2', fontSize: 12 }}
                formatter={(value) => [Number(value).toLocaleString(), valueLabel]}
              />
              {extraKey && <Legend wrapperStyle={{ fontSize: 11 }} />}
              <Bar dataKey="value" name={valueLabel} fill="#2e8055" radius={[5, 5, 0, 0]} maxBarSize={42} />
              {extraKey && <Bar dataKey="extra" name="Total records" fill="#83c59a" radius={[5, 5, 0, 0]} maxBarSize={42} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

function HouseholdTrend({ value }: { value: unknown }) {
  const data = Array.isArray(value)
    ? value.flatMap((item) => {
      if (!isRecord(item)) return []
      const record = item
      if (typeof record.fillLevel !== 'number' || typeof record.recordedAt !== 'string') return []
      return [{ date: new Date(record.recordedAt).toLocaleDateString(), fillLevel: record.fillLevel }]
    }).reverse()
    : []

  return (
    <Card className="p-5">
      <SectionHeading title="Bin fill history" description="Recorded fill levels for your household bin." />
      {data.length < 2 ? (
        <EmptyState label="More recorded readings are needed to show a trend." />
      ) : (
        <div className="h-[17rem]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, left: -18, bottom: 4 }}>
              <CartesianGrid stroke="#e9efeb" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#77857c', fontSize: 11 }} />
              <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#77857c', fontSize: 11 }} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: '#dfe9e2', fontSize: 12 }} />
              <Line type="monotone" dataKey="fillLevel" name="Fill level (%)" stroke="#2e8055" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

export function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role || 'HOUSEHOLD'
  const query = useQuery({
    queryKey: ['dashboard', role],
    queryFn: () => {
      if (role === 'ADMIN') return dashboardService.admin()
      if (role === 'COMPANY_REPRESENTATIVE') return dashboardService.company()
      if (role === 'COLLECTOR') return dashboardService.collector()
      return dashboardService.household()
    },
  })
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 6, offset: 0 }),
  })

  const metrics = query.data ? metricDefinitions[role].filter((item) => item.key in query.data) : []
  const topDistricts = chartRows(query.data?.topDistricts, 'district', 'count')
  const topCompanies = chartRows(query.data?.topCompanies, 'company', 'completed', 'total')
  const collectorPerformance = chartRows(query.data?.collectorPerformance, 'collector', 'completedCollections', 'totalCollections')
  const notificationsError = notifications.error

  return (
    <div>
      <PageHeader
        eyebrow={roleTitles[role]}
        title={`Good day${user?.fullName ? `, ${user.fullName.split(' ')[0]}` : ''}`}
        description={`Here is the latest operational summary available to you as a ${formatRoleName(role)}.`}
        icon={LayoutDashboard}
      />

      {query.isLoading && <LoadingState label="Loading your dashboard…" />}
      {query.error && <div className="mb-5"><ErrorState error={query.error} /></div>}

      {query.data && (
        <>
          <section aria-label="Operational metrics" className="mb-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            {metrics.map(({ key, label, icon: Icon, color }) => (
              <Card key={key} className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold leading-5 text-slate-500">{label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{metricValue(query.data, key)}</p>
                  </div>
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${color}`}>
                    <Icon size={19} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                </div>
              </Card>
            ))}
          </section>

          <div className="mb-7 grid gap-5 xl:grid-cols-2">
            {role === 'ADMIN' && (
              <>
                <AnalyticsPanel
                  title="District activity"
                  description="Households grouped by district in the authorized dataset."
                  data={topDistricts}
                  valueLabel="Households"
                />
                <AnalyticsPanel
                  title="Company collection performance"
                  description="Completed and total collections by company."
                  data={topCompanies}
                  valueLabel="Completed collections"
                  extraKey="total"
                />
              </>
            )}
            {role === 'COMPANY_REPRESENTATIVE' && (
              <AnalyticsPanel
                title="Collector performance"
                description="Completed and total collection records in your authorized company scope."
                data={collectorPerformance}
                valueLabel="Completed collections"
                extraKey="total"
              />
            )}
            {role === 'HOUSEHOLD' && <HouseholdTrend value={query.data.binFillTrend} />}
            {role === 'COLLECTOR' && <CollectorRouteSection />}
            <Card className="p-5">
              <SectionHeading
                title="Quick access"
                description="Common actions available to your role."
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {quickLinks[role].map(({ to, label, icon: Icon }) => (
                  <Link key={to} to={to} className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3.5 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/60">
                    <span className="flex items-center gap-3 text-sm font-medium text-slate-700 group-hover:text-forest-900">
                      <Icon size={17} className="text-forest-700" aria-hidden="true" />
                      {label}
                    </span>
                    <ArrowUpRight size={15} className="text-slate-400 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-forest-700" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </Card>
          </div>

          <Card className="p-5">
            <SectionHeading
              title="Recent notifications"
              description="Latest updates available to your account."
              action={
                <Link to="/notifications" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-700 hover:text-forest-900">
                  View all <ArrowUpRight size={15} aria-hidden="true" />
                </Link>
              }
            />
            {notifications.isLoading && <LoadingState label="Loading notifications…" />}
            {notificationsError && <ErrorState error={notificationsError} />}
            {notifications.data?.length === 0 && <EmptyState label="New account updates will appear here." />}
            {notifications.data && notifications.data.length > 0 && (
              <ul className="divide-y divide-slate-100">
                {notifications.data.map((item) => (
                  <li key={item.id} className="flex items-start gap-3 py-3 first:pt-1 last:pb-0">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-forest-700'}`}>
                      <Bell size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800">{item.title}</span>
                        {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-label="Unread" />}
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-slate-500">{item.message}</p>
                    </div>
                    <time className="shrink-0 text-xs text-slate-400" dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
