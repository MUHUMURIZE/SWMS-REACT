import { useMemo, useState, type FormEvent } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Eye,
  Gauge,
  House,
  Pencil,
  Plus,
  Recycle,
  Search,
  Trash2,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, StatusBadge } from '../components/ui'
import {
  authService,
  binService,
  collectorService,
  collectionService,
  companyService,
  householdService,
  representativeService,
} from '../services/resources'
import type { CollectionStatus, UserRole } from '../types/api'

type ResourceKind = 'companies' | 'representatives' | 'collectors' | 'households' | 'bins' | 'collections'

const pageSize = 50

const titles: Record<ResourceKind, string> = {
  companies: 'Companies',
  representatives: 'Company representatives',
  collectors: 'Collectors',
  households: 'Households',
  bins: 'Smart bins',
  collections: 'Waste collections',
}

const singularTitles: Record<ResourceKind, string> = {
  companies: 'Company',
  representatives: 'Company representative',
  collectors: 'Collector',
  households: 'Household',
  bins: 'Smart bin',
  collections: 'Waste collection',
}

const pageDescriptions: Record<ResourceKind, string> = {
  companies: 'Registered service providers visible to national administrators.',
  representatives: 'Company account representatives and their service locations.',
  collectors: 'Collection staff within your authorized company scope.',
  households: 'Households visible within your current district authorization.',
  bins: 'Waste-bin records and their recorded fill status.',
  collections: 'Collection records available within your authorized scope.',
}

const icons = {
  companies: Building2,
  representatives: UserRound,
  collectors: UsersRound,
  households: House,
  bins: Trash2,
  collections: Recycle,
}

const allowedColumns: Record<ResourceKind, string[]> = {
  companies: ['id', 'name', 'district', 'sector', 'cell', 'village'],
  representatives: ['id', 'fullName', 'email', 'companyName', 'district', 'sector'],
  collectors: ['id', 'fullName', 'email', 'representativeName', 'district', 'sector'],
  households: ['id', 'fullName', 'email', 'address', 'district', 'sector', 'collectorName'],
  bins: [
    'id',
    'binCode',
    'householdName',
    'capacity',
    'fillLevel',
    'sensorFillLevel',
    'sensorDeviceStatus',
    'sensorStatus',
    'batteryLevel',
    'sensorMeasuredAt',
    'status',
  ],
  collections: ['id', 'householdName', 'collectorName', 'scheduledAt', 'status', 'notes'],
}

type ResourceRow = { id?: number } & Record<string, unknown>
type PanelMode = 'view' | 'create' | 'edit' | 'fill'
type ResourcePanel = { mode: PanelMode; row?: ResourceRow }
type FieldOption = { value: string; label: string }
type ResourceField = {
  name: string
  label: string
  type?: 'text' | 'email' | 'password' | 'number' | 'datetime-local' | 'select' | 'textarea'
  required?: boolean
  options?: FieldOption[]
  min?: number
  max?: number
  step?: number
  help?: string
}

function isResourceRow(value: unknown): value is ResourceRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function resourceId(row: ResourceRow | undefined) {
  return typeof row?.id === 'number' && Number.isInteger(row.id) && row.id > 0 ? row.id : undefined
}

async function loadResource(kind: ResourceKind, limit: number, offset: number): Promise<ResourceRow[]> {
  const pagination = { limit, offset }
  let rows: unknown[]
  if (kind === 'companies') rows = await companyService.list(pagination)
  else if (kind === 'representatives') rows = await representativeService.list(pagination)
  else if (kind === 'collectors') rows = await collectorService.list(pagination)
  else if (kind === 'households') rows = await householdService.list(pagination)
  else if (kind === 'bins') rows = await binService.list(pagination)
  else rows = await collectionService.list(pagination)
  return rows.filter(isResourceRow)
}

