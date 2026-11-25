import axios, { AxiosError } from 'axios'
import type { ApiError } from '../types/api'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('swms.accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<{ error?: { code?: string; message?: string; details?: unknown[] } }>) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('swms.accessToken')
      localStorage.removeItem('swms.user')
      window.dispatchEvent(new CustomEvent('swms:unauthorized'))
    }
    const body = error.response?.data?.error
    const apiError: ApiError = {
      status: error.response?.status || 0,
      code: body?.code || 'NETWORK_ERROR',
      message: body?.message || 'The server could not be reached.',
      details: body?.details,
    }
    return Promise.reject(apiError)
  },
)

export function unwrap<T>(payload: { data: T }): T {
  return payload.data
}
