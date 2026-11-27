import { useState } from 'react'
import { Pause, Play, Radio, RotateCcw, SkipForward, Square, Wrench } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, unwrap } from '../lib/api'
import { ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, StatusBadge } from '../components/ui'

interface SimGpsDevice {
  deviceCode: string
  vehicleId: number
  registrationNumber: string
  isSimulated: boolean
  interrupted: boolean
  lastSentAt: string | null
  lastPayload: { latitude: number; longitude: number; speed?: number; heading?: number; recordedAt: string } | null
  lastResponse: { status: number; body: unknown } | null
  lastError: string | null
}

interface SimIotDevice {
  deviceCode: string
  binId: number
  binCode: string
  isSimulated: boolean
  fillLevel: number
  batteryLevel: number | null
  sensorStatus: 'OK' | 'DEGRADED' | 'FAULT'
  overflowDetected: boolean | null
  interrupted: boolean
  lastSentAt: string | null
  lastPayload: { fillLevel: number; batteryLevel?: number; sensorStatus: string; measuredAt: string } | null
  lastResponse: { status: number; body: unknown } | null
  lastError: string | null
}

interface SimStatus {
  initialized: boolean
  companyName: string | null
  districtName: string | null
  gps: { status: string; intervalMs: number; tickCount: number; devices: SimGpsDevice[] } | null
  iot: { status: string; intervalMs: number; tickCount: number; presets: number[]; devices: SimIotDevice[] } | null
}

