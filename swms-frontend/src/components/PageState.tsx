import type { ApiError } from '../types/api'
import { AlertCircle, Inbox, LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <div role="status" className="app-card flex items-center justify-center gap-3 p-8 text-sm text-slate-500">
      <LoaderCircle size={18} className="animate-spin text-forest-700" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ error }: { error: ApiError | Error | null }) {
  if (!error) return null
  const message = 'message' in error ? error.message : 'An unexpected error occurred.'
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertCircle size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({
  label,
  title = 'Nothing here yet',
}: {
  label: string
  title?: string
}) {
  return (
    <div className="app-card flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">
        <Inbox size={20} aria-hidden="true" />
      </span>
      <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
      <p className="mt-1 max-w-md text-sm leading-6 text-slate-500">{label}</p>
    </div>
  )
}
