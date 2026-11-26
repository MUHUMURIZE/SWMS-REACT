export type UserRole = 'ADMIN' | 'COMPANY_REPRESENTATIVE' | 'COLLECTOR' | 'HOUSEHOLD'

export interface User {
  id: number
  fullName: string
  email: string
  role: UserRole
  phone?: string | null
  tokenVersion?: number
}

export interface LoginResponse {
  user: User
  accessToken: string
  tokenType: 'Bearer'
  expiresIn: number
}

export interface Pagination {
  limit: number
  offset: number
}

export interface ApiError {
  status: number
  code: string
  message: string
  details?: unknown[]
}

export interface Company {
  id: number
  name: string
  district?: string
  sector?: string
  cell?: string
  village?: string
  createdAt?: string
  updatedAt?: string
}

export interface District {
  id: number
  name: string
  assignmentStatus: 'UNASSIGNED' | 'ASSIGNED'
  agreementCount: number
  activeAgreementCount: number
}

export interface DistrictAgreement {
  id: number
  districtId: number
  districtName: string
  companyId: number
  companyName: string
  status: 'PENDING' | 'ACTIVE' | 'EXPIRED' | 'SUSPENDED' | 'TERMINATED'
  startsOn: string
  endsOn: string | null
  activatedAt: string | null
  endedAt: string | null
  createdAt: string
}

export interface Representative {
  id: number
  fullName: string
  email: string
  phone?: string
  companyId: number
  district?: string
  sector?: string
  cell?: string
  village?: string
  companyName?: string
}

export interface Collector {
  id: number
  fullName: string
  email: string
  phone?: string
  representativeId: number
  district?: string
  sector?: string
  cell?: string
  village?: string
  companyId?: number
  representativeName?: string
}

export type VehicleStatus = 'AVAILABLE' | 'IN_SERVICE' | 'MAINTENANCE' | 'INACTIVE'
export type VehicleFuelType = 'DIESEL' | 'PETROL' | 'ELECTRIC' | 'HYBRID' | 'CNG' | 'OTHER'

export interface Vehicle {
  id: number
  companyId: number
  registrationNumber: string
  vehicleType: string
  make: string | null
  model: string | null
  capacity: number
  fuelType: VehicleFuelType
  status: VehicleStatus
  registrationExpiresOn: string | null
  insuranceExpiresOn: string | null
  inspectionExpiresOn: string | null
  assignedCollectorId: number | null
  assignedCollectorName: string | null
  assignedCollectorDistrict?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface VehicleAssignment {
  id: number
  collectorId: number | null
  collectorName: string
  assignedBy: number | null
  assignedAt: string
  unassignedBy: number | null
  unassignedAt: string | null
}

export type VehicleMaintenanceStatus = 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'

export interface VehicleMaintenance {
  id: number
  description: string
  serviceProvider: string | null
  scheduledFor: string
  status: VehicleMaintenanceStatus
  cost: number | null
  odometerKm: number | null
  completedAt: string | null
  createdAt?: string
}

export interface Household {
  id: number
  fullName: string
  email: string
  phone?: string
  collectorId: number
  address: string
  nationalId?: string
  district?: string
  sector?: string
  cell?: string
  village?: string
  collectorName?: string
  companyId?: number
}

export interface Bin {
  id: number
  householdId: number
  binCode: string
  capacity: number
  fillLevel: number
  status: 'EMPTY' | 'LOW' | 'MEDIUM' | 'HIGH' | 'FULL' | 'MAINTENANCE'
  householdName?: string
  collectorId?: number
  companyId?: number
  district?: string
  sensorDeviceStatus?: 'NOT_CONFIGURED' | 'ONLINE' | 'OFFLINE'
  lastCommunicationAt?: string | null
  sensorFillLevel?: number | null
  batteryLevel?: number | null
  sensorStatus?: 'OK' | 'DEGRADED' | 'FAULT' | null
  overflowDetected?: boolean | null
  sensorMeasuredAt?: string | null
}

export interface VehicleTracking {
  vehicleId: number
  registrationNumber: string
  companyId: number
  collectorId: number | null
  collectorName: string | null
  district: string | null
  trackingStatus: 'NOT_CONFIGURED' | 'ONLINE' | 'OFFLINE'
  lastCommunicationAt: string | null
  latitude: number | null
  longitude: number | null
  speed: number | null
  heading: number | null
  accuracy: number | null
  recordedAt: string | null
  receivedAt: string | null
}

export interface VehicleLocation {
  id: number
  deviceId: number
  vehicleId: number
  messageId: string
  latitude: number
  longitude: number
  speed: number | null
  heading: number | null
  accuracy: number | null
  recordedAt: string
  receivedAt: string
}

export interface ManagedDevice {
  id: number
  deviceCode: string
  deviceType: 'GPS' | 'BIN'
  vehicleId: number | null
  binId: number | null
  status: 'ACTIVE' | 'REVOKED'
  trackingStatus: 'ONLINE' | 'OFFLINE' | 'REVOKED'
  lastCommunicationAt: string | null
}

export interface DeviceEnrollment {
  id: number
  deviceCode: string
  deviceType: 'GPS' | 'BIN'
  status: 'ACTIVE' | 'REVOKED'
  createdAt: string
  credential: string
}

export interface BinAlert {
  binId: number
  binCode: string
  district: string
  alertType: 'FULL' | 'OVERFLOW' | 'SENSOR_FAULT' | 'DEVICE_OFFLINE'
  lastCommunicationAt: string | null
  measuredAt: string | null
  fillLevel: number | null
}

export type CollectionStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'collected'
  | 'completed'
  | 'missed'
  | 'cancelled'

export interface Collection {
  id: number
  householdId: number
  collectorId: number
  scheduledAt: string
  status: CollectionStatus
  notes?: string
  collectedAt?: string
  rescheduledAt?: string
  originalScheduledAt?: string
  householdName?: string
  collectorName?: string
  district?: string
}

export interface Notification {
  id: number
  title: string
  message: string
  category?: string
  priority: string
  readAt?: string
  createdAt: string
}
