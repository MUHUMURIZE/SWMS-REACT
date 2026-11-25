import { CircleHelp, Map, ShieldCheck } from 'lucide-react'
import { Card, PageHeader } from '../components/ui'

type IntegrationKind = 'gps' | 'devices' | 'support'

const pageDetails: Record<IntegrationKind, {
  title: string
  description: string
  statusLabel: string
  statusMessage: string
  requirements: string[]
}> = {
  gps: {
    title: 'GPS Tracking',
    description: 'Live vehicle and collector locations are not available in this deployment.',
    statusLabel: 'No live data',
    statusMessage: 'This screen does not generate sample positions or routes.',
    requirements: [
      'An authenticated location-ingestion API and configured GPS devices',
      'Location freshness, history, and access rules enforced by the backend',
      'A configured map tile provider before displaying verified positions',
    ],
  },
  devices: {
    title: 'IoT Device Readiness',
    description: 'No connected bin sensors or device telemetry feed are configured.',
    statusLabel: 'No device feed',
    statusMessage: 'This screen does not generate sample sensor readings.',
    requirements: [
      'Device enrollment and secure device credentials',
      'A backend telemetry endpoint with validation and audit history',
      'Sensor readings linked to authorized bins and visibly timestamped',
    ],
  },
  support: {
    title: 'Support & Service Requests',
    description: 'Request submission and tracking are not connected to a backend service.',
    statusLabel: 'Not connected',
    statusMessage: 'This screen does not create or submit service requests.',
    requirements: [
      'A service-request API with household and staff authorization',
      'Request status, ownership, and notification workflows',
      'Audit history for updates and resolution',
    ],
  },
}

export function IntegrationStatusPage({ kind }: { kind: IntegrationKind }) {
  const details = pageDetails[kind]
  const icon = kind === 'gps' ? Map : kind === 'devices' ? ShieldCheck : CircleHelp

  return (
    <div>
      <PageHeader title={details.title} description={details.description} icon={icon} />

      <Card role="status" className="border-amber-200 bg-amber-50 p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-amber-950">
              <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
              Integration not configured
            </h2>
            <p className="mt-1 text-sm text-amber-900">
              {details.statusMessage}
            </p>
          </div>
          <span className="rounded-full border border-amber-400 bg-white/70 px-3 py-1.5 text-xs font-semibold text-amber-900">
            {details.statusLabel}
          </span>
        </div>
      </Card>

      <Card className="mt-5 p-5 sm:p-6">
        <h2 className="font-semibold text-slate-900">Required integration work</h2>
        <ul className="mt-4 space-y-3">
          {details.requirements.map((requirement) => (
            <li key={requirement} className="flex items-start gap-3 text-sm leading-6 text-slate-600">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-forest-600" aria-hidden="true" />
              {requirement}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
