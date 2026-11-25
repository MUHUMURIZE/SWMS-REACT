import { useMemo, useState } from 'react'
import { CalendarDays, Clock3, Filter, RotateCcw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, StatusBadge } from '../components/ui'
import { collectionService } from '../services/resources'

const kinds = ['upcoming', 'missed', 'overdue', 'rescheduled'] as const
type ScheduleKind = (typeof kinds)[number]

function dayKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function formattedDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function SchedulingPage() {
  const [kind, setKind] = useState<ScheduleKind>('upcoming')
  const [dateFilter, setDateFilter] = useState('')
  const query = useQuery({
    queryKey: ['scheduling', kind],
    queryFn: () => collectionService.scheduling(kind, { limit: 50, offset: 0 }),
  })
  const filteredCollections = useMemo(() => (
    (query.data || []).filter((item) => !dateFilter || dayKey(item.scheduledAt) === dateFilter)
  ), [query.data, dateFilter])

  return (
    <div>
      <PageHeader
        eyebrow="Field operations"
        title="Collection schedule"
        description="Review upcoming and exception schedules within your authorized scope."
        icon={CalendarDays}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-forest-700">
            <CalendarDays size={19} aria-hidden="true" />
          </span>
          <div>
            <div className="text-xs font-medium text-slate-500">Records in this view</div>
            <div className="mt-0.5 text-xl font-semibold text-slate-900">{query.data?.length ?? '—'}</div>
          </div>
        </Card>
        <Card className="flex items-center gap-3 p-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <Clock3 size={19} aria-hidden="true" />
          </span>
          <div>
            <div className="text-xs font-medium text-slate-500">Schedule category</div>
            <div className="mt-0.5 text-sm font-semibold capitalize text-slate-900">{kind}</div>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-100 p-4 sm:p-5">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Schedule category">
            {kinds.map((item) => (
              <button
                key={item}
                type="button"
                role="tab"
                aria-selected={kind === item}
                onClick={() => setKind(item)}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
                  kind === item
                    ? 'bg-forest-800 text-white'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold capitalize text-slate-800">{kind} collections</h2>
              <p className="mt-1 text-xs text-slate-500">Date filtering applies to the records loaded for this schedule category.</p>
            </div>
            <label className="block w-full sm:max-w-xs">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                <Filter size={14} aria-hidden="true" /> Scheduled date
              </span>
              <input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} className="app-input h-10" />
            </label>
          </div>
        </div>

        {query.isLoading && <div className="p-4"><LoadingState label="Loading schedule…" /></div>}
        {query.error && <div className="p-4"><ErrorState error={query.error} /></div>}
        {query.data && filteredCollections.length === 0 && (
          <div className="p-4">
            <EmptyState
              title={dateFilter ? 'No collections for this date' : `No ${kind} collections`}
              label={dateFilter ? 'Choose another date or clear the date filter.' : 'Collections will appear here when available in your authorized scope.'}
            />
            {dateFilter && (
              <div className="mt-3 flex justify-center">
                <Button variant="secondary" icon={RotateCcw} onClick={() => setDateFilter('')}>Clear date</Button>
              </div>
            )}
          </div>
        )}
        {filteredCollections.length > 0 && (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[42rem]">
              <thead>
                <tr><th>Collection</th><th>Household</th><th>Collector</th><th>Scheduled for</th><th>Status</th></tr>
              </thead>
              <tbody>
                {filteredCollections.map((item) => (
                  <tr key={item.id}>
                    <td className="font-semibold text-slate-900">#{item.id}</td>
                    <td>Household {item.householdId}</td>
                    <td>Collector {item.collectorId}</td>
                    <td>
                      <time dateTime={item.scheduledAt}>{formattedDate(item.scheduledAt)}</time>
                    </td>
                    <td><StatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
