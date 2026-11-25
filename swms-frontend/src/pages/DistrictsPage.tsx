import { useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
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

  function submitDistrict(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createDistrict.mutate(districtName.trim())
  }

  function submitAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    createAgreement.mutate()
  }

  function endAgreement(agreementId: number, status: 'SUSPENDED' | 'TERMINATED', districtName: string) {
    const action = status.toLowerCase()
    if (window.confirm(`Are you sure you want to ${action} this agreement? ${districtName} will become unassigned.`)) {
      transition.mutate({ agreementId, status })
    }
  }

  const mutationError = createDistrict.error || createAgreement.error || transition.error
  const loadError = districts.error || agreements.error || companies.error || null

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">District Management</h1>
        <p className="mt-1 text-sm text-slate-500">
          Review national districts, create pending agreements, and explicitly approve or end assignments.
        </p>
      </div>

      {mutationError && <div className="mb-5"><ErrorState error={mutationError} /></div>}

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <form onSubmit={submitDistrict} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Register a district</h2>
          <label className="block text-sm font-medium text-slate-700" htmlFor="district-name">District name</label>
          <div className="mt-2 flex gap-2">
            <input id="district-name" required maxLength={160} value={districtName}
              onChange={(event) => setDistrictName(event.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button disabled={createDistrict.isPending || !districtName.trim()}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              Add district
            </button>
          </div>
        </form>

        <form onSubmit={submitAgreement} className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Propose a company agreement</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-slate-700">
              District
              <select required value={districtId} onChange={(event) => setDistrictId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">Select district</option>
                {districts.data?.map((district) => (
                  <option key={district.id} value={district.id}>{district.name} ({district.assignmentStatus})</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Company
              <select required value={companyId} onChange={(event) => setCompanyId(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                <option value="">Select company</option>
                {companies.data?.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Starts on
              <input required type="date" min={today()} value={startsOn} onChange={(event) => setStartsOn(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Ends on (optional)
              <input type="date" min={startsOn} value={endsOn} onChange={(event) => setEndsOn(event.target.value)}
                className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <button disabled={createAgreement.isPending || !districtId || !companyId}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            Create pending agreement
          </button>
        </form>
      </div>

      {districts.isLoading || agreements.isLoading || companies.isLoading ? <LoadingState /> : null}
      {loadError && <ErrorState error={loadError} />}

      {districts.data && (
        <section className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">National districts</h2>
          {districts.data.length === 0 ? <EmptyState label="No districts registered." /> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{['District', 'Assignment', 'Agreements', 'Active'].map((column) =>
                    <th key={column} className="px-4 py-3 font-medium">{column}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {districts.data.map((district) => (
                    <tr key={district.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{district.name}</td>
                      <td className="px-4 py-3">{district.assignmentStatus}</td>
                      <td className="px-4 py-3">{district.agreementCount}</td>
                      <td className="px-4 py-3">{district.activeAgreementCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {agreements.data && (
        <section>
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Agreement history</h2>
          {agreements.data.length === 0 ? <EmptyState label="No company agreements registered." /> : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>{['District', 'Company', 'Status', 'Start', 'End', 'Actions'].map((column) =>
                    <th key={column} className="px-4 py-3 font-medium">{column}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agreements.data.map((agreement) => (
                    <tr key={agreement.id}>
                      <td className="px-4 py-3">{agreement.districtName}</td>
                      <td className="px-4 py-3">{agreement.companyName}</td>
                      <td className="px-4 py-3">{agreement.status}</td>
                      <td className="px-4 py-3">{agreement.startsOn}</td>
                      <td className="px-4 py-3">{agreement.endsOn || 'No end date'}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          {agreement.status === 'PENDING' && (
                            <button disabled={transition.isPending}
                              onClick={() => transition.mutate({ agreementId: agreement.id, status: 'ACTIVE' })}
                              className="rounded border border-emerald-700 px-2 py-1 text-xs text-emerald-800 disabled:opacity-50">
                              Approve & activate
                            </button>
                          )}
                          {agreement.status === 'ACTIVE' && (
                            <>
                              <button disabled={transition.isPending}
                                onClick={() => endAgreement(agreement.id, 'SUSPENDED', agreement.districtName)}
                                className="rounded border border-amber-600 px-2 py-1 text-xs text-amber-800 disabled:opacity-50">
                                Suspend
                              </button>
                              <button disabled={transition.isPending}
                                onClick={() => endAgreement(agreement.id, 'TERMINATED', agreement.districtName)}
                                className="rounded border border-red-600 px-2 py-1 text-xs text-red-700 disabled:opacity-50">
                                Terminate
                              </button>
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
        </section>
      )}
    </div>
  )
}
