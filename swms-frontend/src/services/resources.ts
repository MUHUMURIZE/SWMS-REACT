import { api, unwrap } from '../lib/api'
import type {
  Bin,
  BinAlert,
  Collection,
  Collector,
  Company,
  District,
  DistrictAgreement,
  DeviceEnrollment,
  Household,
  Notification,
  ManagedDevice,
  Pagination,
  Representative,
  User,
  Vehicle,
  VehicleLocation,
  VehicleTracking,
  VehicleAssignment,
  VehicleMaintenance,
  VehicleStatus,
} from '../types/api'

const params = (pagination: Pagination) => ({
  limit: pagination.limit,
  offset: pagination.offset,
})

export interface LocationInput {
  district?: string
  sector?: string
  cell?: string
  village?: string
}

export const authService = {
  profile: async () => unwrap<{ user: User; profile: unknown }>(
    (await api.get('/api/auth/profile')).data,
  ),
  updateProfile: async (body: { fullName?: string; phone?: string }) =>
    unwrap<{ user: User }>((await api.put('/api/auth/profile', body)).data),
  changePassword: async (body: { currentPassword: string; newPassword: string }) =>
    unwrap<{ message: string }>((await api.put('/api/auth/change-password', body)).data),
}

export const dashboardService = {
  admin: async () => unwrap<Record<string, unknown>>((await api.get('/api/dashboard/admin')).data),
  company: async () => unwrap<Record<string, unknown>>((await api.get('/api/dashboard/company')).data),
  collector: async () => unwrap<Record<string, unknown>>((await api.get('/api/dashboard/collector')).data),
  household: async () => unwrap<Record<string, unknown>>((await api.get('/api/dashboard/household')).data),
}

export const companyService = {
  list: async (pagination: Pagination) =>
    unwrap<Company[]>((await api.get('/api/companies', { params: params(pagination) })).data),
  create: async (body: { name: string } & LocationInput) =>
    unwrap<Company>((await api.post('/api/companies', body)).data),
  update: async (id: number, body: { name?: string } & LocationInput) =>
    unwrap<Company>((await api.put(`/api/companies/${id}`, body)).data),
  remove: async (id: number) => unwrap<{ message: string }>(
    (await api.delete(`/api/companies/${id}`)).data,
  ),
}

