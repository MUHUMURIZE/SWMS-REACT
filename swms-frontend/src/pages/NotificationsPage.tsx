import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { notificationService } from '../services/resources'

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 50, offset: 0 }),
  })
  const markRead = useMutation({
    mutationFn: notificationService.markRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Notifications</h1>
        <p className="mt-1 text-sm text-slate-500">Updates assigned to your account.</p>
      </div>
      {query.isLoading && <LoadingState />}
      {query.error && <ErrorState error={query.error} />}
      {query.data && query.data.length === 0 && <EmptyState label="No notifications." />}
      {query.data && query.data.length > 0 && (
        <div className="space-y-3">
          {query.data.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-900">{item.title}</div>
                  <div className="mt-1 text-sm text-slate-600">{item.message}</div>
                  <div className="mt-2 text-xs text-slate-400">{new Date(item.createdAt).toLocaleString()}</div>
                </div>
                {!item.readAt && (
                  <button disabled={markRead.isPending} onClick={() => markRead.mutate(item.id)}
                    className="shrink-0 rounded-lg border border-emerald-300 px-3 py-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50">
                    Mark read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
