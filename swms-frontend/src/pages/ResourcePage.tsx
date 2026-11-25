import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import {
  binService,
  collectorService,
  collectionService,
  companyService,
  householdService,
  representativeService,
} from '../services/resources'

type ResourceKind = 'companies' | 'representatives' | 'collectors' | 'households' | 'bins' | 'collections'

const titles: Record<ResourceKind, string> = {
  companies: 'Companies',
  representatives: 'Company Representatives',
  collectors: 'Collectors',
  households: 'Households',
  bins: 'Smart Bins',
  collections: 'Waste Collections',
}

const allowedColumns: Record<ResourceKind, string[]> = {
  companies: ['id', 'name', 'district', 'sector', 'cell', 'village'],
  representatives: ['id', 'fullName', 'email', 'companyId', 'district', 'sector'],
  collectors: ['id', 'fullName', 'email', 'representativeId', 'district', 'sector'],
  households: ['id', 'fullName', 'email', 'address', 'district', 'sector', 'collectorId'],
  bins: ['id', 'binCode', 'householdId', 'capacity', 'fillLevel', 'status'],
  collections: ['id', 'householdId', 'collectorId', 'scheduledAt', 'status', 'notes'],
}

type ResourceRow = Record<string, unknown>

async function loadResource(kind: ResourceKind, limit: number, offset: number): Promise<ResourceRow[]> {
  const pagination = { limit, offset }
  let rows: unknown[]
  if (kind === 'companies') rows = await companyService.list(pagination)
  else if (kind === 'representatives') rows = await representativeService.list(pagination)
  else if (kind === 'collectors') rows = await collectorService.list(pagination)
  else if (kind === 'households') rows = await householdService.list(pagination)
  else if (kind === 'bins') rows = await binService.list(pagination)
  else rows = await collectionService.list(pagination)
  return rows as ResourceRow[]
}

function formatValue(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return new Date(value).toLocaleString()
  }
  return String(value)
}

export function ResourcePage({ kind }: { kind: ResourceKind }) {
  const [limit] = useState(50)
  const [offset, setOffset] = useState(0)
  const query = useQuery({
    queryKey: [kind, { limit, offset }],
    queryFn: () => loadResource(kind, limit, offset),
  })
  const columns = allowedColumns[kind]

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{titles[kind]}</h1>
          <p className="mt-1 text-sm text-slate-500">Records visible within your authorized scope.</p>
          {kind === 'bins' && (
            <p className="mt-2 text-xs text-amber-800">
              Fill levels shown here are stored bin records; live sensor telemetry is not connected.
            </p>
          )}
        </div>
        <div className="text-xs text-slate-500">Page {Math.floor(offset / limit) + 1}</div>
      </div>

      {query.isLoading && <LoadingState />}
      {query.error && <ErrorState error={query.error} />}
      {query.data && query.data.length === 0 && <EmptyState label={`No ${titles[kind].toLowerCase()} found.`} />}
      {query.data && query.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>{columns.map((column) => <th key={column} className="px-4 py-3 font-medium">{column.replace(/([A-Z])/g, ' $1')}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {query.data.map((row, index) => (
                <tr key={(row as { id?: number }).id ?? index} className="hover:bg-slate-50">
                  {columns.map((column) => (
                    <td key={column} className="max-w-xs px-4 py-3 text-slate-700">{formatValue((row as Record<string, unknown>)[column])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {query.data && (
        <div className="mt-4 flex justify-end gap-2">
          <button disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - limit))}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40">Previous</button>
          <button disabled={query.data.length < limit} onClick={() => setOffset((value) => value + limit)}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40">Next</button>
        </div>
      )}
    </div>
  )
}
