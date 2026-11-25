import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CircleAlert, Info, ShieldCheck } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, StatusBadge } from '../components/ui'
import { notificationService } from '../services/resources'

type NotificationFilter = 'all' | 'unread'

function notificationIcon(category?: string) {
  const normalized = category?.toLowerCase() || ''
  if (normalized.includes('security') || normalized.includes('agreement')) return ShieldCheck
  if (normalized.includes('alert') || normalized.includes('urgent')) return CircleAlert
  if (normalized.includes('info')) return Info
  return Bell
}

export function NotificationsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<NotificationFilter>('all')
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationService.list({ limit: 50, offset: 0 }),
  })
  const markRead = useMutation({
    mutationFn: notificationService.markRead,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  })
  const filteredNotifications = useMemo(() => (
    (query.data || []).filter((item) => filter === 'all' || !item.readAt)
  ), [query.data, filter])
  const unreadCount = query.data?.filter((item) => !item.readAt).length || 0

  return (
    <div>
      <PageHeader
        eyebrow="Account updates"
        title="Notifications"
        description="Operational updates and account notices delivered to your SWMS account."
        icon={Bell}
        actions={<span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-forest-800">{unreadCount} unread</span>}
      />

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Your notification inbox</h2>
            <p className="mt-1 text-xs text-slate-500">{unreadCount} unread in the loaded results</p>
          </div>
          <div className="inline-flex w-fit rounded-lg bg-slate-100 p-1" role="group" aria-label="Filter notifications">
            {(['all', 'unread'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === value ? 'bg-white text-forest-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>

        {query.isLoading && <div className="p-4"><LoadingState label="Loading notifications…" /></div>}
        {query.error && <div className="p-4"><ErrorState error={query.error} /></div>}
        {query.data && filteredNotifications.length === 0 && (
          <div className="p-4">
            <EmptyState
              title={filter === 'unread' ? 'You are all caught up' : 'No notifications yet'}
              label={filter === 'unread' ? 'There are no unread notifications in the loaded results.' : 'Account and operational updates will appear here.'}
            />
          </div>
        )}
        {filteredNotifications.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {filteredNotifications.map((item) => {
              const Icon = notificationIcon(item.category)
              return (
                <li key={item.id} className={`flex gap-3 px-4 py-4 sm:gap-4 sm:px-5 ${item.readAt ? '' : 'bg-emerald-50/25'}`}>
                  <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    item.readAt ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-forest-800'
                  }`}>
                    <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className={`text-sm ${item.readAt ? 'font-medium text-slate-700' : 'font-semibold text-slate-950'}`}>{item.title}</h3>
                      {!item.readAt && <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-label="Unread" />}
                      {item.category && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold text-slate-600">{item.category}</span>}
                    </div>
                    <p className="mt-1.5 text-sm leading-6 text-slate-600">{item.message}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
                      <StatusBadge status={item.priority} />
                    </div>
                  </div>
                  {!item.readAt && (
                    <Button variant="quiet" icon={Check} aria-label={`Mark ${item.title} as read`}
                      disabled={markRead.isPending} onClick={() => markRead.mutate(item.id)}
                      className="shrink-0 self-center px-2 text-xs">
                      <span className="hidden sm:inline">Mark read</span>
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {markRead.error && <div className="border-t border-slate-100 p-4"><ErrorState error={markRead.error} /></div>}
      </Card>
    </div>
  )
}
