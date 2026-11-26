import { RadioTower } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Card, PageHeader, StatusBadge } from '../components/ui'
import { iotService } from '../services/resources'
import type { ApiError, BinAlert, ManagedDevice } from '../types/api'

const page = { limit: 50, offset: 0 }

function asError(error: unknown): ApiError | Error | null {
  if (error instanceof Error) return error
  if (typeof error === 'object' && error !== null && 'message' in error
    && typeof error.message === 'string' && 'status' in error && typeof error.status === 'number'
    && 'code' in error && typeof error.code === 'string') {
    return {
      status: error.status,
      message: error.message,
      code: error.code,
      ...('details' in error && Array.isArray(error.details) ? { details: error.details } : {}),
    } satisfies ApiError
  }
  return error ? new Error('Smart-bin monitoring could not be loaded.') : null
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No communication recorded'
}

function DeviceTable({ devices }: { devices: ManagedDevice[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3">Device</th>
            <th scope="col" className="px-5 py-3">Bin</th>
            <th scope="col" className="px-5 py-3">Status</th>
            <th scope="col" className="px-5 py-3">Last communication</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {devices.map((device) => (
            <tr key={device.id}>
              <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{device.deviceCode}</td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {device.binId === null ? 'Not associated' : `Bin ${device.binId}`}
              </td>
              <td className="whitespace-nowrap px-5 py-4">
                <StatusBadge status={device.trackingStatus} />
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {dateLabel(device.lastCommunicationAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function AlertsTable({ alerts }: { alerts: BinAlert[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3">Alert</th>
            <th scope="col" className="px-5 py-3">Bin</th>
            <th scope="col" className="px-5 py-3">Fill reading</th>
            <th scope="col" className="px-5 py-3">Last communication</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {alerts.map((alert, index) => (
            <tr key={`${alert.binId}-${alert.alertType}-${index}`}>
              <td className="whitespace-nowrap px-5 py-4"><StatusBadge status={alert.alertType} /></td>
              <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{alert.binCode}</td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {alert.fillLevel === null ? 'No reading' : `${alert.fillLevel}%`}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {dateLabel(alert.lastCommunicationAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function IoTDevicesPage() {
  const devices = useQuery({
    queryKey: ['iot', 'devices'],
    queryFn: () => iotService.devices(page),
    refetchInterval: 30_000,
  })
  const alerts = useQuery({
    queryKey: ['iot', 'alerts'],
    queryFn: () => iotService.alerts(page),
    refetchInterval: 30_000,
  })

  return (
    <div>
      <PageHeader
        title="Smart-bin monitoring"
        description="Registered sensor status and current alerts in your authorized operating scope."
        icon={RadioTower}
      />

      <section aria-labelledby="iot-alerts-title">
        <div className="mb-4">
          <h2 id="iot-alerts-title" className="text-base font-semibold text-slate-900">Current alerts</h2>
          <p className="mt-1 text-sm text-slate-500">
            Full bins, sensor-reported overflow, sensor faults, and devices past the configured communication window.
          </p>
        </div>
        {alerts.isLoading && <LoadingState label="Loading sensor alerts..." />}
        {alerts.isError && <ErrorState error={asError(alerts.error)} />}
        {alerts.isSuccess && alerts.data.length === 0 && (
          <EmptyState title="No active alerts" label="There are no active alerts for your authorized bins." />
        )}
        {alerts.isSuccess && alerts.data.length > 0 && (
          <Card className="overflow-hidden p-0"><AlertsTable alerts={alerts.data} /></Card>
        )}
      </section>

      <section className="mt-8" aria-labelledby="iot-devices-title">
        <div className="mb-4">
          <h2 id="iot-devices-title" className="text-base font-semibold text-slate-900">Sensor devices</h2>
          <p className="mt-1 text-sm text-slate-500">
            Only enrolled hardware is listed. Offline and unassociated devices are identified explicitly.
          </p>
        </div>
        {devices.isLoading && <LoadingState label="Loading registered sensor devices..." />}
        {devices.isError && <ErrorState error={asError(devices.error)} />}
        {devices.isSuccess && devices.data.length === 0 && (
          <EmptyState
            title="No registered sensor devices"
            label="No smart-bin devices have been registered in this scope. Sensor readings will appear after hardware is enrolled and sends telemetry."
          />
        )}
        {devices.isSuccess && devices.data.length > 0 && (
          <Card className="overflow-hidden p-0"><DeviceTable devices={devices.data} /></Card>
        )}
      </section>
    </div>
  )
}
