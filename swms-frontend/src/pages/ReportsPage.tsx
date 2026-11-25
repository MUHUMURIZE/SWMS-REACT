import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartNoAxesCombined, FileSpreadsheet, FileText, Filter } from 'lucide-react'
import { ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, SectionHeading } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { exportService, reportService } from '../services/resources'

interface ReportDatum {
  label: string
  value: number
}

function reportNumber(data: Record<string, unknown> | undefined, key: string) {
  const value = data?.[key]
  return typeof value === 'number' ? value : null
}

function reportChart(data: Record<string, unknown> | undefined, keys: Array<[string, string]>): ReportDatum[] {
  if (!data) return []
  return keys.flatMap(([key, label]) => {
    const value = reportNumber(data, key)
    return value === null ? [] : [{ label, value }]
  })
}

function MetricTile({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-1.5 text-xl font-semibold tracking-tight text-slate-900">
        {value === null ? '—' : value.toLocaleString()}
      </div>
    </div>
  )
}

function ReportChart({ title, data }: { title: string; data: ReportDatum[] }) {
  return (
    <Card className="min-w-0 p-5">
      <SectionHeading title={title} />
      {data.length === 0 ? (
        <p className="rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">No metrics are available.</p>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 12, left: -20, bottom: 4 }}>
              <CartesianGrid stroke="#e9efeb" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#77857c', fontSize: 11 }} />
              <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#77857c', fontSize: 11 }} />
              <Tooltip
                cursor={{ fill: '#f1f7f3' }}
                contentStyle={{ borderRadius: 12, borderColor: '#dfe9e2', fontSize: 12 }}
                formatter={(value) => [Number(value).toLocaleString(), 'Records']}
              />
              <Bar dataKey="value" fill="#2e8055" radius={[5, 5, 0, 0]} maxBarSize={42} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

export function ReportsPage() {
  const { user } = useAuth()
  const isAdmin = user?.role === 'ADMIN'
  const [districtInput, setDistrictInput] = useState('')
  const [sectorInput, setSectorInput] = useState('')
  const [district, setDistrict] = useState('')
  const [sector, setSector] = useState('')
  const [downloadMessage, setDownloadMessage] = useState('')

  const districtQuery = useQuery({
    queryKey: ['report-district', district],
    queryFn: () => reportService.district(district || undefined),
    enabled: isAdmin,
  })
  const sectorQuery = useQuery({
    queryKey: ['report-sector', sector],
    queryFn: () => reportService.sector(sector || undefined),
    enabled: isAdmin,
  })
  const companyQuery = useQuery({
    queryKey: ['report-company'],
    queryFn: () => reportService.company(),
  })
  const exportMutation = useMutation({
    mutationFn: (format: 'csv' | 'xlsx' | 'pdf') => exportService.download('collections', format),
    onMutate: () => setDownloadMessage(''),
    onSuccess: (_result, format) => setDownloadMessage(`${format.toUpperCase()} download started.`),
  })

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setDistrict(districtInput.trim())
    setSector(sectorInput.trim())
  }

  const companyBins = reportChart(companyQuery.data, [
    ['emptyBins', 'Empty'],
    ['lowBins', 'Low'],
    ['mediumBins', 'Medium'],
    ['highBins', 'High'],
    ['fullBins', 'Full'],
  ])
  const companyCollections = reportChart(companyQuery.data, [
    ['collectionsCompleted', 'Completed'],
    ['collectionsPending', 'Pending'],
    ['collectionsInProgress', 'In progress'],
  ])

  return (
    <div>
      <PageHeader
        eyebrow="Operational insights"
        title="Reports & exports"
        description="Review authorized operational summaries and download collection records."
        icon={ChartNoAxesCombined}
      />

      {companyQuery.isLoading && <LoadingState label="Loading company report…" />}
      {companyQuery.error && <div className="mb-5"><ErrorState error={companyQuery.error} /></div>}

      {companyQuery.data && (
        <Card className="mb-6 p-5 sm:p-6">
          <SectionHeading
            title={isAdmin ? 'Company-wide summary' : 'Your company summary'}
            description="Current aggregate metrics returned by the authorized company report."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <MetricTile label="Households" value={reportNumber(companyQuery.data, 'totalHouseholds')} />
            <MetricTile label="Bins" value={reportNumber(companyQuery.data, 'totalBins')} />
            <MetricTile label="Completed collections" value={reportNumber(companyQuery.data, 'collectionsCompleted')} />
            <MetricTile label="Pending collections" value={reportNumber(companyQuery.data, 'collectionsPending')} />
            <MetricTile label="In progress" value={reportNumber(companyQuery.data, 'collectionsInProgress')} />
          </div>
        </Card>
      )}

      {isAdmin && (
        <Card className="mb-6 p-5 sm:p-6">
          <SectionHeading
            title="National filters"
            description="District and sector filters use the available aggregate API. Date-range filtering is not supported by these endpoints."
          />
          <form onSubmit={applyFilters} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] lg:items-end">
            <label className="text-sm font-semibold text-slate-700">
              District
              <input value={districtInput} onChange={(event) => setDistrictInput(event.target.value)}
                placeholder="All districts" className="app-input mt-2" />
            </label>
            <label className="text-sm font-semibold text-slate-700">
              Sector
              <input value={sectorInput} onChange={(event) => setSectorInput(event.target.value)}
                placeholder="All sectors" className="app-input mt-2" />
            </label>
            <Button type="submit" icon={Filter}>Apply filters</Button>
          </form>
        </Card>
      )}

      {isAdmin && (
        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <Card className="p-5">
            <SectionHeading title={district ? `District: ${district}` : 'District report'} description="Household, bin, and collection totals." />
            {districtQuery.isLoading && <LoadingState label="Loading district report…" />}
            {districtQuery.error && <ErrorState error={districtQuery.error} />}
            {districtQuery.data && (
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricTile label="Households" value={reportNumber(districtQuery.data, 'totalHouseholds')} />
                <MetricTile label="Bins" value={reportNumber(districtQuery.data, 'totalBins')} />
                <MetricTile label="Completed collections" value={reportNumber(districtQuery.data, 'collectionsCompleted')} />
                <MetricTile label="Pending collections" value={reportNumber(districtQuery.data, 'collectionsPending')} />
              </div>
            )}
          </Card>
          <Card className="p-5">
            <SectionHeading title={sector ? `Sector: ${sector}` : 'Sector report'} description="Household, bin, and collection totals." />
            {sectorQuery.isLoading && <LoadingState label="Loading sector report…" />}
            {sectorQuery.error && <ErrorState error={sectorQuery.error} />}
            {sectorQuery.data && (
              <div className="grid gap-3 sm:grid-cols-2">
                <MetricTile label="Households" value={reportNumber(sectorQuery.data, 'totalHouseholds')} />
                <MetricTile label="Bins" value={reportNumber(sectorQuery.data, 'totalBins')} />
                <MetricTile label="Completed collections" value={reportNumber(sectorQuery.data, 'collectionsCompleted')} />
                <MetricTile label="Pending collections" value={reportNumber(sectorQuery.data, 'collectionsPending')} />
              </div>
            )}
          </Card>
        </div>
      )}

      {companyQuery.data && (
        <div className="mb-6 grid gap-5 xl:grid-cols-2">
          <ReportChart title="Bin status distribution" data={companyBins} />
          <ReportChart title="Collection progress" data={companyCollections} />
        </div>
      )}

      <Card className="p-5 sm:p-6">
        <SectionHeading
          title="Collection exports"
          description="Download collection records in a supported file format."
          action={<FileSpreadsheet size={19} className="text-forest-700" aria-hidden="true" />}
        />
        <div className="flex flex-wrap gap-2">
          {([
            ['csv', 'CSV', FileText],
            ['xlsx', 'Excel', FileSpreadsheet],
            ['pdf', 'PDF', FileText],
          ] as const).map(([format, label, Icon]) => (
            <Button key={format} variant="secondary" icon={Icon}
              disabled={exportMutation.isPending}
              onClick={() => exportMutation.mutate(format)}>
              {exportMutation.isPending && exportMutation.variables === format ? 'Preparing…' : `Download ${label}`}
            </Button>
          ))}
        </div>
        {exportMutation.error && <div className="mt-4"><ErrorState error={exportMutation.error} /></div>}
        {downloadMessage && <p role="status" className="mt-4 text-sm font-medium text-emerald-800">{downloadMessage}</p>}
      </Card>
    </div>
  )
}
