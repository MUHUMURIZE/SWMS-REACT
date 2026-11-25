import { beforeEach, describe, expect, it } from 'vitest'
import { clearSession, getStoredToken, getStoredUser, storeSession } from './auth'
import type { LoginResponse } from '../types/api'

describe('authentication storage', () => {
  beforeEach(() => localStorage.clear())

  it('stores and restores a login session', () => {
    const result: LoginResponse = {
      user: {
        id: 1,
        fullName: 'Test Admin',
        email: 'admin@example.com',
        role: 'ADMIN',
      },
      accessToken: 'test-jwt',
      tokenType: 'Bearer',
      expiresIn: 3600,
    }

    storeSession(result)

    expect(getStoredToken()).toBe('test-jwt')
    expect(getStoredUser()?.role).toBe('ADMIN')
  })

  it('clears a login session', () => {
    localStorage.setItem('swms.accessToken', 'test-jwt')
    localStorage.setItem('swms.user', '{}')

    clearSession()

    expect(getStoredToken()).toBeNull()
    expect(getStoredUser()).toBeNull()
  })
})
