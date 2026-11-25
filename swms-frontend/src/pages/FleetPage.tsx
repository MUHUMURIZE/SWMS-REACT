import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search, Truck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Card, PageHeader, StatusBadge } from '../components/ui'
import {
  collectorService,
  companyService,
  vehicleService,
} from '../services/resources'
import type {
  ApiError,
  Collector,
  Vehicle,
  VehicleFuelType,
  VehicleMaintenance,
  VehicleStatus,
} from '../types/api'

const pageSize = 50
const inputClass = 'app-input mt-1'
const fuelTypes: VehicleFuelType[] = ['DIESEL', 'PETROL', 'ELECTRIC', 'HYBRID', 'CNG', 'OTHER']

interface VehicleForm {
  companyId: string
  registrationNumber: string
  vehicleType: string
  make: string
  model: string
  capacity: string
  fuelType: VehicleFuelType
  registrationExpiresOn: string
  insuranceExpiresOn: string
  inspectionExpiresOn: string
}

interface MaintenanceForm {
  description: string
  serviceProvider: string
  scheduledFor: string
  cost: string
  odometerKm: string
}

const emptyVehicleForm: VehicleForm = {
  companyId: '',
  registrationNumber: '',
  vehicleType: '',
  make: '',
  model: '',
  capacity: '',
  fuelType: 'DIESEL',
  registrationExpiresOn: '',
  insuranceExpiresOn: '',
  inspectionExpiresOn: '',
}

const emptyMaintenanceForm: MaintenanceForm = {
  description: '',
  serviceProvider: '',
  scheduledFor: '',
  cost: '',
  odometerKm: '',
}

function vehicleFormFrom(vehicle: Vehicle): VehicleForm {
  return {
    companyId: String(vehicle.companyId),
    registrationNumber: vehicle.registrationNumber,
    vehicleType: vehicle.vehicleType,
    make: vehicle.make || '',
    model: vehicle.model || '',
    capacity: String(vehicle.capacity),
    fuelType: vehicle.fuelType,
    registrationExpiresOn: vehicle.registrationExpiresOn || '',
    insuranceExpiresOn: vehicle.insuranceExpiresOn || '',
    inspectionExpiresOn: vehicle.inspectionExpiresOn || '',
  }
}

function toOptionalDate(value: string) {
  return value || undefined
}

function displayDate(value: string | null) {
  if (!value) return 'Not set'
  return new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString()
}

function normalizeError(error: unknown): ApiError | Error | null {
  if (error instanceof Error) return error
  if (typeof error !== 'object' || error === null || !('message' in error)) return null
  if (typeof error.message !== 'string') return null
  return {
    status: 'status' in error && typeof error.status === 'number' ? error.status : 0,
    code: 'code' in error && typeof error.code === 'string' ? error.code : 'REQUEST_FAILED',
    message: error.message,
  }
}