export function DevSimulatorPage() {
  const queryClient = useQueryClient()
  const [gpsInterval, setGpsInterval] = useState('3000')
  const [iotInterval, setIotInterval] = useState('5000')

  const statusQuery = useQuery({
    queryKey: ['dev-simulator-status'],
    queryFn: async () => unwrap<SimStatus>((await api.get('/api/dev-simulator/status')).data),
    refetchInterval: 2500,
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dev-simulator-status'] }),
      queryClient.invalidateQueries({ queryKey: ['tracking'] }),
      queryClient.invalidateQueries({ queryKey: ['iot'] }),
      queryClient.invalidateQueries({ queryKey: ['bins'] }),
    ])
  }

  const setupMutation = useMutation({
    mutationFn: async (rotateCredentials: boolean) =>
      unwrap<SimStatus>((await api.post('/api/dev-simulator/setup', { rotateCredentials })).data),
    onSuccess: refresh,
  })

  const gpsAction = useMutation({
    mutationFn: async ({ action, body }: { action: string; body?: Record<string, unknown> }) =>
      (await api.post(`/api/dev-simulator/gps/${action}`, body || {})).data,
    onSuccess: refresh,
  })

  const iotAction = useMutation({
    mutationFn: async ({ action, body }: { action: string; body?: Record<string, unknown> }) =>
      (await api.post(`/api/dev-simulator/iot/${action}`, body || {})).data,
    onSuccess: refresh,
  })

  const data = statusQuery.data
  const anyError = statusQuery.error || setupMutation.error || gpsAction.error || iotAction.error

  return (
    <div>
      <PageHeader
        eyebrow="Development only"
        title="GPS & IoT Simulator"
        description="Safe development-only test device simulator. Sends authenticated HTTP requests to /api/tracking/ingest and /api/iot/ingest; excluded from production builds."
        icon={Radio}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button icon={Wrench} onClick={() => setupMutation.mutate(false)} disabled={setupMutation.isPending}>
              {data?.initialized ? 'Re-sync test fixture' : 'Initialize test environment'}
            </Button>
            {data?.initialized && (
              <Button variant="secondary" icon={RotateCcw} onClick={() => setupMutation.mutate(true)} disabled={setupMutation.isPending}>
                Rotate test credentials
              </Button>
            )}
          </div>
        )}
      />

      <div className="mb-5 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950">
        <strong>Development isolation active:</strong> Simulator routes mount only when <code>NODE_ENV !== &quot;production&quot;</code> and <code>SWMS_ENABLE_SIMULATOR=true</code>, require an Administrator JWT, and only transmit using <code>SIM-*</code> test devices flagged <code>isSimulated: true</code>.
      </div>

      {anyError && <div className="mb-5"><ErrorState error={anyError} /></div>}
      {statusQuery.isLoading && <LoadingState label="Checking simulator controller..." />}

      {data && !data.initialized && (
        <Card className="p-6 text-sm text-slate-600">
          Simulation environment is not initialized yet. Click <strong>Initialize test environment</strong> above (or run <code>npm run sim:setup</code> in <code>swms-backend</code>) to provision isolated <code>[SIM-TEST]</code> vehicles, bins, and test device credentials.
        </Card>
      )}

      {data?.initialized && (
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Vehicle GPS simulator</h2>
                <p className="text-xs text-slate-500">
                  Target company: {data.companyName} · Status: <strong>{data.gps?.status}</strong> · Ticks: {data.gps?.tickCount ?? 0}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={gpsInterval}
                  onChange={(e) => setGpsInterval(e.target.value)}
                  className="app-input h-9 w-28 text-xs"
                  aria-label="GPS interval milliseconds"
                />
                <Button icon={Play} className="min-h-9 px-3 text-xs" onClick={() => gpsAction.mutate({ action: 'start', body: { intervalMs: Number(gpsInterval) } })}>
                  Start
                </Button>
                <Button variant="secondary" icon={Pause} className="min-h-9 px-3 text-xs" onClick={() => gpsAction.mutate({ action: 'pause' })}>
                  Pause
                </Button>
                <Button variant="secondary" icon={SkipForward} className="min-h-9 px-3 text-xs" onClick={() => gpsAction.mutate({ action: 'step' })}>
                  Step once
                </Button>
                <Button variant="danger" icon={Square} className="min-h-9 px-3 text-xs" onClick={() => gpsAction.mutate({ action: 'stop' })}>
                  Stop
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {(data.gps?.devices || []).map((dev) => (
                <div key={dev.deviceCode} className="rounded-xl border border-slate-200 p-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{dev.deviceCode} → {dev.registrationNumber}</span>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={dev.interrupted ? 'OFFLINE' : 'ONLINE'} />
                      <Button
                        variant="secondary"
                        className="min-h-7 px-2 py-0.5 text-[11px]"
                        onClick={() => gpsAction.mutate({
                          action: 'configure',
                          body: { deviceCode: dev.deviceCode, interrupted: !dev.interrupted },
                        })}
                      >
                        {dev.interrupted ? 'Restore link' : 'Simulate offline'}
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 font-mono text-slate-700">
                    Last coords: {dev.lastPayload ? `${dev.lastPayload.latitude}, ${dev.lastPayload.longitude} (${dev.lastPayload.speed ?? 0} km/h)` : 'None sent'}
                  </div>
                  <div className="mt-1 text-slate-500">
                    API response: {dev.lastResponse ? `HTTP ${dev.lastResponse.status} ${JSON.stringify(dev.lastResponse.body)}` : dev.lastError || 'Waiting'}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h2 className="font-semibold text-slate-900">Smart-bin IoT simulator</h2>
                <p className="text-xs text-slate-500">
                  Status: <strong>{data.iot?.status}</strong> · Ticks: {data.iot?.tickCount ?? 0}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={500}
                  step={500}
                  value={iotInterval}
                  onChange={(e) => setIotInterval(e.target.value)}
                  className="app-input h-9 w-28 text-xs"
                  aria-label="IoT interval milliseconds"
                />
                <Button icon={Play} className="min-h-9 px-3 text-xs" onClick={() => iotAction.mutate({ action: 'start', body: { intervalMs: Number(iotInterval) } })}>
                  Start
                </Button>
                <Button variant="secondary" icon={Pause} className="min-h-9 px-3 text-xs" onClick={() => iotAction.mutate({ action: 'pause' })}>
                  Pause
                </Button>
                <Button variant="secondary" icon={SkipForward} className="min-h-9 px-3 text-xs" onClick={() => iotAction.mutate({ action: 'step' })}>
                  Step once
                </Button>
                <Button variant="danger" icon={Square} className="min-h-9 px-3 text-xs" onClick={() => iotAction.mutate({ action: 'stop' })}>
                  Stop
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(data.iot?.devices || []).map((dev) => (
                <div key={dev.deviceCode} className="rounded-xl border border-slate-200 p-4 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{dev.deviceCode} → {dev.binCode}</span>
                    <StatusBadge status={dev.interrupted ? 'OFFLINE' : dev.sensorStatus} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {(data.iot?.presets || [10, 30, 50, 75, 90, 100]).map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => iotAction.mutate({
                          action: 'configure',
                          body: { deviceCode: dev.deviceCode, fillLevel: pct, autoCyclePresets: false },
                        })}
                        className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${
                          dev.fillLevel === pct
                            ? 'border-forest-700 bg-forest-800 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(['OK', 'DEGRADED', 'FAULT'] as const).map((health) => (
                      <button
                        key={health}
                        type="button"
                        onClick={() => iotAction.mutate({
                          action: 'configure',
                          body: { deviceCode: dev.deviceCode, sensorStatus: health },
                        })}
                        className={`rounded border px-2 py-0.5 text-[11px] font-medium ${
                          dev.sensorStatus === health ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        {health}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => iotAction.mutate({
                        action: 'configure',
                        body: { deviceCode: dev.deviceCode, interrupted: !dev.interrupted },
                      })}
                      className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700"
                    >
                      {dev.interrupted ? 'Restore' : 'Interrupt'}
                    </button>
                  </div>
                  <div className="mt-2 text-slate-500">
                    API response: {dev.lastResponse ? `HTTP ${dev.lastResponse.status} ${JSON.stringify(dev.lastResponse.body)}` : dev.lastError || 'Waiting'}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
