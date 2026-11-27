import { useMemo, useState } from 'react'
import { Activity, BatteryCharging, MapPin, RadioTower } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { DeviceCredentialManager } from '../components/DeviceCredentialManager'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { SwmsMap, type MapPin as SwmsMapPin } from '../components/SwmsMap'
import { Button, Card, PageHeader, StatusBadge } from '../components/ui'
import { binService, iotService } from '../services/resources'
import type { ApiError, Bin, BinAlert } from '../types/api'

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

function dateLabel(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : 'No communication recorded'
}

function pinToneForBin(bin: Bin): SwmsMapPin['tone'] {
  if (bin.sensorDeviceStatus === 'OFFLINE' || bin.status === 'FULL') return 'rose'
  if (bin.status === 'HIGH') return 'orange'
  if (bin.status === 'MEDIUM') return 'amber'
  if (bin.sensorDeviceStatus === 'NOT_CONFIGURED') return 'slate'
  return 'emerald'
}

function AlertsTable({ alerts, onSelectBin }: { alerts: BinAlert[]; onSelectBin: (binId: number) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-5 py-3">Alert</th>
            <th scope="col" className="px-5 py-3">Bin</th>
            <th scope="col" className="px-5 py-3">Source</th>
            <th scope="col" className="px-5 py-3">Fill reading</th>
            <th scope="col" className="px-5 py-3">Last communication</th>
            <th scope="col" className="px-5 py-3 text-right">Inspect</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {alerts.map((alert, index) => (
            <tr key={`${alert.binId}-${alert.alertType}-${index}`}>
              <td className="whitespace-nowrap px-5 py-4"><StatusBadge status={alert.alertType} /></td>
              <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">{alert.binCode}</td>
              <td className="whitespace-nowrap px-5 py-4">
                <span className={`inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${
                  alert.isSimulated
                    ? 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-600/20'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {alert.isSimulated ? 'SIMULATED' : 'PHYSICAL'}
                </span>
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {alert.fillLevel === null ? 'No reading' : `${alert.fillLevel}%`}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                {dateLabel(alert.lastCommunicationAt)}
              </td>
              <td className="whitespace-nowrap px-5 py-4 text-right">
                <Button variant="secondary" className="min-h-8 px-2.5 py-1 text-xs" onClick={() => onSelectBin(alert.binId)}>
                  Inspect
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function IoTDevicesPage() {
  const { user } = useAuth()
  const isManager = user?.role === 'ADMIN' || user?.role === 'COMPANY_REPRESENTATIVE'
  const [selectedBinId, setSelectedBinId] = useState<number | null>(null)

  const binsQuery = useQuery({
    queryKey: ['bins', { limit: 100, offset: 0 }],
    queryFn: () => binService.list({ limit: 100, offset: 0 }),
    refetchInterval: 10_000,
  })
  const alerts = useQuery({
    queryKey: ['iot', 'alerts'],
    queryFn: () => iotService.alerts(page),
    refetchInterval: 10_000,
  })
  const devices = useQuery({
    queryKey: ['iot', 'devices'],
    queryFn: () => iotService.devices(page),
    enabled: isManager,
    refetchInterval: 10_000,
  })

  const activeBinId = selectedBinId ?? binsQuery.data?.[0]?.id ?? null

  const latestReading = useQuery({
    queryKey: ['iot', 'latest', activeBinId],
    queryFn: () => iotService.latest(activeBinId!),
    enabled: activeBinId !== null,
    refetchInterval: 10_000,
  })

  const readingHistory = useQuery({
    queryKey: ['iot', 'readings', activeBinId],
    queryFn: () => iotService.history(activeBinId!, page),
    enabled: activeBinId !== null,
    refetchInterval: 10_000,
  })

  const mapPins = useMemo<SwmsMapPin[]>(() => (
    (binsQuery.data || [])
      .filter((bin) => bin.latitude != null && bin.longitude != null)
      .map((bin) => ({
        id: bin.id,
        latitude: bin.latitude!,
        longitude: bin.longitude!,
        label: `${bin.binCode}${bin.sensorIsSimulated ? ' [SIMULATED]' : ''}`,
        tone: pinToneForBin(bin),
        selected: bin.id === activeBinId,
        onSelect: () => setSelectedBinId(bin.id),
        popup: (
          <div className="mt-1 space-y-1">
            <div>Household: <strong>{bin.householdName || `Household #${bin.householdId}`}</strong></div>
            {bin.householdAddress && <div>{bin.householdAddress}</div>}
            <div>Fill: <strong>{bin.fillLevel}%</strong> ({bin.status})</div>
            <div>Sensor: <strong>{bin.sensorDeviceStatus || 'NOT_CONFIGURED'}</strong></div>
            {bin.batteryLevel != null && <div>Battery: {bin.batteryLevel}%</div>}
            {bin.sensorStatus && <div>Health: {bin.sensorStatus}</div>}
            <div className="text-[11px] text-slate-500">Last comm: {dateLabel(bin.lastCommunicationAt)}</div>
          </div>
        ),
      }))
  ), [binsQuery.data, activeBinId])

  const activeBin = binsQuery.data?.find((b) => b.id === activeBinId) || null

  return (
    <div>
      <PageHeader
        eyebrow="IoT telemetry"
        title="Smart-bin monitoring"
        description="Authorized bin locations, fill levels, sensor health, battery status, and active hardware alerts."
        icon={RadioTower}
      />

      <Card className="mb-7 p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold text-slate-900">Authorized bin locations & status map</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Bin positions come from captured household/bin GPS coordinates; fill levels and health reflect latest sensor readings.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-forest-800" /> Empty/Low</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-700" /> Medium</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-700" /> High</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-700" /> Full/Offline</span>
          </div>
        </div>
        {binsQuery.isLoading && <LoadingState label="Loading authorized bin coordinates..." />}
        {binsQuery.isError && <ErrorState error={asError(binsQuery.error)} />}
        {binsQuery.isSuccess && (
          <SwmsMap
            pins={mapPins}
            emptyMessage="No authorized bins have stored geographic coordinates yet. Capture bin coordinates on the Smart bins page."
          />
        )}
      </Card>

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
          <Card className="overflow-hidden p-0">
            <AlertsTable alerts={alerts.data} onSelectBin={(id) => setSelectedBinId(id)} />
          </Card>
        )}
      </section>

      <section className="mt-8" aria-labelledby="iot-bins-title">
        <div className="mb-4">
          <h2 id="iot-bins-title" className="text-base font-semibold text-slate-900">Authorized smart bins & telemetry</h2>
          <p className="mt-1 text-sm text-slate-500">
            Select a bin to inspect its latest sensor reading, battery, sensor health, and telemetry history.
          </p>
        </div>
        {binsQuery.isSuccess && binsQuery.data.length === 0 && (
          <EmptyState title="No authorized bins" label="There are no waste bins in your current operating scope." />
        )}
        {binsQuery.isSuccess && binsQuery.data.length > 0 && (
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-3">Bin</th>
                    <th scope="col" className="px-5 py-3">Household</th>
                    <th scope="col" className="px-5 py-3">Fill & status</th>
                    <th scope="col" className="px-5 py-3">Sensor state</th>
                    <th scope="col" className="px-5 py-3">Battery / Health</th>
                    <th scope="col" className="px-5 py-3">Location</th>
                    <th scope="col" className="px-5 py-3">Last communication</th>
                    <th scope="col" className="px-5 py-3 text-right">Inspect</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {binsQuery.data.map((bin) => {
                    const selected = bin.id === activeBinId
                    return (
                      <tr key={bin.id} className={selected ? 'bg-emerald-50/40' : ''}>
                        <td className="whitespace-nowrap px-5 py-3.5 font-medium text-slate-900">
                          <div className="flex items-center gap-2">
                            <span>{bin.binCode}</span>
                            {bin.sensorIsSimulated && (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[0.65rem] font-semibold text-violet-800 ring-1 ring-inset ring-violet-600/20">
                                SIMULATED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">
                          {bin.householdName || `Household #${bin.householdId}`}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-900">{bin.fillLevel}%</span>
                            <StatusBadge status={bin.status} />
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <StatusBadge status={bin.sensorDeviceStatus || 'NOT_CONFIGURED'} />
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-600">
                          {bin.batteryLevel != null ? `${bin.batteryLevel}%` : '—'}
                          {bin.sensorStatus ? ` · ${bin.sensorStatus}` : ''}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 font-mono text-xs text-slate-600">
                          {bin.latitude != null && bin.longitude != null
                            ? `${bin.latitude.toFixed(5)}, ${bin.longitude.toFixed(5)}`
                            : 'Not captured'}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-xs text-slate-600">
                          {dateLabel(bin.lastCommunicationAt)}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3.5 text-right">
                          <Button
                            variant={selected ? 'primary' : 'secondary'}
                            className="min-h-8 px-2.5 py-1 text-xs"
                            onClick={() => setSelectedBinId(bin.id)}
                          >
                            {selected ? 'Selected' : 'History'}
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {activeBin && (
        <Card className="mt-6 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <Activity size={17} className="text-forest-700" aria-hidden="true" />
                {activeBin.binCode} — latest sensor reading & history
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Household: {activeBin.householdName} · Address: {activeBin.householdAddress || activeBin.district || '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {latestReading.data?.isSimulated && (
                <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-600/20">
                  SIMULATED SENSOR
                </span>
              )}
              <StatusBadge status={latestReading.data?.deviceStatus || activeBin.sensorDeviceStatus || 'NOT_CONFIGURED'} />
            </div>
          </div>

          <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-xs font-medium text-slate-500">Latest sensor fill</div>
              <div className="mt-1 text-lg font-semibold text-slate-900">
                {latestReading.data?.reading ? `${latestReading.data.reading.fillLevel}%` : 'No reading recorded'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <BatteryCharging size={13} aria-hidden="true" /> Battery & health
              </div>
              <div className="mt-1 text-sm text-slate-800">
                {latestReading.data?.reading
                  ? `${latestReading.data.reading.batteryLevel !== null ? `${latestReading.data.reading.batteryLevel}%` : 'Battery not reported'} · ${latestReading.data.reading.sensorStatus}`
                  : '—'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <MapPin size={13} aria-hidden="true" /> Stored bin coordinates
              </div>
              <div className="mt-1 font-mono text-xs text-slate-800">
                {activeBin.latitude != null && activeBin.longitude != null
                  ? `${activeBin.latitude.toFixed(6)}, ${activeBin.longitude.toFixed(6)}`
                  : 'Not captured'}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Last measured / communication</div>
              <div className="mt-1 text-xs text-slate-700">
                {dateLabel(latestReading.data?.reading?.measuredAt || latestReading.data?.lastCommunicationAt)}
              </div>
            </div>
          </div>

          {readingHistory.isLoading && <div className="p-5"><LoadingState label="Loading sensor reading history..." /></div>}
          {readingHistory.isError && <div className="p-5"><ErrorState error={asError(readingHistory.error)} /></div>}
          {readingHistory.isSuccess && readingHistory.data.length === 0 && (
            <div className="p-5">
              <EmptyState title="No sensor history" label="No telemetry readings have been ingested for this bin yet." />
            </div>
          )}
          {readingHistory.isSuccess && readingHistory.data.length > 0 && (
            <div className="max-h-80 overflow-auto">
              <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="px-5 py-2.5">Measured at</th>
                    <th scope="col" className="px-5 py-2.5">Received at</th>
                    <th scope="col" className="px-5 py-2.5">Fill level</th>
                    <th scope="col" className="px-5 py-2.5">Battery</th>
                    <th scope="col" className="px-5 py-2.5">Sensor health</th>
                    <th scope="col" className="px-5 py-2.5">Overflow</th>
                    <th scope="col" className="px-5 py-2.5">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {readingHistory.data.map((reading) => (
                    <tr key={reading.id}>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-700">{dateLabel(reading.measuredAt)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{dateLabel(reading.receivedAt)}</td>
                      <td className="whitespace-nowrap px-5 py-2.5 font-semibold text-slate-900">{reading.fillLevel}%</td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                        {reading.batteryLevel !== null ? `${reading.batteryLevel}%` : '—'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5"><StatusBadge status={reading.sensorStatus} /></td>
                      <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">
                        {reading.overflowDetected === null ? '—' : reading.overflowDetected ? 'Yes' : 'No'}
                      </td>
                      <td className="whitespace-nowrap px-5 py-2.5">
                        {reading.isSimulated ? (
                          <span className="rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-800">SIMULATED</span>
                        ) : 'PHYSICAL'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {isManager && (
        devices.isError ? (
          <div className="mt-6"><ErrorState error={asError(devices.error)} /></div>
        ) : (
          <DeviceCredentialManager
            deviceType="BIN"
            devices={devices.data || []}
            resources={(binsQuery.data || []).map((b) => ({
              id: b.id,
              label: `${b.binCode} · ${b.householdName || `Household #${b.householdId}`}`,
            }))}
            resourceLabel="waste bin"
            queryKeysToInvalidate={[['iot', 'devices'], ['iot', 'alerts'], ['bins']]}
            onRegister={(code, sim) => iotService.registerDevice(code, sim)}
            onAssociate={(deviceId, binId) => iotService.associateDevice(deviceId, binId)}
            onRotate={(deviceId) => iotService.rotateCredential(deviceId)}
            onRevoke={(deviceId) => iotService.revokeDevice(deviceId)}
          />
        )
      )}
    </div>
  )
}
