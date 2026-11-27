import { useEffect, useMemo, type ReactNode } from 'react'
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

export interface MapPin {
  id: string | number
  latitude: number
  longitude: number
  label: string
  tone?: 'emerald' | 'amber' | 'orange' | 'rose' | 'sky' | 'slate'
  selected?: boolean
  popup?: ReactNode
  onSelect?: () => void
}

const toneColors: Record<NonNullable<MapPin['tone']>, { bg: string; ring: string }> = {
  emerald: { bg: '#1d5038', ring: '#bbf7d0' },
  amber: { bg: '#b45309', ring: '#fde68a' },
  orange: { bg: '#c2410c', ring: '#fed7aa' },
  rose: { bg: '#be123c', ring: '#fecdd3' },
  sky: { bg: '#0369a1', ring: '#bae6fd' },
  slate: { bg: '#475569', ring: '#e2e8f0' },
}

function createPinIcon(tone: NonNullable<MapPin['tone']>, selected: boolean) {
  const palette = toneColors[tone]
  const size = selected ? 26 : 20
  const border = selected ? 3 : 2
  return L.divIcon({
    className: 'swms-map-pin',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${palette.bg};border:${border}px solid #ffffff;box-shadow:0 0 0 3px ${palette.ring},0 4px 10px rgba(15,23,42,0.28);"></span>`,
  })
}

function FitBounds({
  pins,
  path,
}: {
  pins: MapPin[]
  path: Array<[number, number]>
}) {
  const map = useMap()

  useEffect(() => {
    const points: Array<[number, number]> = [
      ...pins.map((pin) => [pin.latitude, pin.longitude] as [number, number]),
      ...path,
    ]
    if (points.length === 0) return
    if (points.length === 1) {
      map.setView(points[0], Math.max(map.getZoom(), 14), { animate: false })
      return
    }
    const bounds = L.latLngBounds(points)
    map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16, animate: false })
  }, [map, pins, path])

  return null
}

export function SwmsMap({
  pins,
  path = [],
  heightClass = 'h-80 sm:h-96',
  emptyMessage = 'No geographic coordinates have been recorded in this view yet.',
}: {
  pins: MapPin[]
  path?: Array<[number, number]>
  heightClass?: string
  emptyMessage?: string
}) {
  const initialCenter = useMemo<[number, number]>(() => {
    if (pins.length > 0) return [pins[0].latitude, pins[0].longitude]
    if (path.length > 0) return path[0]
    return [-1.9441, 30.0619]
  }, [pins, path])

  if (pins.length === 0 && path.length === 0) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center text-sm text-slate-500">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className={`relative z-0 overflow-hidden rounded-xl border border-slate-200 ${heightClass}`}>
      <MapContainer center={initialCenter} zoom={14} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitBounds pins={pins} path={path} />
        {path.length > 1 && (
          <Polyline positions={path} pathOptions={{ color: '#2e8055', weight: 3, opacity: 0.8 }} />
        )}
        {pins.map((pin) => (
          <Marker
            key={pin.id}
            position={[pin.latitude, pin.longitude]}
            icon={createPinIcon(pin.tone || 'emerald', Boolean(pin.selected))}
            eventHandlers={pin.onSelect ? { click: () => pin.onSelect?.() } : undefined}
          >
            <Popup>
              <div className="min-w-44 text-xs text-slate-700">
                <div className="font-semibold text-slate-900">{pin.label}</div>
                {pin.popup}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}
