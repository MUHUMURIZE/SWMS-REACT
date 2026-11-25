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

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">{details.title}</h1>
        <p className="mt-1 text-sm text-slate-500">{details.description}</p>
      </header>

      <section role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-amber-950">Integration not configured</h2>
            <p className="mt-1 text-sm text-amber-900">
              {details.statusMessage}
            </p>
          </div>
          <span className="rounded-full border border-amber-400 px-3 py-1 text-xs font-medium text-amber-900">
            {details.statusLabel}
          </span>
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-semibold text-slate-900">Required integration work</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
          {details.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}
        </ul>
      </section>
    </div>
  )
}
