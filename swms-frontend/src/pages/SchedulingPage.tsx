import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { collectionService } from '../services/resources'
import type { CollectionStatus } from '../types/api'

const kinds = ['upcoming', 'missed', 'overdue', 'rescheduled'] as const

export function SchedulingPage() {
  const [kind, setKind] = useState<(typeof kinds)[number]>('upcoming')
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['scheduling', kind],
    queryFn: () => collectionService.scheduling(kind, { limit: 50, offset: 0 }),
  })
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: CollectionStatus }) =>
      collectionService.updateStatus(id, status),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['scheduling', kind] })
      void queryClient.invalidateQueries({ queryKey: ['collections'] })
    },
  })

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Collection Scheduling</h1>
          <p className="mt-1 text-sm text-slate-500">Schedule views for your authorized organization or household scope.</p>
        </div>
        <select value={kind} onChange={(event) => setKind(event.target.value as (typeof kinds)[number])}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          {kinds.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
        </select>
      </div>
      {query.isLoading && <LoadingState />}
      {query.error && <ErrorState error={query.error} />}
      {query.data && query.data.length === 0 && <EmptyState label={`No ${kind} collections.`} />}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-4 py-3 text-left">ID</th><th className="px-4 py-3 text-left">Household</th><th className="px-4 py-3 text-left">Collector</th><th className="px-4 py-3 text-left">Scheduled</th><th className="px-4 py-3 text-left">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">{item.id}</td>
                  <td className="px-4 py-3">{item.householdId}</td>
                  <td className="px-4 py-3">{item.collectorId}</td>
                  <td className="px-4 py-3">{new Date(item.scheduledAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="mr-2 rounded-full bg-slate-100 px-2 py-1 text-xs">{item.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {statusMutation.error && <div className="mt-4"><ErrorState error={statusMutation.error} /></div>}
    </div>
  )
}
