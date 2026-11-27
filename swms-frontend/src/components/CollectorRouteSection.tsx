import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, MapPin, Navigation, Recycle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, LoadingState } from './PageState'
import { SwmsMap, type MapPin as SwmsMapPin } from './SwmsMap'
import { Button, Card, SectionHeading, StatusBadge } from './ui'
import { binService, collectionService } from '../services/resources'
import type { Bin, Collection } from '../types/api'

const activeCollectionStatuses = new Set<Collection['status']>(['in_progress', 'scheduled', 'pending'])

function binTone(bin: Bin): SwmsMapPin['tone'] {
  if (bin.status === 'FULL') return 'rose'
  if (bin.status === 'HIGH') return 'orange'
  if (bin.status === 'MEDIUM') return 'amber'
  return 'emerald'
}

function navigationHref(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${lat},${lng}`)}`
}

export function CollectorRouteSection() {
  const [selectedBinId, setSelectedBinId] = useState<number | null>(null)

  const binsQuery = useQuery({
    queryKey: ['collector-bins-map'],
    queryFn: () => binService.list({ limit: 100, offset: 0 }),
    refetchInterval: 15_000,
  })
  const collectionsQuery = useQuery({
    queryKey: ['collector-route-collections'],
    queryFn: () => collectionService.list({ limit: 100, offset: 0 }),
    refetchInterval: 15_000,
  })

  const activeCollectionByHousehold = useMemo(() => {
    const map = new Map<number, Collection>()
    const sorted = (collectionsQuery.data || [])
      .filter((c) => activeCollectionStatuses.has(c.status))
      .slice()
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
    for (const item of sorted) {
      if (!map.has(item.householdId)) map.set(item.householdId, item)
    }
    return map
  }, [collectionsQuery.data])

  const nextCollection = useMemo(() => {
    const active = (collectionsQuery.data || [])
      .filter((c) => activeCollectionStatuses.has(c.status))
      .slice()
      .sort((a, b) => {
        if (a.status === 'in_progress' && b.status !== 'in_progress') return -1
        if (b.status === 'in_progress' && a.status !== 'in_progress') return 1
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      })
    return active[0] || null
  }, [collectionsQuery.data])

  const nextBin = useMemo(() => {
    const bins = binsQuery.data || []
    if (nextCollection) {
      const matched = bins.find((b) => b.householdId === nextCollection.householdId)
      if (matched) return matched
    }
    return bins.slice().sort((a, b) => b.fillLevel - a.fillLevel)[0] || null
  }, [binsQuery.data, nextCollection])

  const focusedBin = useMemo(() => {
    if (selectedBinId !== null) {
      return (binsQuery.data || []).find((b) => b.id === selectedBinId) || nextBin
    }
    return nextBin
  }, [selectedBinId, binsQuery.data, nextBin])

  const pins = useMemo<SwmsMapPin[]>(() => (
    (binsQuery.data || [])
      .filter((bin) => bin.latitude != null && bin.longitude != null)
      .map((bin) => {
        const col = activeCollectionByHousehold.get(bin.householdId)
        return {
          id: bin.id,
          latitude: bin.latitude!,
          longitude: bin.longitude!,
          label: `${bin.binCode} · ${bin.householdName || `Household #${bin.householdId}`}`,
          tone: binTone(bin),
          selected: focusedBin?.id === bin.id,
          onSelect: () => setSelectedBinId(bin.id),
          popup: (
            <div className="mt-1 space-y-1">
              {bin.householdAddress && <div>{bin.householdAddress}</div>}
              <div>Bin fill: <strong>{bin.fillLevel}%</strong> ({bin.status})</div>
              <div>Collection: <strong>{col ? col.status : 'No active schedule'}</strong></div>
              <a
                href={navigationHref(bin.latitude!, bin.longitude!)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-semibold text-forest-700 hover:underline"
              >
                Open navigation
              </a>
            </div>
          ),
        }
      })
  ), [binsQuery.data, activeCollectionByHousehold, focusedBin])

  const focusedCollection = focusedBin ? activeCollectionByHousehold.get(focusedBin.householdId) : null

  return (
    <Card className="p-5">
      <SectionHeading
        title="Assigned household bins & route map"
        description="Stored household bin locations, next scheduled collection point, and turn-by-turn navigation."
        action={
          <Link to="/collections" className="inline-flex items-center gap-1 text-sm font-semibold text-forest-700 hover:text-forest-900">
            <Recycle size={15} aria-hidden="true" /> All collections
          </Link>
        }
      />

      {(binsQuery.isLoading || collectionsQuery.isLoading) && (
        <LoadingState label="Loading assigned household bin locations..." />
      )}
      {(binsQuery.error || collectionsQuery.error) && (
        <ErrorState error={binsQuery.error || collectionsQuery.error} />
      )}

      {binsQuery.isSuccess && binsQuery.data.length === 0 && (
        <EmptyState label="No assigned household bins are available in your active district scope." />
      )}

      {binsQuery.isSuccess && binsQuery.data.length > 0 && (
        <div className="space-y-4">
          {focusedBin && (
            <div className="flex flex-col justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 sm:flex-row sm:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-forest-800">
                  <Navigation size={14} aria-hidden="true" />
                  {focusedBin.id === nextBin?.id && nextCollection
                    ? 'Next assigned collection point'
                    : 'Selected household bin'}
                  {focusedCollection && <StatusBadge status={focusedCollection.status} />}
                  <StatusBadge status={focusedBin.status} />
                </div>
                <div className="mt-1.5 text-sm font-semibold text-slate-900">
                  {focusedBin.binCode} · {focusedBin.householdName || `Household #${focusedBin.householdId}`}
                </div>
                <div className="mt-0.5 text-xs text-slate-600">
                  {focusedBin.householdAddress || focusedBin.district || 'Address unavailable'}
                  {' · '}Fill: {focusedBin.fillLevel}%
                  {focusedCollection ? ` · Scheduled: ${new Date(focusedCollection.scheduledAt).toLocaleString()}` : ''}
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-xs text-slate-600">
                  <MapPin size={12} aria-hidden="true" />
                  {focusedBin.latitude != null && focusedBin.longitude != null
                    ? `${focusedBin.latitude.toFixed(6)}, ${focusedBin.longitude.toFixed(6)}${focusedBin.locationAccuracy != null ? ` (±${focusedBin.locationAccuracy}m)` : ''}`
                    : 'Coordinates not yet captured'}
                </div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                {focusedBin.latitude != null && focusedBin.longitude != null ? (
                  <a
                    href={navigationHref(focusedBin.latitude, focusedBin.longitude)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button icon={ExternalLink}>Navigate</Button>
                  </a>
                ) : (
                  <Link to="/bins">
                    <Button variant="secondary" icon={MapPin}>Capture GPS location</Button>
                  </Link>
                )}
              </div>
            </div>
          )}

          <SwmsMap
            pins={pins}
            heightClass="h-72"
            emptyMessage="Assigned bins exist, but none have stored GPS coordinates yet. Capture coordinates from the Smart bins page during installation."
          />

          <div className="flex flex-wrap gap-2">
            {binsQuery.data.slice(0, 8).map((bin) => (
              <button
                key={bin.id}
                type="button"
                onClick={() => setSelectedBinId(bin.id)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  focusedBin?.id === bin.id
                    ? 'border-forest-700 bg-forest-800 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {bin.binCode} ({bin.fillLevel}%)
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
