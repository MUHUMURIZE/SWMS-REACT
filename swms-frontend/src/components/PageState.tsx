import type { ApiError } from '../types/api'

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">{label}</div>
}

export function ErrorState({ error }: { error: ApiError | Error | null }) {
  if (!error) return null
  const message = 'message' in error ? error.message : 'An unexpected error occurred.'
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>
}

export function EmptyState({ label }: { label: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">{label}</div>
}