function formatColumn(column: string) {
  const labels: Record<string, string> = {
    id: 'ID',
    binCode: 'Bin code',
    fillLevel: 'Fill level',
    sensorFillLevel: 'Sensor fill level',
    sensorDeviceStatus: 'Sensor connection',
    sensorStatus: 'Sensor health',
    sensorMeasuredAt: 'Last sensor reading',
    batteryLevel: 'Battery level',
    householdId: 'Household',
    collectorId: 'Collector',
    representativeId: 'Representative',
    companyId: 'Company',
    scheduledAt: 'Scheduled',
    fullName: 'Name',
    householdName: 'Household',
    collectorName: 'Collector',
    companyName: 'Company',
    representativeName: 'Representative',
  }
  return labels[column] || column.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function formatValue(value: unknown) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function ResourceCell({ column, value }: { column: string; value: unknown }) {
  if (column === 'status' || column === 'assignmentStatus'
    || column === 'sensorDeviceStatus' || column === 'sensorStatus') {
    return typeof value === 'string' ? <StatusBadge status={value} /> : <span>—</span>
  }
  if (column === 'sensorFillLevel' && value == null) {
    return <span className="text-slate-400">No sensor reading</span>
  }
  if ((column === 'fillLevel' || column === 'sensorFillLevel') && typeof value === 'number') {
    return (
      <div className="min-w-28">
        <div className="mb-1 flex justify-between text-xs font-medium text-slate-600">
          <span>{value}%</span>
          <span className="text-slate-400">{column === 'sensorFillLevel' ? 'sensor' : 'recorded'}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${value >= 80 ? 'bg-rose-500' : value >= 55 ? 'bg-amber-500' : 'bg-emerald-600'}`}
            style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
        </div>
      </div>
    )
  }
  return <span className="whitespace-nowrap">{formatValue(value)}</span>
}

function resourceValue(row: ResourceRow | undefined, column: string) {
  if (!row) return undefined
  if (row[column] != null) return row[column]
  const relatedIds: Record<string, string> = {
    householdName: 'householdId',
    collectorName: 'collectorId',
    companyName: 'companyId',
    representativeName: 'representativeId',
  }
  const fallback = relatedIds[column]
  return fallback ? row[fallback] : undefined
}

function optionList(rows: Array<{ id: number; fullName?: string; name?: string; address?: string }>): FieldOption[] {
  return rows.map((row) => ({
    value: String(row.id),
    label: `${row.fullName || row.name || `Record ${row.id}`}${row.address ? ` · ${row.address}` : ''}`,
  }))
}

function isProfile(value: unknown): value is { id: number } {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && typeof value.id === 'number'
    && Number.isInteger(value.id)
    && value.id > 0
}

function requiredText(values: Record<string, string>, name: string, label: string) {
  const value = values[name]?.trim()
  if (!value) throw new Error(`${label} is required.`)
  return value
}

function optionalText(values: Record<string, string>, name: string) {
  return values[name]?.trim() || undefined
}

function requiredNumber(values: Record<string, string>, name: string, label: string) {
  const value = Number(values[name])
  if (!Number.isInteger(value) || value < 1) throw new Error(`${label} must be a positive whole number.`)
  return value
}

function locationValues(values: Record<string, string>) {
  return {
    district: optionalText(values, 'district'),
    sector: optionalText(values, 'sector'),
    cell: optionalText(values, 'cell'),
    village: optionalText(values, 'village'),
  }
}

function validCollectionStatus(value: string): CollectionStatus {
  const statuses: CollectionStatus[] = [
    'pending',
    'scheduled',
    'in_progress',
    'collected',
    'completed',
    'missed',
    'cancelled',
  ]
  const status = statuses.find((item) => item === value)
  if (!status) throw new Error('Choose a valid collection status.')
  return status
}

function initialCollectionStatus(value: string): 'pending' | 'scheduled' {
  if (value === 'pending' || value === 'scheduled') return value
  throw new Error('New collections must start as pending or scheduled.')
}

function editableBy(kind: ResourceKind, role: UserRole | undefined) {
  if (kind === 'companies' || kind === 'representatives') return role === 'ADMIN'
  if (kind === 'collectors') return role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE'
  if (kind === 'households') return role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE' || role === 'COLLECTOR'
  if (kind === 'bins') return role === 'ADMIN' || role === 'COLLECTOR'
  return role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE' || role === 'COLLECTOR'
}

function deletableBy(kind: ResourceKind, role: UserRole | undefined) {
  if (kind === 'companies' || kind === 'representatives') return role === 'ADMIN'
  if (kind === 'collectors') return role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE'
  if (kind === 'households' || kind === 'bins') return editableBy(kind, role)
  return role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE'
}

function buildFields(
  kind: ResourceKind,
  mode: Exclude<PanelMode, 'view'>,
  role: UserRole | undefined,
  choices: {
    companies: FieldOption[]
    representatives: FieldOption[]
    collectors: FieldOption[]
    households: FieldOption[]
  },
): ResourceField[] {
  if (mode === 'fill') return [{ name: 'fillLevel', label: 'Recorded fill level (%)', type: 'number', required: true, min: 0, max: 100, step: 1 }]
  const create = mode === 'create'
  const location: ResourceField[] = [
    { name: 'district', label: 'District' },
    { name: 'sector', label: 'Sector' },
    { name: 'cell', label: 'Cell' },
    { name: 'village', label: 'Village' },
  ]
  const accountFields: ResourceField[] = [
    { name: 'fullName', label: 'Full name', required: true },
    ...(create ? [
      { name: 'email', label: 'Email', type: 'email' as const, required: true },
      {
        name: 'password',
        label: 'Temporary password',
        type: 'password' as const,
        required: true,
        help: 'Use 12+ characters with uppercase, lowercase, a number, and a symbol.',
      },
    ] : []),
    { name: 'phone', label: 'Phone' },
  ]

  if (kind === 'companies') return [{ name: 'name', label: 'Company name', required: true }, ...location]
  if (kind === 'representatives') return [
    ...accountFields,
    { name: 'companyId', label: 'Company', type: 'select', required: true, options: choices.companies },
    ...location,
  ]
  if (kind === 'collectors') return [
    ...accountFields,
    ...(role === 'ADMIN' ? [{
      name: 'representativeId',
      label: 'Company representative',
      type: 'select' as const,
      required: create,
      options: choices.representatives,
    }] : []),
    ...location,
  ]
  if (kind === 'households') return [
    ...accountFields,
    { name: 'address', label: 'Street address', required: create },
    { name: 'nationalId', label: 'National ID' },
    ...(role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE' ? [{
      name: 'collectorId',
      label: 'Assigned collector',
      type: 'select' as const,
      required: create,
      options: choices.collectors,
    }] : []),
    ...location,
  ]
  if (kind === 'bins') return [
    ...(create ? [{
      name: 'householdId',
      label: 'Household',
      type: 'select' as const,
      required: true,
      options: choices.households,
    }] : []),
    { name: 'binCode', label: 'Bin code', required: true },
    { name: 'capacity', label: 'Capacity', type: 'number', required: true, min: 1, step: 1 },
  ]
  if (kind === 'collections') {
    if (create) return [
      { name: 'householdId', label: 'Household', type: 'select', required: true, options: choices.households },
      ...(role === 'COLLECTOR' ? [] : [{
        name: 'collectorId',
        label: 'Collector',
        type: 'select' as const,
        required: true,
        options: choices.collectors,
      }]),
      { name: 'scheduledAt', label: 'Scheduled date and time', type: 'datetime-local', required: true },
      {
        name: 'status',
        label: 'Initial status',
        type: 'select',
        required: true,
        options: [
          { value: 'pending', label: 'Pending' },
          { value: 'scheduled', label: 'Scheduled' },
        ],
      },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ]
    return [
      { name: 'scheduledAt', label: 'Scheduled date and time', type: 'datetime-local' },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: ['pending', 'scheduled', 'in_progress', 'collected', 'completed', 'missed', 'cancelled']
          .map((value) => ({ value, label: formatColumn(value) })),
      },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ]
  }
  return []
}

async function saveResource(
  kind: ResourceKind,
  mode: Exclude<PanelMode, 'view'>,
  id: number | undefined,
  values: Record<string, string>,
  role: UserRole | undefined,
  ownCollectorId: number | undefined,
) {
  if (mode === 'fill') {
    if (id === undefined) throw new Error('The selected bin has no valid record ID.')
    const fillLevel = Number(values.fillLevel)
    if (!Number.isFinite(fillLevel) || fillLevel < 0 || fillLevel > 100) {
      throw new Error('Fill level must be between 0 and 100.')
    }
    return binService.updateProgress(id, fillLevel)
  }

  if (mode === 'edit' && id === undefined) throw new Error('The selected record has no valid ID.')
  const updating = mode === 'edit'
  const updateId = () => {
    if (id === undefined) throw new Error('The selected record has no valid ID.')
    return id
  }
  if (kind === 'companies') {
    const body = { name: requiredText(values, 'name', 'Company name'), ...locationValues(values) }
    return updating ? companyService.update(updateId(), body) : companyService.create(body)
  }
  if (kind === 'representatives') {
    if (updating) return representativeService.update(updateId(), {
      fullName: optionalText(values, 'fullName'),
      phone: optionalText(values, 'phone'),
      companyId: requiredNumber(values, 'companyId', 'Company'),
      ...locationValues(values),
    })
    return representativeService.create({
      fullName: requiredText(values, 'fullName', 'Full name'),
      email: requiredText(values, 'email', 'Email'),
      password: requiredText(values, 'password', 'Temporary password'),
      phone: optionalText(values, 'phone'),
      companyId: requiredNumber(values, 'companyId', 'Company'),
      ...locationValues(values),
    })
  }
  if (kind === 'collectors') {
    if (updating) return collectorService.update(updateId(), {
      fullName: optionalText(values, 'fullName'),
      phone: optionalText(values, 'phone'),
      ...(role === 'ADMIN' && values.representativeId
        ? { representativeId: requiredNumber(values, 'representativeId', 'Company representative') }
        : {}),
      ...locationValues(values),
    })
    return collectorService.create({
      fullName: requiredText(values, 'fullName', 'Full name'),
      email: requiredText(values, 'email', 'Email'),
      password: requiredText(values, 'password', 'Temporary password'),
      phone: optionalText(values, 'phone'),
      ...(role === 'ADMIN'
        ? { representativeId: requiredNumber(values, 'representativeId', 'Company representative') }
        : {}),
      ...locationValues(values),
    })
  }
  if (kind === 'households') {
    if (updating) return householdService.update(updateId(), {
      fullName: optionalText(values, 'fullName'),
      phone: optionalText(values, 'phone'),
      address: optionalText(values, 'address'),
      nationalId: optionalText(values, 'nationalId'),
      ...locationValues(values),
    })
    return householdService.create({
      fullName: requiredText(values, 'fullName', 'Full name'),
      email: requiredText(values, 'email', 'Email'),
      password: requiredText(values, 'password', 'Temporary password'),
      phone: optionalText(values, 'phone'),
      address: requiredText(values, 'address', 'Street address'),
      nationalId: optionalText(values, 'nationalId'),
      ...(role === 'ADMIN' || role === 'COMPANY_REPRESENTATIVE'
        ? { collectorId: requiredNumber(values, 'collectorId', 'Assigned collector') }
        : {}),
      ...locationValues(values),
    })
  }
  if (kind === 'bins') {
    if (updating) return binService.update(updateId(), {
      binCode: requiredText(values, 'binCode', 'Bin code'),
      capacity: requiredNumber(values, 'capacity', 'Capacity'),
    })
    return binService.create({
      householdId: requiredNumber(values, 'householdId', 'Household'),
      binCode: requiredText(values, 'binCode', 'Bin code'),
      capacity: requiredNumber(values, 'capacity', 'Capacity'),
    })
  }
  if (updating) return collectionService.update(updateId(), {
    scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
    status: validCollectionStatus(requiredText(values, 'status', 'Status')),
    notes: optionalText(values, 'notes'),
  })
  const collectorId = role === 'COLLECTOR'
    ? ownCollectorId
    : requiredNumber(values, 'collectorId', 'Collector')
  if (!collectorId) throw new Error('Your collector profile could not be identified for this collection.')
  return collectionService.create({
    householdId: requiredNumber(values, 'householdId', 'Household'),
    collectorId,
    scheduledAt: new Date(requiredText(values, 'scheduledAt', 'Scheduled date and time')).toISOString(),
    status: initialCollectionStatus(requiredText(values, 'status', 'Initial status')),
    notes: optionalText(values, 'notes'),
  })
}

async function deleteResource(kind: ResourceKind, id: number) {
  if (kind === 'companies') return companyService.remove(id)
  if (kind === 'representatives') return representativeService.remove(id)
  if (kind === 'collectors') return collectorService.remove(id)
  if (kind === 'households') return householdService.remove(id)
  if (kind === 'bins') return binService.remove(id)
  return collectionService.remove(id)
}

export function ResourcePage({ kind }: { kind: ResourceKind }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [offset, setOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [panel, setPanel] = useState<ResourcePanel | null>(null)
  const [formValues, setFormValues] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState('')
  const canEdit = editableBy(kind, user?.role)
  const canDelete = deletableBy(kind, user?.role)
  const needsOptions = panel?.mode === 'create' || panel?.mode === 'edit'
  const query = useQuery({
    queryKey: [kind, { limit: pageSize, offset }],
    queryFn: () => loadResource(kind, pageSize, offset),
  })
  const companyOptionsQuery = useQuery({
    queryKey: ['resource-options', 'companies'],
    queryFn: () => companyService.list({ limit: 100, offset: 0 }),
    enabled: Boolean(needsOptions && kind === 'representatives'),
  })
  const representativeOptionsQuery = useQuery({
    queryKey: ['resource-options', 'representatives'],
    queryFn: () => representativeService.list({ limit: 100, offset: 0 }),
    enabled: Boolean(needsOptions && kind === 'collectors' && user?.role === 'ADMIN'),
  })
  const collectorOptionsQuery = useQuery({
    queryKey: ['resource-options', 'collectors'],
    queryFn: () => collectorService.list({ limit: 100, offset: 0 }),
    enabled: Boolean(needsOptions && (
      (kind === 'households' && (user?.role === 'ADMIN' || user?.role === 'COMPANY_REPRESENTATIVE'))
      || (kind === 'collections' && user?.role !== 'COLLECTOR')
    )),
  })
  const householdOptionsQuery = useQuery({
    queryKey: ['resource-options', 'households'],
    queryFn: () => householdService.list({ limit: 100, offset: 0 }),
    enabled: Boolean(needsOptions && (kind === 'bins' || kind === 'collections')),
  })
  const collectorProfileQuery = useQuery({
    queryKey: ['auth-profile'],
    queryFn: authService.profile,
    enabled: Boolean(needsOptions && kind === 'collections' && user?.role === 'COLLECTOR'),
  })
  const ownProfile = collectorProfileQuery.data?.profile
  const ownCollectorId = isProfile(ownProfile) ? ownProfile.id : undefined
  const choices = {
    companies: optionList(companyOptionsQuery.data || []),
    representatives: optionList(representativeOptionsQuery.data || []),
    collectors: optionList(collectorOptionsQuery.data || []),
    households: optionList(householdOptionsQuery.data || []),
  }
  const fields = panel && panel.mode !== 'view'
    ? buildFields(kind, panel.mode, user?.role, choices)
    : []
  const unavailableOptions = fields.some((field) => field.type === 'select' && field.options?.length === 0)
  const saveMutation = useMutation({
    mutationFn: () => {
      if (!panel || panel.mode === 'view') throw new Error('Choose an action before saving.')
      return saveResource(kind, panel.mode, resourceId(panel.row), formValues, user?.role, ownCollectorId)
    },
    onSuccess: async () => {
      setPanel(null)
      setFormValues({})
      setNotice(panel?.mode === 'fill' ? 'Recorded fill level updated.' : 'Changes saved successfully.')
      await queryClient.invalidateQueries({ queryKey: [kind] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: number }) => deleteResource(kind, id),
    onSuccess: async () => {
      setNotice(`${singularTitles[kind]} deleted successfully.`)
      await queryClient.invalidateQueries({ queryKey: [kind] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
  const Icon = icons[kind]
  const columns = allowedColumns[kind]
  const filteredRows = useMemo(() => {
    const rows = query.data || []
    const normalized = search.trim().toLowerCase()
    if (!normalized) return rows
    return rows.filter((row) => Object.values(row).some((value) => (
      value !== null && value !== undefined && String(value).toLowerCase().includes(normalized)
    )))
  }, [query.data, search])

  function openPanel(mode: PanelMode, row?: ResourceRow) {
    const formFields: ResourceField[] = mode === 'view' ? [] : buildFields(kind, mode, user?.role, choices)
    const values: Record<string, string> = {}
    for (const field of formFields) {
      const current = row?.[field.name]
      if (field.type === 'datetime-local' && typeof current === 'string' && current) {
        const date = new Date(current)
        values[field.name] = Number.isNaN(date.getTime())
          ? ''
          : new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
      } else {
        values[field.name] = current == null ? '' : String(current)
      }
    }
    setPanel({ mode, row })
    setFormValues(values)
    setNotice('')
    saveMutation.reset()
  }

  function closePanel() {
    setPanel(null)
    setFormValues({})
    saveMutation.reset()
  }

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    saveMutation.mutate()
  }

  function confirmDelete(row: ResourceRow) {
    const id = resourceId(row)
    if (id === undefined) return
    const label = String(row.name || row.fullName || row.binCode || `${singularTitles[kind]} ${id}`)
    if (!window.confirm(`Delete ${label}? This action cannot be undone. Related records may prevent deletion.`)) return
    setNotice('')
    deleteMutation.reset()
    deleteMutation.mutate({ id })
  }

  const optionsError = companyOptionsQuery.error
    || representativeOptionsQuery.error
    || collectorOptionsQuery.error
    || householdOptionsQuery.error
    || collectorProfileQuery.error
  const optionsLoading = companyOptionsQuery.isLoading
    || representativeOptionsQuery.isLoading
    || collectorOptionsQuery.isLoading
    || householdOptionsQuery.isLoading
    || collectorProfileQuery.isLoading

  return (
    <div>
      <PageHeader
        title={titles[kind]}
        description={pageDescriptions[kind]}
        icon={Icon}
        actions={canEdit ? (
          <Button icon={Plus} onClick={() => openPanel('create')}>
            Add {singularTitles[kind]}
          </Button>
        ) : undefined}
      />

      {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {deleteMutation.error && <div className="mb-4"><ErrorState error={deleteMutation.error} /></div>}

      {panel && (
        <Card className="mb-5 p-4 sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {panel.mode === 'view' ? `${singularTitles[kind]} details`
                  : panel.mode === 'fill' ? 'Record bin fill level'
                    : `${panel.mode === 'create' ? 'Add' : 'Edit'} ${singularTitles[kind]}`}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {panel.mode === 'fill'
                  ? 'This saves a manual reading; it does not come from a live sensor.'
                  : panel.mode === 'view'
                    ? 'Record information returned by the SWMS API.'
                    : 'Changes are validated by the server and limited to your account permissions.'}
              </p>
            </div>
            <Button variant="quiet" icon={X} aria-label="Close panel" onClick={closePanel} />
          </div>

          {panel.mode === 'view' ? (
            <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {columns.map((column) => (
                <div key={column} className="min-w-0">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{formatColumn(column)}</dt>
                  <dd className="mt-1 break-words text-sm text-slate-900">
                    {column === 'status' && typeof panel.row?.[column] === 'string'
                      ? <StatusBadge status={String(panel.row[column])} />
                      : formatValue(resourceValue(panel.row, column))}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <form onSubmit={submitForm}>
              {optionsError && <div className="mb-4"><ErrorState error={optionsError} /></div>}
              {unavailableOptions && !optionsLoading && !optionsError && (
                <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  No authorized records are available for a required selection. Add or assign the related record first.
                </p>
              )}
              {panel.mode === 'create' && kind === 'collections' && user?.role === 'COLLECTOR' && (
                <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  This collection will be assigned to your authenticated collector account.
                  {collectorProfileQuery.isLoading ? ' Loading profile…' : ''}
                </p>
              )}
              {panel.mode === 'create' && kind === 'collections' && user?.role === 'COLLECTOR'
                && collectorProfileQuery.error && <div className="mb-4"><ErrorState error={collectorProfileQuery.error} /></div>}
              {panel.mode === 'create' && kind === 'collections' && user?.role === 'COLLECTOR'
                && !collectorProfileQuery.isLoading && !collectorProfileQuery.error && !ownCollectorId && (
                  <p role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    No collector profile is linked to this account, so a collection cannot be assigned.
                  </p>
                )}
              {saveMutation.error && <div className="mb-4"><ErrorState error={saveMutation.error} /></div>}
              <div className="grid gap-4 sm:grid-cols-2">
                {fields.map((field) => (
                  <label key={field.name} className={`block text-sm font-medium text-slate-700 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                    {field.label}{field.required && <span className="ml-1 text-red-600" aria-hidden="true">*</span>}
                    {field.type === 'select' ? (
                      <select
                        required={field.required}
                        value={formValues[field.name] || ''}
                        onChange={(event) => setFormValues((current) => ({ ...current, [field.name]: event.target.value }))}
                        className="app-input mt-1"
                        disabled={saveMutation.isPending || optionsLoading || field.options?.length === 0}
                      >
                        <option value="">{optionsLoading ? 'Loading options…' : 'Select an option'}</option>
                        {(field.options || []).map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        value={formValues[field.name] || ''}
                        onChange={(event) => setFormValues((current) => ({ ...current, [field.name]: event.target.value }))}
                        className="app-input mt-1 min-h-24"
                        disabled={saveMutation.isPending}
                      />
                    ) : (
                      <input
                        type={field.type || 'text'}
                        required={field.required}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        minLength={field.type === 'password' ? 12 : undefined}
                        maxLength={field.type === 'password' ? 128 : undefined}
                        value={formValues[field.name] || ''}
                        onChange={(event) => setFormValues((current) => ({ ...current, [field.name]: event.target.value }))}
                        className="app-input mt-1"
                        disabled={saveMutation.isPending}
                      />
                    )}
                    {field.help && <span className="mt-1 block text-xs font-normal text-slate-500">{field.help}</span>}
                  </label>
                ))}
              </div>
              {kind === 'bins' && panel.mode === 'edit' && (
                <p className="mt-4 text-xs text-slate-500">Recorded fill level is updated separately and is not part of bin metadata.</p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={closePanel} disabled={saveMutation.isPending}>Cancel</Button>
                <Button type="submit" disabled={saveMutation.isPending || Boolean(optionsError) || optionsLoading || unavailableOptions
                  || (panel.mode === 'create' && kind === 'collections' && user?.role === 'COLLECTOR' && !ownCollectorId)}>
                  {saveMutation.isPending ? 'Saving…' : panel.mode === 'fill' ? 'Save reading' : panel.mode === 'create' ? 'Create record' : 'Save changes'}
                </Button>
              </div>
            </form>
          )}
        </Card>
      )}

      {kind === 'bins' && (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
          <p>Fill levels shown are stored bin records. Live sensor telemetry and last-device updates are not connected.</p>
        </div>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">{titles[kind]}</h2>
            <p className="mt-1 text-xs text-slate-500">Records are scoped by your account permissions.</p>
          </div>
          <label className="relative block w-full sm:max-w-xs">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Filter this page of ${titles[kind].toLowerCase()}…`}
              aria-label={`Filter current page of ${titles[kind].toLowerCase()}`}
              className="app-input h-10 pl-9"
            />
          </label>
        </div>

        {query.isLoading && <div className="p-4"><LoadingState label={`Loading ${titles[kind].toLowerCase()}…`} /></div>}
        {query.error && <div className="p-4"><ErrorState error={query.error} /></div>}
        {query.data && query.data.length === 0 && <div className="p-4"><EmptyState label={`No ${titles[kind].toLowerCase()} are available in this authorized scope.`} /></div>}
        {query.data && query.data.length > 0 && filteredRows.length === 0 && (
          <div className="p-4"><EmptyState title="No matching records" label="Try a different search term. Search is limited to the currently loaded page." /></div>
        )}
        {filteredRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="app-table min-w-[54rem]">
              <thead>
                <tr>
                  {columns.map((column) => <th key={column}>{formatColumn(column)}</th>)}
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row, index) => (
                  <tr key={row.id ?? `${kind}-${offset}-${index}`}>
                    {columns.map((column) => (
                      <td key={column} className={column === 'fullName' || column === 'name' ? 'font-medium text-slate-900' : ''}>
                        <ResourceCell
                          column={column}
                          value={resourceValue(row, column)}
                        />
                      </td>
                    ))}
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="quiet" icon={Eye} className="min-h-9 px-2"
                          aria-label={`View ${singularTitles[kind]} details`}
                          onClick={() => openPanel('view', row)} />
                        {canEdit && (
                          <Button variant="quiet" icon={Pencil} className="min-h-9 px-2"
                            aria-label={`Edit ${singularTitles[kind]}`}
                            disabled={resourceId(row) === undefined}
                            onClick={() => openPanel('edit', row)} />
                        )}
                        {kind === 'bins' && canEdit && (
                          <Button variant="quiet" icon={Gauge} className="min-h-9 px-2"
                            aria-label="Record bin fill level" title="Record fill level"
                            onClick={() => openPanel('fill', row)} />
                        )}
                        {canDelete && (
                          <Button variant="quiet" icon={Trash2} className="min-h-9 px-2 text-red-700 hover:bg-red-50"
                            aria-label={`Delete ${singularTitles[kind]}`}
                            disabled={resourceId(row) === undefined || deleteMutation.isPending || (kind === 'collections'
                              && ['in_progress', 'collected', 'completed'].includes(String(row.status)))}
                            onClick={() => confirmDelete(row)} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {query.data && query.data.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-slate-500">
              Page {Math.floor(offset / pageSize) + 1} · {filteredRows.length} shown
              {search.trim() ? ' (filtered)' : ''}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" icon={ArrowLeft} disabled={offset === 0}
                onClick={() => setOffset((value) => Math.max(0, value - pageSize))}>
                Previous
              </Button>
              <Button variant="secondary" icon={ArrowRight} disabled={query.data.length < pageSize}
                onClick={() => setOffset((value) => value + pageSize)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
