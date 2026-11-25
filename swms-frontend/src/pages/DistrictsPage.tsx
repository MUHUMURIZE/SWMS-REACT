import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2, MapPinned, Plus, Search, ShieldCheck } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, SectionHeading, StatusBadge } from '../components/ui'
import { companyService, districtService } from '../services/resources'

const pageSize = 100

function today() {
  const date = new Date()
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localDate.toISOString().slice(0, 10)
}

export function DistrictsPage() {
  const client = useQueryClient()
  const [districtName, setDistrictName] = useState('')
  const [districtId, setDistrictId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [startsOn, setStartsOn] = useState(today)
  const [endsOn, setEndsOn] = useState('')
  const [search, setSearch] = useState('')
  const districts = useQuery({
    queryKey: ['districts'],
    queryFn: () => districtService.list({ limit: pageSize, offset: 0 }),
  })
  const agreements = useQuery({
    queryKey: ['district-agreements'],
    queryFn: () => districtService.agreements({ limit: pageSize, offset: 0 }),
  })
  const companies = useQuery({
    queryKey: ['companies', { limit: pageSize, offset: 0 }],
    queryFn: () => companyService.list({ limit: pageSize, offset: 0 }),
  })
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['districts'] }),
      client.invalidateQueries({ queryKey: ['district-agreements'] }),
      client.invalidateQueries({ queryKey: ['dashboard'] }),
    ])
  }
  const createDistrict = useMutation({
    mutationFn: (name: string) => districtService.create(name),
    onSuccess: async () => {
      setDistrictName('')
      await invalidate()
    },
  })
  const createAgreement = useMutation({
    mutationFn: () => districtService.createAgreement(Number(districtId), {
      companyId: Number(companyId),
      startsOn,
      ...(endsOn ? { endsOn } : {}),
    }),
    onSuccess: async () => {
      setCompanyId('')
      setEndsOn('')
      await invalidate()
    },
  })
  const transition = useMutation({
    mutationFn: ({ agreementId, status }: { agreementId: number; status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED' }) =>
      districtService.transitionAgreement(agreementId, { status }),
    onSuccess: invalidate,
  })

  const normalizedSearch = search.trim().toLowerCase()
  const filteredDistricts = useMemo(() => (districts.data || []).filter((district) => (
    !normalizedSearch || district.name.toLowerCase().includes(normalizedSearch)
  )), [districts.data, normalizedSearch])
  const filteredAgreements = useMemo(() => (agreements.data || []).filter((agreement) => (
    !normalizedSearch
    || agreement.districtName.toLowerCase().includes(normalizedSearch)
    || agreement.companyName.toLowerCase().includes(normalizedSearch)
    || agreement.status.toLowerCase().includes(normalizedSearch)
  )), [agreements.data, normalizedSearch])

  function submitDistrict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createDistrict.mutate(districtName.trim())
  }

  function submitAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createAgreement.mutate()
  }

  function endAgreement(agreementId: number, status: 'SUSPENDED' | 'TERMINATED', name: string) {
    const action = status.toLowerCase()
    if (window.confirm(`Are you sure you want to ${action} this agreement? ${name} will become unassigned.`)) {
      transition.mutate({ agreementId, status })
    }
  }

  const mutationError = createDistrict.error || createAgreement.error || transition.error
  const loadError = districts.error || agreements.error || companies.error || null

  return (
    <div>
      <PageHeader
        eyebrow="National administration"
        title="Districts & agreements"
        description="Register districts and manage company operating agreements. Access is granted only after explicit activation."
        icon={MapPinned}
      />

      {mutationError && <div className="mb-5"><ErrorState error={mutationError} /></div>}

      <div className="mb-6 grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="p-5 sm:p-6">
          <SectionHeading
            title="Register a district"
            description="Add a district to the national service-area registry."
          />
          <form onSubmit={submitDistrict}>
            <label htmlFor="district-name" className="mb-2 block text-sm font-semibold text-slate-700">District name</label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="district-name"
                required
                maxLength={160}
                value={districtName}
                onChange={(event) => setDistrictName(event.target.value)}
                className="app-input min-w-0 flex-1"
              />
              <Button type="submit" icon={Plus} disabled={createDistrict.isPending || !districtName.trim()}>
                {createDistrict.isPending ? 'Adding…' : 'Add district'}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="p-5 sm:p-6">
          <SectionHeading
            title="Propose a company agreement"
            description="New agreements remain pending until an administrator activates them."
          />
          <form onSubmit={submitAgreement}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">
                District
                <select required value={districtId} onChange={(event) => setDistrictId(event.target.value)} className="app-select mt-2">
                  <option value="">Select district</option>
                  {districts.data?.map((district) => (
                    <option key={district.id} value={district.id}>{district.name} · {district.assignmentStatus}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Company
                <select required value={companyId} onChange={(event) => setCompanyId(event.target.value)} className="app-select mt-2">
                  <option value="">Select company</option>
                  {companies.data?.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                </select>
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Starts on
                <input required type="date" min={today()} value={startsOn}
                  onChange={(event) => setStartsOn(event.target.value)} className="app-input mt-2" />
              </label>
              <label className="text-sm font-semibold text-slate-700">
                Ends on <span className="font-normal text-slate-400">(optional)</span>
                <input type="date" min={startsOn} value={endsOn}
                  onChange={(event) => setEndsOn(event.target.value)} className="app-input mt-2" />
              </label>
            </div>
            <Button type="submit" icon={ShieldCheck} className="mt-4"
              disabled={createAgreement.isPending || !districtId || !companyId}>
              {createAgreement.isPending ? 'Creating…' : 'Create pending agreement'}
            </Button>
          </form>
        </Card>
      </div>

      {(districts.isLoading || agreements.isLoading || companies.isLoading) && <LoadingState label="Loading district records…" />}
      {loadError && <div className="my-4"><ErrorState error={loadError} /></div>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">National registry</h2>
          <p className="mt-1 text-sm text-slate-500">District assignment state and agreement history.</p>
        </div>
        <label className="relative block w-full sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Search district, company, status" aria-label="Search current district and agreement records"
            className="app-input h-10 pl-9" />
        </label>
      </div>

      {districts.data && (
        <Card className="mb-6 overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 text-violet-700">
                <MapPinned size={17} aria-hidden="true" />
              </span>
              <h3 className="text-sm font-semibold text-slate-800">District registry</h3>
            </div>
            <span className="text-xs text-slate-500">{filteredDistricts.length} records</span>
          </div>
          {filteredDistricts.length === 0 ? (
            <div className="p-4"><EmptyState label={search ? 'No districts match your search.' : 'No districts registered.'} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="app-table min-w-[38rem]">
                <thead><tr><th>District</th><th>Assignment</th><th>Agreements</th><th>Active</th></tr></thead>
                <tbody>
                  {filteredDistricts.map((district) => (
                    <tr key={district.id}>
                      <td className="font-semibold text-slate-900">{district.name}</td>
                      <td><StatusBadge status={district.assignmentStatus} /></td>
                      <td>{district.agreementCount}</td>
                      <td>{district.activeAgreementCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {agreements.data && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-forest-700">
                <Building2 size={17} aria-hidden="true" />
              </span>
              <h3 className="text-sm font-semibold text-slate-800">Company agreement history</h3>
            </div>
            <span className="text-xs text-slate-500">{filteredAgreements.length} records</span>
          </div>
          {filteredAgreements.length === 0 ? (
            <div className="p-4"><EmptyState label={search ? 'No agreements match your search.' : 'No company agreements registered.'} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="app-table min-w-[57rem]">
                <thead>
                  <tr><th>District</th><th>Company</th><th>Status</th><th>Start date</th><th>End date</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {filteredAgreements.map((agreement) => (
                    <tr key={agreement.id}>
                      <td className="font-medium text-slate-900">{agreement.districtName}</td>
                      <td>{agreement.companyName}</td>
                      <td><StatusBadge status={agreement.status} /></td>
                      <td>{agreement.startsOn}</td>
                      <td>{agreement.endsOn || 'No end date'}</td>
                      <td>
                        <div className="flex flex-wrap gap-2">
                          {agreement.status === 'PENDING' && (
                            <Button variant="secondary" icon={ShieldCheck} disabled={transition.isPending}
                              onClick={() => transition.mutate({ agreementId: agreement.id, status: 'ACTIVE' })}>
                              Approve
                            </Button>
                          )}
                          {agreement.status === 'ACTIVE' && (
                            <>
                              <Button variant="secondary" disabled={transition.isPending}
                                onClick={() => endAgreement(agreement.id, 'SUSPENDED', agreement.districtName)}>
                                Suspend
                              </Button>
                              <Button variant="danger" disabled={transition.isPending}
                                onClick={() => endAgreement(agreement.id, 'TERMINATED', agreement.districtName)}>
                                Terminate
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
