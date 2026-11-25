import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { dashboardService } from '../services/resources'
import { ErrorState, LoadingState } from '../components/PageState'

function formatLabel(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (value) => value.toUpperCase())
}

function formatValue(value: unknown) {
  if (value == null) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function DashboardPage() {
  const { user } = useAuth()
  const query = useQuery({
    queryKey: ['dashboard', user?.role],
    queryFn: () => {
      if (user?.role === 'ADMIN') return dashboardService.admin()
      if (user?.role === 'COMPANY_REPRESENTATIVE') return dashboardService.company()
      if (user?.role === 'COLLECTOR') return dashboardService.collector()
      return dashboardService.household()
    },
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Operations Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Live summary for your authorized scope.</p>
      </div>
      {query.isLoading && <LoadingState label="Loading dashboard..." />}
      {query.error && <ErrorState error={query.error} />}
      {query.data && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Object.entries(query.data).map(([key, value]) => (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{formatLabel(key)}</div>
              <div className="mt-3 text-2xl font-semibold text-slate-900">{formatValue(value)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
