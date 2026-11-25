import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorState, LoadingState } from '../components/PageState'
import { exportService, reportService } from '../services/resources'
import { useAuth } from '../context/AuthContext'

export function ReportsPage() {
  const { user } = useAuth()
  const [district, setDistrict] = useState('')
  const [sector, setSector] = useState('')
  const districtQuery = useQuery({
    queryKey: ['report-district', district],
    queryFn: () => reportService.district(district || undefined),
    enabled: user?.role === 'ADMIN',
  })
  const sectorQuery = useQuery({
    queryKey: ['report-sector', sector],
    queryFn: () => reportService.sector(sector || undefined),
    enabled: user?.role === 'ADMIN',
  })
  const companyQuery = useQuery({
    queryKey: ['report-company'],
    queryFn: () => reportService.company(),
  })

  const runExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    void exportService.download('collections', format)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Reports and Exports</h1>
        <p className="mt-1 text-sm text-slate-500">Authorized reports and collection export files.</p>
      </div>
      {companyQuery.isLoading && <LoadingState label="Loading company report..." />}
      {companyQuery.error && <ErrorState error={companyQuery.error} />}
      {companyQuery.data && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="font-semibold text-slate-900">Company report</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(companyQuery.data).map(([key, value]) => (
              <div key={key} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xs text-slate-500">{key}</div>
                <div className="mt-1 font-semibold text-slate-800">{typeof value === 'object' ? JSON.stringify(value) : String(value)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {user?.role === 'ADMIN' && (
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex gap-2">
              <input value={district} onChange={(event) => setDistrict(event.target.value)} placeholder="District filter"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            {districtQuery.isLoading ? <LoadingState /> : <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(districtQuery.data, null, 2)}</pre>}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-3 flex gap-2">
              <input value={sector} onChange={(event) => setSector(event.target.value)} placeholder="Sector filter"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            {sectorQuery.isLoading ? <LoadingState /> : <pre className="max-h-64 overflow-auto text-xs">{JSON.stringify(sectorQuery.data, null, 2)}</pre>}
          </div>
        </div>
      )}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Collection exports</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
            <button key={format} onClick={() => runExport(format)}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Download {format.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
