import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate } from 'react-router-dom'
import { z } from 'zod'
import { useAuth } from '../context/AuthContext'
import type { ApiError } from '../types/api'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>()

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const submit = async (values: LoginValues) => {
    setServerError(null)
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) return
    try {
      await login(parsed.data.email, parsed.data.password)
    } catch (error) {
      setServerError((error as ApiError).message)
    }
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(135deg,#102a43,#164e63)] px-4 py-12">
      <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-2xl bg-white shadow-2xl md:grid-cols-[1fr_420px]">
          <div className="hidden bg-emerald-600 p-12 text-white md:block">
            <div className="mb-16 text-2xl font-bold">SWMS</div>
            <h1 className="max-w-sm text-4xl font-semibold leading-tight">Smart waste operations for every district.</h1>
            <p className="mt-5 max-w-sm text-emerald-50">A secure, role-based platform for collections, bins, and national oversight.</p>
          </div>
          <form onSubmit={handleSubmit(submit)} className="p-8 sm:p-12">
            <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
            <p className="mt-2 text-sm text-slate-500">Use your authorized SWMS account.</p>
            {serverError && <div className="mt-5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{serverError}</div>}
            <label className="mt-8 block text-sm font-medium text-slate-700">Email
              <input {...register('email', { required: true })} type="email" autoComplete="email"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            </label>
            {errors.email && <p className="mt-1 text-xs text-red-600">Enter a valid email address.</p>}
            <label className="mt-5 block text-sm font-medium text-slate-700">Password
              <input {...register('password', { required: true })} type="password" autoComplete="current-password"
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            </label>
            <button disabled={isSubmitting} className="mt-7 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60">
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
