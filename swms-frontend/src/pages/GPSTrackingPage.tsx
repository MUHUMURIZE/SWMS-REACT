import { MapPinned } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Card, PageHeader, StatusBadge } from '../components/ui'
import { trackingService } from '../services/resources'
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
  return `${vehicle.latitude}, ${vehicle.longitude}`
}

export function GPSTrackingPage() {
  const query = useQuery({
    queryKey: ['tracking', 'map'],
    queryFn: trackingService.map,
    refetchInterval: 30_000,
  })

  return (
    <div>
      <PageHeader
        title="GPS Tracking"
        description="Verified vehicle positions and communication state for your authorized operating scope."
        icon={MapPinned}
      />

      {query.isLoading && <LoadingState label="Loading authorized vehicle tracking..." />}
      {query.isError && <ErrorState error={asError(query.error)} />}
      {query.isSuccess && query.data.length === 0 && (
        <EmptyState
          title="No assigned vehicles"
          label="There are no vehicles in your current tracking scope. Positions are shown only after a registered GPS device sends a location."
        />
      )}
      {query.isSuccess && query.data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="font-semibold text-slate-900">Vehicle locations</h2>
            <p className="mt-1 text-sm text-slate-500">
              No positions are synthesized. Times and coordinates come from device reports.
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
                  <th scope="col" className="px-5 py-3">Recorded</th>
                  <th scope="col" className="px-5 py-3">Last communication</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {query.data.map((vehicle) => (
                  <tr key={vehicle.vehicleId}>
                    <td className="whitespace-nowrap px-5 py-4 font-medium text-slate-900">
                      {vehicle.registrationNumber}
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
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {dateLabel(vehicle.recordedAt)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                      {dateLabel(vehicle.lastCommunicationAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
