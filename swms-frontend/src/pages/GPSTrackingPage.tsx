import { useMemo, useState } from 'react'
import { History, MapPinned, Navigation, Radio, Truck } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { DeviceCredentialManager } from '../components/DeviceCredentialManager'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { SwmsMap, type MapPin } from '../components/SwmsMap'
import { Button, Card, PageHeader, StatusBadge } from '../components/ui'
import { trackingService, vehicleService } from '../services/resources'
import type { ApiError, VehicleTracking } from '../types/api'

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
  return error ? new Error('Vehicle tracking could not be loaded.') : null
}

function dateLabel(value: string | null) {
  return value ? new Date(value).toLocaleString() : 'No communication recorded'
}

function locationLabel(vehicle: VehicleTracking) {
  if (vehicle.latitude === null || vehicle.longitude === null || vehicle.recordedAt === null) {
    return 'No location received'
  }
  return `${vehicle.latitude.toFixed(6)}, ${vehicle.longitude.toFixed(6)}`
}

export function GPSTrackingPage() {
  const { user } = useAuth()
  const isManager = user?.role === 'ADMIN' || user?.role === 'COMPANY_REPRESENTATIVE'
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null)

  const query = useQuery({
    queryKey: ['tracking', 'map'],
    queryFn: trackingService.map,
    refetchInterval: 10_000,
  })

  const vehiclesInventory = useQuery({
    queryKey: ['vehicles', { limit: 100, offset: 0 }],
    queryFn: () => vehicleService.list({ limit: 100, offset: 0 }),
    enabled: isManager,
  })

  const devicesQuery = useQuery({
    queryKey: ['tracking', 'devices'],
    queryFn: () => trackingService.devices({ limit: 50, offset: 0 }),
    enabled: isManager,
    refetchInterval: 10_000,
  })

  const activeVehicleId = selectedVehicleId ?? query.data?.find((v) => v.latitude !== null)?.vehicleId ?? query.data?.[0]?.vehicleId ?? null

  const latestQuery = useQuery({
    queryKey: ['tracking', 'latest', activeVehicleId],
    queryFn: () => trackingService.latest(activeVehicleId!),
    enabled: activeVehicleId !== null,
    refetchInterval: 10_000,
  })

  const historyQuery = useQuery({
    queryKey: ['tracking', 'history', activeVehicleId],
    queryFn: () => trackingService.history(activeVehicleId!, { limit: 50, offset: 0 }),
    enabled: activeVehicleId !== null,
    refetchInterval: 10_000,
  })

  const summary = useMemo(() => {
    const rows = query.data || []
    return {
      total: rows.length,
      online: rows.filter((r) => r.trackingStatus === 'ONLINE').length,
      offline: rows.filter((r) => r.trackingStatus === 'OFFLINE').length,
      notConfigured: rows.filter((r) => r.trackingStatus === 'NOT_CONFIGURED').length,
    }
  }, [query.data])

  const mapPins = useMemo<MapPin[]>(() => (
    (query.data || [])
      .filter((vehicle) => vehicle.latitude !== null && vehicle.longitude !== null)
      .map((vehicle) => ({
        id: vehicle.vehicleId,
        latitude: vehicle.latitude!,
        longitude: vehicle.longitude!,
        label: `${vehicle.registrationNumber}${vehicle.isSimulated ? ' [SIMULATED]' : ''}`,
        tone: vehicle.trackingStatus === 'ONLINE'
          ? 'emerald'
          : vehicle.trackingStatus === 'OFFLINE'
            ? 'rose'
            : 'slate',
        selected: vehicle.vehicleId === activeVehicleId,
        onSelect: () => setSelectedVehicleId(vehicle.vehicleId),
        popup: (
          <div className="mt-1 space-y-1">
            <div>Status: <strong>{vehicle.trackingStatus}</strong></div>
            <div>Collector: {vehicle.collectorName || 'Unassigned'}</div>
            {vehicle.speed !== null && <div>Speed: {vehicle.speed} km/h</div>}
            {vehicle.heading !== null && <div>Heading: {vehicle.heading}°</div>}
            <div className="font-mono text-[11px]">{vehicle.latitude?.toFixed(6)}, {vehicle.longitude?.toFixed(6)}</div>
            <div className="text-[11px] text-slate-500">Updated: {dateLabel(vehicle.recordedAt)}</div>
          </div>
        ),
      }))
  ), [query.data, activeVehicleId])

  const historyPath = useMemo<Array<[number, number]>>(() => (
    (historyQuery.data || [])
      .slice()
      .reverse()
      .map((point) => [point.latitude, point.longitude])
  ), [historyQuery.data])

  const selectedVehicle = query.data?.find((v) => v.vehicleId === activeVehicleId) || null

  return (
    <div>
      <PageHeader
        eyebrow="Fleet telemetry"
        title="GPS Tracking"
        description="Verified vehicle positions, communication state, and location history for your authorized operating scope."
        icon={MapPinned}
      />

      {query.isLoading && <LoadingState label="Loading authorized vehicle tracking..." />}
      {query.isError && <ErrorState error={asError(query.error)} />}

      {query.isSuccess && (
        <>
          <section aria-label="Tracking summary" className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="text-xs font-semibold text-slate-500">Authorized vehicles</div>
              <div className="mt-1.5 text-2xl font-semibold text-slate-950">{summary.total}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold text-emerald-700">Online</div>
              <div className="mt-1.5 text-2xl font-semibold text-emerald-800">{summary.online}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold text-rose-700">Offline</div>
              <div className="mt-1.5 text-2xl font-semibold text-rose-800">{summary.offline}</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs font-semibold text-slate-500">Not configured</div>
              <div className="mt-1.5 text-2xl font-semibold text-slate-700">{summary.notConfigured}</div>
            </Card>
          </section>

          {query.data.length === 0 ? (
            <EmptyState
              title="No assigned vehicles"
              label="There are no vehicles in your current tracking scope. Positions are shown only after a registered GPS device sends a location."
            />
          ) : (
            <div className="space-y-6">
              <Card className="p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-semibold text-slate-900">Live vehicle map</h2>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Positions come from authenticated GPS device reports. Select a vehicle marker or row to view its route history.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-forest-800" /> Online</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-700" /> Offline</span>
                  </div>
                </div>
                <SwmsMap
                  pins={mapPins}
                  path={historyPath}
                  emptyMessage="Authorized vehicles exist, but no GPS coordinates have been received from any enrolled device yet."
                />
              </Card>

              <Card className="overflow-hidden p-0">
                <div className="border-b border-slate-200 px-5 py-4">
                  <h2 className="font-semibold text-slate-900">Authorized vehicles</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    No positions are synthesized. Times and coordinates come from authenticated GPS submissions.
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <tr>
                        <th scope="col" className="px-5 py-3">Vehicle</th>
                        <th scope="col" className="px-5 py-3">Collector</th>
                        <th scope="col" className="px-5 py-3">Tracking</th>
                        <th scope="col" className="px-5 py-3">Latest location</th>
                        <th scope="col" className="px-5 py-3">Speed / Heading</th>
                        <th scope="col" className="px-5 py-3">Recorded</th>
                        <th scope="col" className="px-5 py-3">Last communication</th>
                        <th scope="col" className="px-5 py-3 text-right">Details</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {query.data.map((vehicle) => {
                        const selected = vehicle.vehicleId === activeVehicleId
                        return (
                          <tr key={vehicle.vehicleId} className={selected ? 'bg-emerald-50/40' : ''}>
                            <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">
                              <div className="flex items-center gap-2">
                                <Truck size={15} className="text-forest-700" aria-hidden="true" />
                                <span>{vehicle.registrationNumber}</span>
                                {vehicle.isSimulated && (
                                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[0.65rem] font-semibold text-violet-800 ring-1 ring-inset ring-violet-600/20">
                                    SIMULATED
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                              {vehicle.collectorName || 'Unassigned'}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4">
                              <StatusBadge status={vehicle.trackingStatus} />
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-700">
                              {locationLabel(vehicle)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-600">
                              {vehicle.speed !== null ? `${vehicle.speed} km/h` : '—'}
                              {vehicle.heading !== null ? ` · ${vehicle.heading}°` : ''}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                              {dateLabel(vehicle.recordedAt)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                              {dateLabel(vehicle.lastCommunicationAt)}
                            </td>
                            <td className="whitespace-nowrap px-5 py-4 text-right">
                              <Button
                                variant={selected ? 'primary' : 'secondary'}
                                icon={History}
                                className="min-h-8 px-2.5 py-1 text-xs"
                                onClick={() => setSelectedVehicleId(vehicle.vehicleId)}
                              >
                                {selected ? 'Selected' : 'Inspect'}
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {selectedVehicle && (
                <Card className="overflow-hidden p-0">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                    <div>
                      <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                        <Navigation size={17} className="text-forest-700" aria-hidden="true" />
                        {selectedVehicle.registrationNumber} — latest telemetry & location history
                      </h2>
                      <p className="mt-1 text-xs text-slate-500">
                        District: {selectedVehicle.district || 'Unassigned'} · Collector: {selectedVehicle.collectorName || 'Unassigned'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedVehicle.isSimulated && (
                        <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-800 ring-1 ring-inset ring-violet-600/20">
                          SIMULATED DEVICE
                        </span>
                      )}
                      <StatusBadge status={latestQuery.data?.trackingStatus || selectedVehicle.trackingStatus} />
                    </div>
                  </div>

                  <div className="grid gap-4 border-b border-slate-100 bg-slate-50/60 p-5 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-xs font-medium text-slate-500">Latest coordinates</div>
                      <div className="mt-1 font-mono text-sm font-semibold text-slate-900">
                        {latestQuery.data?.location && latestQuery.data.location.latitude != null && latestQuery.data.location.longitude != null
                          ? `${Number(latestQuery.data.location.latitude).toFixed(6)}, ${Number(latestQuery.data.location.longitude).toFixed(6)}`
                          : 'No coordinates reported'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Speed / Heading / Accuracy</div>
                      <div className="mt-1 text-sm text-slate-800">
                        {latestQuery.data?.location
                          ? `${latestQuery.data.location.speed ?? '—'} km/h · ${latestQuery.data.location.heading ?? '—'}° · ±${latestQuery.data.location.accuracy ?? '—'}m`
                          : '—'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Device recorded time</div>
                      <div className="mt-1 text-sm text-slate-800">
                        {dateLabel(latestQuery.data?.location?.recordedAt || null)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Last server communication</div>
                      <div className="mt-1 text-sm text-slate-800">
                        {dateLabel(latestQuery.data?.lastCommunicationAt || null)}
                      </div>
                    </div>
                  </div>

                  {historyQuery.isLoading && <div className="p-5"><LoadingState label="Loading vehicle location history..." /></div>}
                  {historyQuery.isError && <div className="p-5"><ErrorState error={asError(historyQuery.error)} /></div>}
                  {historyQuery.isSuccess && historyQuery.data.length === 0 && (
                    <div className="p-5">
                      <EmptyState title="No location history" label="No GPS location points have been recorded for this vehicle yet." />
                    </div>
                  )}
                  {historyQuery.isSuccess && historyQuery.data.length > 0 && (
                    <div className="max-h-80 overflow-auto">
                      <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="sticky top-0 bg-slate-50 font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th scope="col" className="px-5 py-2.5">Recorded at</th>
                            <th scope="col" className="px-5 py-2.5">Received at</th>
                            <th scope="col" className="px-5 py-2.5">Coordinates</th>
                            <th scope="col" className="px-5 py-2.5">Speed</th>
                            <th scope="col" className="px-5 py-2.5">Heading</th>
                            <th scope="col" className="px-5 py-2.5">Source</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {historyQuery.data.map((item) => (
                            <tr key={item.id}>
                              <td className="whitespace-nowrap px-5 py-2.5 text-slate-700">{dateLabel(item.recordedAt)}</td>
                              <td className="whitespace-nowrap px-5 py-2.5 text-slate-500">{dateLabel(item.receivedAt)}</td>
                              <td className="whitespace-nowrap px-5 py-2.5 font-mono text-slate-800">
                                {item.latitude.toFixed(6)}, {item.longitude.toFixed(6)}
                              </td>
                              <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{item.speed ?? '—'}</td>
                              <td className="whitespace-nowrap px-5 py-2.5 text-slate-600">{item.heading ?? '—'}</td>
                              <td className="whitespace-nowrap px-5 py-2.5">
                                {item.isSimulated ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-semibold text-violet-800">
                                    <Radio size={11} aria-hidden="true" /> SIMULATED
                                  </span>
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
            </div>
          )}

          {isManager && (
            devicesQuery.isError ? (
              <div className="mt-6"><ErrorState error={asError(devicesQuery.error)} /></div>
            ) : (
              <DeviceCredentialManager
                deviceType="GPS"
                devices={devicesQuery.data || []}
                resources={(vehiclesInventory.data || []).map((v) => ({
                  id: v.id,
                  label: `${v.registrationNumber} (${v.vehicleType})`,
                }))}
                resourceLabel="vehicle"
                queryKeysToInvalidate={[['tracking', 'devices'], ['tracking', 'map']]}
                onRegister={(code, sim) => trackingService.registerDevice(code, sim)}
                onAssociate={(deviceId, vehicleId) => trackingService.associateDevice(deviceId, vehicleId)}
                onRotate={(deviceId) => trackingService.rotateCredential(deviceId)}
                onRevoke={(deviceId) => trackingService.revokeDevice(deviceId)}
              />
            )
          )}
        </>
      )}
    </div>
  )
}
