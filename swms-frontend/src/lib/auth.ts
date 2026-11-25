import type { LoginResponse, User } from '../types/api'

export function getStoredUser(): User | null {
  try {
    const value = localStorage.getItem('swms.user')
    return value ? JSON.parse(value) as User : null
  } catch {
    return null
  }
}

export function getStoredToken(): string | null {
  return localStorage.getItem('swms.accessToken')
}

export function storeSession(result: LoginResponse) {
  localStorage.setItem('swms.accessToken', result.accessToken)
  localStorage.setItem('swms.user', JSON.stringify(result.user))
}

export function clearSession() {
  localStorage.removeItem('swms.accessToken')
  localStorage.removeItem('swms.user')
}
