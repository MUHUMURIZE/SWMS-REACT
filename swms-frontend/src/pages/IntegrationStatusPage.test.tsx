import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { IntegrationStatusPage } from './IntegrationStatusPage'

describe('integration status pages', () => {
  it('does not present GPS positions as live when tracking is not configured', () => {
    const markup = renderToStaticMarkup(<IntegrationStatusPage kind="gps" />)

    expect(markup).toContain('GPS Tracking')
    expect(markup).toContain('No live data')
    expect(markup).toContain('does not generate sample positions')
  })

  it('makes clear that support requests are not submitted from the placeholder', () => {
    const markup = renderToStaticMarkup(<IntegrationStatusPage kind="support" />)

    expect(markup).toContain('not connected to a backend service')
    expect(markup).toContain('does not create or submit service requests')
  })
})