export function FleetPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const isManager = user?.role === 'ADMIN' || user?.role === 'COMPANY_REPRESENTATIVE'
  const isAdmin = user?.role === 'ADMIN'
  const [offset, setOffset] = useState(0)
  const [form, setForm] = useState<VehicleForm>(emptyVehicleForm)
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null)
  const [expandedVehicleId, setExpandedVehicleId] = useState<number | null>(null)
  const [collectorId, setCollectorId] = useState('')
  const [maintenanceForm, setMaintenanceForm] = useState<MaintenanceForm>(emptyMaintenanceForm)
  const [search, setSearch] = useState('')

  const vehicles = useQuery({
    queryKey: ['vehicles', { limit: pageSize, offset }],
    queryFn: () => vehicleService.list({ limit: pageSize, offset }),
  })
  const companies = useQuery({
    queryKey: ['companies', { limit: 200, offset: 0 }],
    queryFn: () => companyService.list({ limit: 200, offset: 0 }),
    enabled: isAdmin,
  })
  const collectors = useQuery({
    queryKey: ['collectors', { limit: 200, offset: 0 }],
    queryFn: () => collectorService.list({ limit: 200, offset: 0 }),
    enabled: isManager,
  })
  const assignments = useQuery({
    queryKey: ['vehicle-assignments', expandedVehicleId],
    queryFn: () => vehicleService.assignments(expandedVehicleId!, { limit: 50, offset: 0 }),
    enabled: expandedVehicleId !== null,
  })
  const maintenance = useQuery({
    queryKey: ['vehicle-maintenance', expandedVehicleId],
    queryFn: () => vehicleService.maintenance(expandedVehicleId!, { limit: 50, offset: 0 }),
    enabled: expandedVehicleId !== null,
  })
  const filteredVehicles = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return vehicles.data || []
    return (vehicles.data || []).filter((vehicle) => [
      vehicle.registrationNumber,
      vehicle.vehicleType,
      vehicle.make,
      vehicle.model,
      vehicle.fuelType,
      vehicle.status,
      vehicle.assignedCollectorName,
      vehicle.assignedCollectorDistrict,
      String(vehicle.companyId),
    ].some((value) => value?.toLowerCase().includes(term)))
  }, [vehicles.data, search])

  const invalidateFleet = async (vehicleId?: number) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['vehicles'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ...(vehicleId === undefined ? [] : [
        queryClient.invalidateQueries({ queryKey: ['vehicle-assignments', vehicleId] }),
        queryClient.invalidateQueries({ queryKey: ['vehicle-maintenance', vehicleId] }),
      ]),
    ])
  }
  const saveVehicle = useMutation({
    mutationFn: () => {
      const body = {
        registrationNumber: form.registrationNumber,
        vehicleType: form.vehicleType,
        make: form.make || undefined,
        model: form.model || undefined,
        capacity: Number(form.capacity),
        fuelType: form.fuelType,
        registrationExpiresOn: toOptionalDate(form.registrationExpiresOn),
        insuranceExpiresOn: toOptionalDate(form.insuranceExpiresOn),
        inspectionExpiresOn: toOptionalDate(form.inspectionExpiresOn),
      }
      if (editingVehicle) return vehicleService.update(editingVehicle.id, body)
      return vehicleService.create({
        ...body,
        ...(isAdmin ? { companyId: Number(form.companyId) } : {}),
      })
    },
    onSuccess: async () => {
      setEditingVehicle(null)
      setForm(emptyVehicleForm)
      await invalidateFleet()
    },
  })
  const assignVehicle = useMutation({
    mutationFn: ({ vehicleId, newCollectorId }: { vehicleId: number; newCollectorId: number }) =>
      vehicleService.assign(vehicleId, newCollectorId),
    onSuccess: async (vehicle) => {
      setCollectorId('')
      await invalidateFleet(vehicle.id)
    },
  })
  const unassignVehicle = useMutation({
    mutationFn: (vehicleId: number) => vehicleService.unassign(vehicleId),
    onSuccess: async (vehicle) => invalidateFleet(vehicle.id),
  })
  const changeStatus = useMutation({
    mutationFn: ({ vehicleId, status }: {
      vehicleId: number
      status: Exclude<VehicleStatus, 'IN_SERVICE'>
    }) => vehicleService.setStatus(vehicleId, status),
    onSuccess: async (vehicle) => invalidateFleet(vehicle.id),
  })
  const scheduleMaintenance = useMutation({
    mutationFn: ({ vehicleId, body }: {
      vehicleId: number
      body: {
        description: string
        serviceProvider?: string
        scheduledFor: string
        cost?: number
        odometerKm?: number
      }
    }) => vehicleService.scheduleMaintenance(vehicleId, body),
    onSuccess: async (_maintenance, variables) => {
      setMaintenanceForm(emptyMaintenanceForm)
      await invalidateFleet(variables.vehicleId)
    },
  })
  const updateMaintenance = useMutation({
    mutationFn: ({ vehicleId, maintenanceId, status }: {
      vehicleId: number
      maintenanceId: number
      status: 'COMPLETED' | 'CANCELLED'
    }) => vehicleService.updateMaintenanceStatus(vehicleId, maintenanceId, status),
    onSuccess: async (_result, variables) => invalidateFleet(variables.vehicleId),
  })

  function submitVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveVehicle.mutate()
  }

  function beginEdit(vehicle: Vehicle) {
    setEditingVehicle(vehicle)
    setForm(vehicleFormFrom(vehicle))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function cancelEdit() {
    setEditingVehicle(null)
    setForm(emptyVehicleForm)
  }

  function submitMaintenance(event: FormEvent<HTMLFormElement>, vehicleId: number) {
    event.preventDefault()
    scheduleMaintenance.mutate({
      vehicleId,
      body: {
        description: maintenanceForm.description,
        serviceProvider: maintenanceForm.serviceProvider || undefined,
        scheduledFor: maintenanceForm.scheduledFor,
        ...(maintenanceForm.cost === '' ? {} : { cost: Number(maintenanceForm.cost) }),
        ...(maintenanceForm.odometerKm === '' ? {} : { odometerKm: Number(maintenanceForm.odometerKm) }),
      },
    })
  }

  const mutationErrors = [
    saveVehicle.error,
    assignVehicle.error,
    unassignVehicle.error,
    changeStatus.error,
    scheduleMaintenance.error,
    updateMaintenance.error,
  ].map(normalizeError).filter((error): error is ApiError | Error => error !== null)
  const loadError = vehicles.error || companies.error || collectors.error

  return (
    <div>
      <PageHeader
        eyebrow="Field operations"
        title="Fleet management"
        description="Register vehicles, manage authorized collector assignments, and keep maintenance history."
        icon={Truck}
      />

      {mutationErrors.map((error, index) => (
        <div className="mb-3" key={`${error.message}-${index}`}><ErrorState error={error} /></div>
      ))}
      {loadError && <div className="mb-4"><ErrorState error={loadError} /></div>}

      {isManager && (
        <form onSubmit={submitVehicle} className="app-card mb-6 p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingVehicle ? `Edit ${editingVehicle.registrationNumber}` : 'Register a vehicle'}
            </h2>
            {editingVehicle && (
              <button type="button" onClick={cancelEdit} className="text-sm text-slate-600 underline">
                Cancel edit
              </button>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {isAdmin && !editingVehicle && (
              <label className="text-sm font-medium text-slate-700">
                Company
                <select required value={form.companyId}
                  onChange={(event) => setForm({ ...form, companyId: event.target.value })}
                  className={inputClass}>
                  <option value="">Select company</option>
                  {companies.data?.map((company) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-sm font-medium text-slate-700">
              Registration number
              <input required maxLength={32} value={form.registrationNumber}
                onChange={(event) => setForm({ ...form, registrationNumber: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Vehicle type
              <input required maxLength={32} placeholder="Compactor, truck..." value={form.vehicleType}
                onChange={(event) => setForm({ ...form, vehicleType: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Make
              <input maxLength={80} value={form.make}
                onChange={(event) => setForm({ ...form, make: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Model
              <input maxLength={80} value={form.model}
                onChange={(event) => setForm({ ...form, model: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Capacity
              <input required type="number" min="0.01" step="0.01" value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Fuel type
              <select value={form.fuelType}
                onChange={(event) => setForm({ ...form, fuelType: event.target.value as VehicleFuelType })}
                className={inputClass}>
                {fuelTypes.map((fuel) => <option key={fuel} value={fuel}>{fuel}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Registration expires
              <input type="date" value={form.registrationExpiresOn}
                onChange={(event) => setForm({ ...form, registrationExpiresOn: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Insurance expires
              <input type="date" value={form.insuranceExpiresOn}
                onChange={(event) => setForm({ ...form, insuranceExpiresOn: event.target.value })}
                className={inputClass} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Inspection expires
              <input type="date" value={form.inspectionExpiresOn}
                onChange={(event) => setForm({ ...form, inspectionExpiresOn: event.target.value })}
                className={inputClass} />
            </label>
          </div>
          <button type="submit" disabled={saveVehicle.isPending}
            className="mt-4 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saveVehicle.isPending ? 'Saving...' : editingVehicle ? 'Save vehicle' : 'Register vehicle'}
          </button>
        </form>
      )}

      {vehicles.isLoading && <LoadingState label="Loading fleet..." />}
      {vehicles.data && vehicles.data.length === 0 && (
        <EmptyState label="No vehicles are registered in this authorized scope." />
      )}
      {vehicles.data && vehicles.data.length > 0 && (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Registered vehicles</h2>
                <p className="mt-1 text-xs text-slate-500">Showing records in your authorized scope.</p>
              </div>
              <label className="relative block w-full sm:max-w-xs">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter loaded vehicles" aria-label="Filter loaded vehicles"
                  className="app-input h-10 pl-9" />
              </label>
            </div>
            {filteredVehicles.length === 0 ? (
              <div className="p-4"><EmptyState title="No matching vehicles" label="Try another search term or clear the filter." /></div>
            ) : (
            <div className="overflow-x-auto">
            <table className="app-table min-w-[58rem]">
              <thead>
                <tr>
                  {['Registration', 'Vehicle', ...(isAdmin ? ['Company'] : []), 'Capacity', 'Fuel', 'Status', 'Collector', 'Actions'].map((column) => (
                    <th key={column}>{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="align-top">
                    <td className="font-semibold text-slate-900">{vehicle.registrationNumber}</td>
                    <td>{[vehicle.make, vehicle.model, vehicle.vehicleType].filter(Boolean).join(' ')}</td>
                    {isAdmin && <td>{companies.data?.find((company) => company.id === vehicle.companyId)?.name || `Company ${vehicle.companyId}`}</td>}
                    <td>{vehicle.capacity}</td>
                    <td>{vehicle.fuelType}</td>
                    <td><StatusBadge status={vehicle.status} /></td>
                    <td>
                      {vehicle.assignedCollectorName || 'Unassigned'}
                      {vehicle.assignedCollectorDistrict && (
                        <div className="mt-1 text-xs text-slate-500">{vehicle.assignedCollectorDistrict}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        {isManager && (
                          <button type="button" onClick={() => beginEdit(vehicle)}
                            className="rounded border border-slate-300 px-2 py-1 text-xs">Edit</button>
                        )}
                        <button type="button"
                          onClick={() => setExpandedVehicleId(expandedVehicleId === vehicle.id ? null : vehicle.id)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs">
                          {expandedVehicleId === vehicle.id ? 'Hide history' : 'History'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            )}
          </Card>

          {filteredVehicles.map((vehicle) => expandedVehicleId === vehicle.id && (
            <Card key={`details-${vehicle.id}`} className="mt-4 p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">
                  {vehicle.registrationNumber} · Assignment and maintenance history
                </h2>
                {isManager && (
                  <div className="flex flex-wrap gap-2">
                    {vehicle.assignedCollectorId ? (
                      <button type="button" disabled={unassignVehicle.isPending}
                        onClick={() => unassignVehicle.mutate(vehicle.id)}
                        className="rounded border border-amber-600 px-3 py-2 text-xs text-amber-800 disabled:opacity-50">
                        Release collector
                      </button>
                    ) : (
                      <>
                        <select aria-label="Select collector" value={collectorId}
                          onChange={(event) => setCollectorId(event.target.value)}
                          className="rounded border border-slate-300 bg-white px-2 py-1 text-xs">
                          <option value="">Select collector</option>
                          {collectors.data?.map((collector: Collector) => (
                            <option key={collector.id} value={collector.id}>
                              {collector.fullName} · {collector.district || 'No district'}
                            </option>
                          ))}
                        </select>
                        <button type="button" disabled={!collectorId || assignVehicle.isPending}
                          onClick={() => assignVehicle.mutate({
                            vehicleId: vehicle.id,
                            newCollectorId: Number(collectorId),
                          })}
                          className="rounded bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-50">
                          Assign collector
                        </button>
                      </>
                    )}
                    {!vehicle.assignedCollectorId && vehicle.status === 'INACTIVE' && (
                      <button type="button" disabled={changeStatus.isPending}
                        onClick={() => changeStatus.mutate({ vehicleId: vehicle.id, status: 'AVAILABLE' })}
                        className="rounded border border-emerald-600 px-3 py-2 text-xs text-emerald-800 disabled:opacity-50">
                        Reactivate
                      </button>
                    )}
                    {!vehicle.assignedCollectorId && vehicle.status !== 'INACTIVE' && (
                      <button type="button" disabled={changeStatus.isPending}
                        onClick={() => changeStatus.mutate({
                          vehicleId: vehicle.id,
                          status: vehicle.status === 'MAINTENANCE' ? 'AVAILABLE' : 'MAINTENANCE',
                        })}
                        className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">
                        {vehicle.status === 'MAINTENANCE' ? 'Mark available' : 'Mark maintenance'}
                      </button>
                    )}
                    {!vehicle.assignedCollectorId && vehicle.status !== 'INACTIVE' && (
                      <button type="button" disabled={changeStatus.isPending}
                        onClick={() => changeStatus.mutate({ vehicleId: vehicle.id, status: 'INACTIVE' })}
                        className="rounded border border-red-300 px-3 py-2 text-xs text-red-700 disabled:opacity-50">
                        Deactivate
                      </button>
                    )}
                  </div>
                )}
              </div>

              {assignments.isLoading || maintenance.isLoading ? <LoadingState /> : null}
              {assignments.error && <ErrorState error={assignments.error} />}
              {maintenance.error && <ErrorState error={maintenance.error} />}

              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="text-xs text-slate-500">Registration expiry</div>
                  <div className="mt-1">{displayDate(vehicle.registrationExpiresOn)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="text-xs text-slate-500">Insurance expiry</div>
                  <div className="mt-1">{displayDate(vehicle.insuranceExpiresOn)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 p-3 text-sm">
                  <div className="text-xs text-slate-500">Inspection expiry</div>
                  <div className="mt-1">{displayDate(vehicle.inspectionExpiresOn)}</div>
                </div>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Assignment history</h3>
                  {!assignments.isLoading && assignments.data?.length === 0 && (
                    <p className="text-sm text-slate-500">No assignment history.</p>
                  )}
                  {assignments.data?.map((assignment) => (
                    <div key={assignment.id} className="border-t border-slate-100 py-2 text-sm">
                      <span className="font-medium">{assignment.collectorName}</span>
                      <span className="ml-2 text-slate-500">
                        {new Date(assignment.assignedAt).toLocaleDateString()}
                        {' → '}
                        {assignment.unassignedAt
                          ? new Date(assignment.unassignedAt).toLocaleDateString()
                          : 'Current'}
                      </span>
                    </div>
                  ))}
                </div>

                <div>
                  <h3 className="mb-2 font-semibold text-slate-800">Maintenance history</h3>
                  {isManager && (
                    <form onSubmit={(event) => submitMaintenance(event, vehicle.id)}
                      className="mb-3 grid gap-2 rounded-lg bg-slate-50 p-3 sm:grid-cols-2">
                      <input required maxLength={1000} placeholder="Service description"
                        value={maintenanceForm.description}
                        onChange={(event) => setMaintenanceForm({ ...maintenanceForm, description: event.target.value })}
                        className={inputClass} />
                      <input maxLength={160} placeholder="Service provider (optional)"
                        value={maintenanceForm.serviceProvider}
                        onChange={(event) => setMaintenanceForm({ ...maintenanceForm, serviceProvider: event.target.value })}
                        className={inputClass} />
                      <label className="text-xs text-slate-600">
                        Scheduled for
                        <input required type="date" value={maintenanceForm.scheduledFor}
                          onChange={(event) => setMaintenanceForm({ ...maintenanceForm, scheduledFor: event.target.value })}
                          className={inputClass} />
                      </label>
                      <label className="text-xs text-slate-600">
                        Cost
                        <input type="number" min="0" step="0.01" value={maintenanceForm.cost}
                          onChange={(event) => setMaintenanceForm({ ...maintenanceForm, cost: event.target.value })}
                          className={inputClass} />
                      </label>
                      <label className="text-xs text-slate-600">
                        Odometer (km)
                        <input type="number" min="0" step="1" value={maintenanceForm.odometerKm}
                          onChange={(event) => setMaintenanceForm({ ...maintenanceForm, odometerKm: event.target.value })}
                          className={inputClass} />
                      </label>
                      <button type="submit" disabled={scheduleMaintenance.isPending}
                        className="self-end rounded bg-emerald-700 px-3 py-2 text-xs text-white disabled:opacity-50">
                        Schedule service
                      </button>
                    </form>
                  )}
                  {!maintenance.isLoading && maintenance.data?.length === 0 && (
                    <p className="text-sm text-slate-500">No maintenance records.</p>
                  )}
                  {maintenance.data?.map((item: VehicleMaintenance) => (
                    <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 py-2 text-sm">
                      <div>
                        <div className="font-medium">{item.description}</div>
                        <div className="text-xs text-slate-500">
                          {displayDate(item.scheduledFor)} · {item.status}
                          {item.cost === null ? '' : ` · ${item.cost}`}
                          {item.odometerKm === null ? '' : ` · ${item.odometerKm} km`}
                        </div>
                      </div>
                      {isManager && item.status === 'SCHEDULED' && (
                        <div className="flex gap-2">
                          <button type="button" disabled={updateMaintenance.isPending}
                            onClick={() => updateMaintenance.mutate({
                              vehicleId: vehicle.id,
                              maintenanceId: item.id,
                              status: 'COMPLETED',
                            })}
                            className="rounded border border-emerald-600 px-2 py-1 text-xs text-emerald-800 disabled:opacity-50">
                            Complete
                          </button>
                          <button type="button" disabled={updateMaintenance.isPending}
                            onClick={() => updateMaintenance.mutate({
                              vehicleId: vehicle.id,
                              maintenanceId: item.id,
                              status: 'CANCELLED',
                            })}
                            className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          ))}
          <div className="mt-4 flex justify-end gap-2">
            <button type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40">Previous</button>
            <button type="button" disabled={vehicles.data.length < pageSize} onClick={() => setOffset((value) => value + pageSize)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-40">Next</button>
          </div>
        </>
      )}
    </div>
  )
}