export const districtService = {
  list: async (pagination: Pagination) =>
    unwrap<District[]>((await api.get('/api/districts', { params: params(pagination) })).data),
  agreements: async (pagination: Pagination) =>
    unwrap<DistrictAgreement[]>(
      (await api.get('/api/districts/agreements', { params: params(pagination) })).data,
    ),
  create: async (name: string) =>
    unwrap<District>((await api.post('/api/districts', { name })).data),
  createAgreement: async (districtId: number, body: { companyId: number; startsOn: string; endsOn?: string }) =>
    unwrap<DistrictAgreement>(
      (await api.post(`/api/districts/${districtId}/agreements`, body)).data,
    ),
  transitionAgreement: async (
    agreementId: number,
    body: { status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED'; reason?: string },
  ) => unwrap<DistrictAgreement>(
    (await api.post(`/api/districts/agreements/${agreementId}/status`, body)).data,
  ),
}

export const representativeService = {
  list: async (pagination: Pagination) =>
    unwrap<Representative[]>((await api.get('/api/representatives', { params: params(pagination) })).data),
  create: async (body: {
    fullName: string
    email: string
    password: string
    phone?: string
    companyId: number
  } & LocationInput) =>
    unwrap<Representative>((await api.post('/api/representatives', body)).data),
  update: async (id: number, body: {
    fullName?: string
    phone?: string
    companyId?: number
  } & LocationInput) =>
    unwrap<Representative>((await api.put(`/api/representatives/${id}`, body)).data),
  remove: async (id: number) => unwrap<{ message: string }>(
    (await api.delete(`/api/representatives/${id}`)).data,
  ),
}

export const collectorService = {
  list: async (pagination: Pagination) =>
    unwrap<Collector[]>((await api.get('/api/collectors', { params: params(pagination) })).data),
  create: async (body: {
    fullName: string
    email: string
    password: string
    phone?: string
    representativeId?: number
  } & LocationInput) =>
    unwrap<Collector>((await api.post('/api/collectors', body)).data),
  update: async (id: number, body: {
    fullName?: string
    phone?: string
    representativeId?: number
  } & LocationInput) =>
    unwrap<Collector>((await api.put(`/api/collectors/${id}`, body)).data),
  remove: async (id: number) => unwrap<{ message: string }>(
    (await api.delete(`/api/collectors/${id}`)).data,
  ),
}

export interface VehicleInput {
  companyId?: number
  registrationNumber: string
  vehicleType: string
  make?: string
  model?: string
  capacity: number
  fuelType: Vehicle['fuelType']
  registrationExpiresOn?: string
  insuranceExpiresOn?: string
  inspectionExpiresOn?: string
}

export type VehicleUpdateInput = Partial<Omit<VehicleInput, 'companyId'>>

export const vehicleService = {
  list: async (pagination: Pagination) =>
    unwrap<Vehicle[]>((await api.get('/api/vehicles', { params: params(pagination) })).data),
  create: async (body: VehicleInput) =>
    unwrap<Vehicle>((await api.post('/api/vehicles', body)).data),
  update: async (id: number, body: VehicleUpdateInput) =>
    unwrap<Vehicle>((await api.put(`/api/vehicles/${id}`, body)).data),
  setStatus: async (id: number, status: Exclude<VehicleStatus, 'IN_SERVICE'>) =>
    unwrap<Vehicle>((await api.put(`/api/vehicles/${id}/status`, { status })).data),
  assign: async (id: number, collectorId: number) =>
    unwrap<Vehicle>((await api.put(`/api/vehicles/${id}/assignment`, { collectorId })).data),
  unassign: async (id: number) =>
    unwrap<Vehicle>((await api.delete(`/api/vehicles/${id}/assignment`)).data),
  assignments: async (id: number, pagination: Pagination) =>
    unwrap<VehicleAssignment[]>(
      (await api.get(`/api/vehicles/${id}/assignments`, { params: params(pagination) })).data,
    ),
  maintenance: async (id: number, pagination: Pagination) =>
    unwrap<VehicleMaintenance[]>(
      (await api.get(`/api/vehicles/${id}/maintenance`, { params: params(pagination) })).data,
    ),
  scheduleMaintenance: async (id: number, body: {
    description: string
    serviceProvider?: string
    scheduledFor: string
    cost?: number
    odometerKm?: number
  }) => unwrap<VehicleMaintenance>(
    (await api.post(`/api/vehicles/${id}/maintenance`, body)).data,
  ),
  updateMaintenanceStatus: async (
    id: number,
    maintenanceId: number,
    status: 'COMPLETED' | 'CANCELLED',
  ) => unwrap<VehicleMaintenance>(
    (await api.put(`/api/vehicles/${id}/maintenance/${maintenanceId}/status`, { status })).data,
  ),
}

export const trackingService = {
  map: async () => unwrap<VehicleTracking[]>((await api.get('/api/tracking/map')).data),
  latest: async (vehicleId: number) =>
    unwrap<{
      vehicleId: number
      trackingStatus: VehicleTracking['trackingStatus']
      lastCommunicationAt: string | null
      location: Pick<VehicleTracking, 'latitude' | 'longitude' | 'speed' | 'heading' | 'accuracy' | 'recordedAt' | 'receivedAt'> | null
    }>((await api.get(`/api/tracking/vehicles/${vehicleId}/location`)).data),
  history: async (vehicleId: number, pagination: Pagination) =>
    unwrap<VehicleLocation[]>((await api.get(`/api/tracking/vehicles/${vehicleId}/history`, {
      params: params(pagination),
    })).data),
  devices: async (pagination: Pagination) =>
    unwrap<ManagedDevice[]>((await api.get('/api/tracking/devices', {
      params: params(pagination),
    })).data),
  registerDevice: async (deviceCode: string) =>
    unwrap<DeviceEnrollment>(
      (await api.post('/api/tracking/devices', { deviceCode })).data,
    ),
  associateDevice: async (deviceId: number, vehicleId: number) =>
    unwrap<ManagedDevice>(
      (await api.put(`/api/tracking/devices/${deviceId}/vehicle`, { resourceId: vehicleId })).data,
    ),
  rotateCredential: async (deviceId: number) =>
    unwrap<{ id: number; credential: string }>(
      (await api.post(`/api/tracking/devices/${deviceId}/rotate-credential`)).data,
    ),
  revokeDevice: async (deviceId: number) =>
    (await api.delete(`/api/tracking/devices/${deviceId}`)).data,
}

export const iotService = {
  devices: async (pagination: Pagination) =>
    unwrap<ManagedDevice[]>((await api.get('/api/iot/devices', {
      params: params(pagination),
    })).data),
  alerts: async (pagination: Pagination) =>
    unwrap<BinAlert[]>((await api.get('/api/iot/alerts', {
      params: params(pagination),
    })).data),
  latest: async (binId: number) =>
    unwrap<{
      binId: number
      deviceStatus: 'NOT_CONFIGURED' | 'ONLINE' | 'OFFLINE'
      lastCommunicationAt: string | null
      reading: {
        fillLevel: number
        batteryLevel: number | null
        sensorStatus: 'OK' | 'DEGRADED' | 'FAULT'
        overflowDetected: boolean | null
        measuredAt: string
        receivedAt: string
      } | null
    }>((await api.get(`/api/iot/bins/${binId}/latest`)).data),
  history: async (binId: number, pagination: Pagination) =>
    unwrap<Array<{
      id: number
      binId: number
      fillLevel: number
      batteryLevel: number | null
      sensorStatus: 'OK' | 'DEGRADED' | 'FAULT'
      overflowDetected: boolean | null
      measuredAt: string
      receivedAt: string
    }>>((await api.get(`/api/iot/bins/${binId}/readings`, {
      params: params(pagination),
    })).data),
  registerDevice: async (deviceCode: string) =>
    unwrap<DeviceEnrollment>(
      (await api.post('/api/iot/devices', { deviceCode })).data,
    ),
  associateDevice: async (deviceId: number, binId: number) =>
    unwrap<ManagedDevice>(
      (await api.put(`/api/iot/devices/${deviceId}/bin`, { resourceId: binId })).data,
    ),
  rotateCredential: async (deviceId: number) =>
    unwrap<{ id: number; credential: string }>(
      (await api.post(`/api/iot/devices/${deviceId}/rotate-credential`)).data,
    ),
  revokeDevice: async (deviceId: number) =>
    (await api.delete(`/api/iot/devices/${deviceId}`)).data,
}

export const householdService = {
  list: async (pagination: Pagination) =>
    unwrap<Household[]>((await api.get('/api/households', { params: params(pagination) })).data),
  create: async (body: {
    fullName: string
    email: string
    password: string
    phone?: string
    collectorId?: number
    address: string
    nationalId?: string
  } & LocationInput) =>
    unwrap<Household>((await api.post('/api/households', body)).data),
  update: async (id: number, body: {
    fullName?: string
    phone?: string
    address?: string
    nationalId?: string
  } & LocationInput) =>
    unwrap<Household>((await api.put(`/api/households/${id}`, body)).data),
  remove: async (id: number) => unwrap<{ message: string }>(
    (await api.delete(`/api/households/${id}`)).data,
  ),
  me: async () => unwrap<{ user: User; profile: Household }>((await api.get('/api/households/me')).data),
  updateMe: async (body: Partial<Household>) =>
    unwrap<{ user: User; profile: Household }>((await api.put('/api/households/me', body)).data),
}

export const binService = {
  list: async (pagination: Pagination) =>
    unwrap<Bin[]>((await api.get('/api/bins', { params: params(pagination) })).data),
  create: async (body: { householdId: number; binCode: string; capacity: number }) =>
    unwrap<Bin>((await api.post('/api/bins', body)).data),
  update: async (id: number, body: { binCode?: string; capacity?: number }) =>
    unwrap<Bin>((await api.put(`/api/bins/${id}`, body)).data),
  remove: async (id: number) => unwrap<{ message: string }>(
    (await api.delete(`/api/bins/${id}`)).data,
  ),
  full: async (pagination: Pagination) =>
    unwrap<Bin[]>((await api.get('/api/bins/full', { params: params(pagination) })).data),
  myBin: async () => unwrap<Bin>((await api.get('/api/my-bin')).data),
  updateProgress: async (id: number, fillLevel: number) =>
    unwrap<Bin>((await api.put(`/api/bins/${id}/progress`, { fillLevel })).data),
  empty: async (id: number) => unwrap<Bin>((await api.put(`/api/bins/${id}/empty`)).data),
}

export const collectionService = {
  list: async (pagination: Pagination) =>
    unwrap<Collection[]>((await api.get('/api/collections', { params: params(pagination) })).data),
  create: async (body: {
    householdId: number
    collectorId: number
    scheduledAt: string
    status?: 'pending' | 'scheduled'
    notes?: string
  }) =>
    unwrap<Collection>((await api.post('/api/collections', body)).data),
  update: async (id: number, body: {
    scheduledAt?: string
    status?: Collection['status']
    notes?: string
  }) =>
    unwrap<Collection>((await api.put(`/api/collections/${id}`, body)).data),
  remove: async (id: number) => unwrap<{ message: string }>(
    (await api.delete(`/api/collections/${id}`)).data,
  ),
  scheduling: async (kind: 'upcoming' | 'missed' | 'overdue' | 'rescheduled', pagination: Pagination) =>
    unwrap<Collection[]>(
      (await api.get(`/api/collections/scheduling/${kind}`, { params: params(pagination) })).data,
    ),
  updateStatus: async (id: number, status: Collection['status']) =>
    unwrap<Collection>((await api.put(`/api/collections/${id}/status`, { status })).data),
  myProgress: async () =>
    unwrap<{ counts: Array<{ status: Collection['status']; count: number }> }>(
      (await api.get('/api/my-progress')).data,
    ),
}

export const notificationService = {
  list: async (pagination: Pagination) =>
    unwrap<Notification[]>(
      (await api.get('/api/notifications', { params: params(pagination) })).data,
    ),
  markRead: async (id: number) =>
    unwrap<{ id: number; read: boolean }>((await api.put(`/api/notifications/${id}/read`)).data),
}

export const reportService = {
  district: async (district?: string) =>
    unwrap<Record<string, unknown>>((await api.get('/api/reports/district', { params: { district } })).data),
  sector: async (sector?: string) =>
    unwrap<Record<string, unknown>>((await api.get('/api/reports/sector', { params: { sector } })).data),
  company: async (companyId?: number) =>
    unwrap<Record<string, unknown>>((await api.get('/api/reports/company', { params: { companyId } })).data),
  collector: async (collectorId: number) =>
    unwrap<Record<string, unknown>>((await api.get('/api/reports/collector', { params: { collectorId } })).data),
}

export const exportService = {
  download: async (
    resource: 'companies' | 'collectors' | 'households' | 'bins' | 'collections',
    format: 'csv' | 'xlsx' | 'pdf',
  ) => {
    const response = await api.get(`/api/exports/${resource}/${format}`, {
      responseType: 'blob',
    })
    const blob = response.data as Blob
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${resource}.${format === 'xlsx' ? 'xlsx' : format}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  },
}
