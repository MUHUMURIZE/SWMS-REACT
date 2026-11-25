// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { AuthProvider } from '../context/AuthContext'
import { ForgotPasswordPage } from './ForgotPasswordPage'
import { LoginPage } from './LoginPage'

describe('authentication pages', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('allows the sign-in password to be revealed and hidden', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AuthProvider>
            <LoginPage />
          </AuthProvider>
        </MemoryRouter>,
      )
    })

    const password = container.querySelector<HTMLInputElement>('#login-password')
    expect(password?.type).toBe('password')

    const showButton = container.querySelector<HTMLButtonElement>('[aria-label="Show password"]')
    expect(showButton).not.toBeNull()
    await act(async () => showButton?.click())
    expect(password?.type).toBe('text')
    expect(container.querySelector('[aria-label="Hide password"]')).not.toBeNull()

    const hideButton = container.querySelector<HTMLButtonElement>('[aria-label="Hide password"]')
    await act(async () => hideButton?.click())
    expect(password?.type).toBe('password')

    await act(async () => root.unmount())
  })

  it('clearly states that password recovery is unavailable and sends no email', () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>,
    )

    expect(markup).toContain('no recovery endpoint')
    expect(markup).toContain('will not send an email or change your password')
  })
})
