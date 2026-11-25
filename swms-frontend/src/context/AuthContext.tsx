import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, unwrap } from '../lib/api'
import { clearSession, getStoredToken, getStoredUser, storeSession } from '../lib/auth'
import type { LoginResponse, User } from '../types/api'

interface AuthContextValue {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => getStoredUser())
  const [token, setToken] = useState<string | null>(() => getStoredToken())

  useEffect(() => {
    const unauthorized = () => {
      clearSession()
      setUser(null)
      setToken(null)
    }
    window.addEventListener('swms:unauthorized', unauthorized)
    return () => window.removeEventListener('swms:unauthorized', unauthorized)
  }, [])

  const login = async (email: string, password: string) => {
    const response = await api.post<{ data: LoginResponse }>('/api/auth/login', { email, password })
    const result = unwrap(response.data)
    storeSession(result)
    setUser(result.user)
    setToken(result.accessToken)
  }

  const logout = async () => {
    try {
      await api.post('/api/auth/logout')
    } finally {
      clearSession()
      setUser(null)
      setToken(null)
    }
  }

  const value = useMemo(() => ({
    user,
    token,
    login,
    logout,
    isAuthenticated: Boolean(user && token),
  }), [user, token])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
