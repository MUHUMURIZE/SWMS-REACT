import { useState, type FormEvent } from 'react'
import { Copy, KeyRound, Link2, Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ErrorState } from './PageState'
import { Button, Card, StatusBadge } from './ui'
import type { DeviceEnrollment, ManagedDevice } from '../types/api'

interface ResourceOption {
  id: number
  label: string
}

interface DeviceCredentialManagerProps {
  deviceType: 'GPS' | 'BIN'
  devices: ManagedDevice[]
  resources: ResourceOption[]
  resourceLabel: string
  queryKeysToInvalidate: string[][]
  onRegister: (deviceCode: string, isSimulated: boolean) => Promise<DeviceEnrollment>
  onAssociate: (deviceId: number, resourceId: number) => Promise<ManagedDevice>
  onRotate: (deviceId: number) => Promise<{ id: number; credential: string }>
  onRevoke: (deviceId: number) => Promise<unknown>
}

export function DeviceCredentialManager({
  deviceType,
  devices,
  resources,
  resourceLabel,
  queryKeysToInvalidate,
  onRegister,
  onAssociate,
  onRotate,
  onRevoke,
}: DeviceCredentialManagerProps) {
  const queryClient = useQueryClient()
  const [deviceCode, setDeviceCode] = useState('')
  const [isSimulated, setIsSimulated] = useState(import.meta.env.DEV)
  const [selectedResources, setSelectedResources] = useState<Record<number, string>>({})
  const [issuedSecret, setIssuedSecret] = useState<{ deviceCode: string; credential: string; action: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const invalidate = async () => {
    await Promise.all(queryKeysToInvalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })))
  }

  const registerMutation = useMutation({
    mutationFn: () => onRegister(deviceCode.trim(), import.meta.env.DEV ? isSimulated : false),
    onSuccess: async (created) => {
      setDeviceCode('')
      setCopied(false)
      setIssuedSecret({
        deviceCode: created.deviceCode,
        credential: created.credential,
        action: 'registered',
      })
      await invalidate()
    },
  })

  const associateMutation = useMutation({
    mutationFn: ({ deviceId, resourceId }: { deviceId: number; resourceId: number }) =>
      onAssociate(deviceId, resourceId),
    onSuccess: invalidate,
  })

  const rotateMutation = useMutation({
    mutationFn: async (device: ManagedDevice) => {
      const rotated = await onRotate(device.id)
      return { deviceCode: device.deviceCode, credential: rotated.credential }
    },
    onSuccess: async (result) => {
      setCopied(false)
      setIssuedSecret({ ...result, action: 'credential rotated' })
      await invalidate()
    },
  })

  const revokeMutation = useMutation({
    mutationFn: (deviceId: number) => onRevoke(deviceId),
    onSuccess: invalidate,
  })

  const mutationError = registerMutation.error
    || associateMutation.error
    || rotateMutation.error
    || revokeMutation.error

  function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!deviceCode.trim()) return
    registerMutation.mutate()
  }

  async function copyCredential() {
    if (!issuedSecret) return
    await navigator.clipboard?.writeText(issuedSecret.credential).catch(() => undefined)
    setCopied(true)
  }

  return (
    <Card className="mt-8 overflow-hidden p-0">
      <div className="border-b border-slate-200 px-5 py-4">
        <h2 className="font-semibold text-slate-900">
          {deviceType === 'GPS' ? 'GPS device enrollment & credentials' : 'Smart-bin sensor enrollment & credentials'}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Credentials are hashed server-side and shown once on registration or rotation.
        </p>
      </div>

      <div className="p-5">
        <form onSubmit={handleRegister} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-medium text-slate-700">
            Device code
            <input
              type="text"
              required
              value={deviceCode}
              onChange={(event) => setDeviceCode(event.target.value)}
              placeholder={deviceType === 'GPS' ? 'e.g. GPS-UNIT-001 or SIM-GPS-03' : 'e.g. BIN-SENS-001 or SIM-IOT-04'}
              className="app-input mt-1"
            />
          </label>
          {import.meta.env.DEV && (
            <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={isSimulated}
                onChange={(event) => setIsSimulated(event.target.checked)}
                className="h-4 w-4 accent-forest-700"
              />
              Simulated test device
            </label>
          )}
          <Button type="submit" icon={Plus} disabled={registerMutation.isPending || !deviceCode.trim()}>
            {registerMutation.isPending ? 'Registering…' : 'Register device'}
          </Button>
        </form>

        {mutationError && (
          <div className="mt-4">
            <ErrorState error={mutationError} />
          </div>
        )}

        {issuedSecret && (
          <div role="status" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-semibold">
                <KeyRound size={16} aria-hidden="true" />
                One-time credential for {issuedSecret.deviceCode} ({issuedSecret.action})
              </div>
              <Button variant="secondary" icon={Copy} className="min-h-8 px-2.5 py-1 text-xs" onClick={() => void copyCredential()}>
                {copied ? 'Copied' : 'Copy credential'}
              </Button>
            </div>
            <p className="mt-1 text-xs text-amber-900">
              Store this secret in device provisioning storage or your local test runner. It cannot be retrieved again.
            </p>
            <code className="mt-2 block break-all rounded-lg bg-white/80 px-3 py-2 font-mono text-xs text-slate-900">
              {issuedSecret.credential}
            </code>
          </div>
        )}
      </div>

      {devices.length > 0 && (
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-5 py-3">Device</th>
                <th scope="col" className="px-5 py-3">Source</th>
                <th scope="col" className="px-5 py-3">Status</th>
                <th scope="col" className="px-5 py-3">Associate {resourceLabel}</th>
                <th scope="col" className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {devices.map((device) => {
                const currentResourceId = deviceType === 'GPS' ? device.vehicleId : device.binId
                const selectedValue = selectedResources[device.id] ?? (currentResourceId ? String(currentResourceId) : '')
                return (
                  <tr key={device.id}>
                    <td className="whitespace-nowrap px-5 py-3 font-medium text-slate-900">
                      {device.deviceCode}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                        device.isSimulated
                          ? 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-600/20'
                          : 'bg-slate-100 text-slate-700'
                      }`}>
                        {device.isSimulated ? 'SIMULATED' : 'PHYSICAL'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      <StatusBadge status={device.trackingStatus} />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex min-w-56 items-center gap-2">
                        <select
                          aria-label={`Select ${resourceLabel} for ${device.deviceCode}`}
                          value={selectedValue}
                          disabled={device.status !== 'ACTIVE' || associateMutation.isPending}
                          onChange={(event) => setSelectedResources((prev) => ({ ...prev, [device.id]: event.target.value }))}
                          className="app-input h-9 py-1 text-xs"
                        >
                          <option value="">Unassigned</option>
                          {resources.map((resource) => (
                            <option key={resource.id} value={resource.id}>{resource.label}</option>
                          ))}
                        </select>
                        <Button
                          variant="secondary"
                          icon={Link2}
                          className="min-h-9 shrink-0 px-2.5 py-1 text-xs"
                          disabled={device.status !== 'ACTIVE' || !selectedValue || Number(selectedValue) === currentResourceId || associateMutation.isPending}
                          onClick={() => associateMutation.mutate({ deviceId: device.id, resourceId: Number(selectedValue) })}
                        >
                          Bind
                        </Button>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          icon={RefreshCw}
                          className="min-h-8 px-2.5 py-1 text-xs"
                          disabled={device.status !== 'ACTIVE' || rotateMutation.isPending}
                          onClick={() => rotateMutation.mutate(device)}
                        >
                          Rotate
                        </Button>
                        <Button
                          variant="danger"
                          icon={device.status === 'ACTIVE' ? Trash2 : ShieldAlert}
                          className="min-h-8 px-2.5 py-1 text-xs"
                          disabled={device.status !== 'ACTIVE' || revokeMutation.isPending}
                          onClick={() => {
                            if (window.confirm(`Revoke ${device.deviceCode}? Its current credential will stop working immediately.`)) {
                              revokeMutation.mutate(device.id)
                            }
                          }}
                        >
                          {device.status === 'ACTIVE' ? 'Revoke' : 'Revoked'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
