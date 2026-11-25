import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { z } from 'zod'
import { Eye, EyeOff, Recycle, ShieldCheck, Truck } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

type LoginValues = z.infer<typeof loginSchema>

function errorMessage(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return 'We could not sign you in. Check your details and try again.'
}

export function LoginPage() {
  const { login, isAuthenticated } = useAuth()
  const [serverError, setServerError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>()

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const submit = async (values: LoginValues) => {
    setServerError(null)
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) return

    try {
      await login(parsed.data.email, parsed.data.password)
    } catch (error) {
      setServerError(errorMessage(error))
    }
  }

  return (
    <main className="min-h-screen bg-white lg:grid lg:grid-cols-[1.02fr_0.98fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-forest-950 px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between xl:px-16">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_18%_15%,rgba(75,170,112,0.28),transparent_38%),radial-gradient(ellipse_at_86%_84%,rgba(20,125,120,0.3),transparent_34%)]" />
        <div className="absolute -right-36 top-24 h-[30rem] w-[30rem] rounded-full border border-white/[0.07]" />
        <div className="absolute -right-20 top-40 h-[22rem] w-[22rem] rounded-full border border-white/[0.08]" />

        <Link to="/login" className="relative z-10 inline-flex w-fit items-center gap-3" aria-label="SWMS sign in">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-leaf-500 shadow-lg shadow-black/20">
            <Recycle size={25} strokeWidth={2.1} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-lg font-bold tracking-wide">SWMS</span>
            <span className="block text-[0.65rem] font-semibold tracking-[0.16em] text-emerald-100/65">WASTE OPERATIONS</span>
          </span>
        </Link>

        <div className="relative z-10 max-w-2xl pb-12">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-100/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-emerald-100/80">
            <span className="h-1.5 w-1.5 rounded-full bg-leaf-500" />
            A connected operations workspace
          </div>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.08] tracking-tight xl:text-6xl">
            Cleaner districts start with better coordination.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-emerald-50/70">
            Manage authorized service areas, coordinate collection teams, and keep operational records in one secure place.
          </p>
          <div className="mt-10 grid max-w-xl gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.08] text-emerald-200">
                <ShieldCheck size={19} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-white/85">Role-based access</span>
            </div>
            <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.08] text-emerald-200">
                <Truck size={19} aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-white/85">Field operations</span>
            </div>
          </div>
        </div>
        <div className="relative z-10 text-xs text-emerald-100/45">Secure access for authorized SWMS users</div>
      </section>

      <section className="flex min-h-screen flex-col justify-center px-5 py-10 sm:px-10 lg:px-12 xl:px-20">
        <div className="mx-auto w-full max-w-[27rem]">
          <Link to="/login" className="mb-10 inline-flex items-center gap-2 text-sm font-bold tracking-wide text-forest-900 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-800 text-white">
              <Recycle size={20} aria-hidden="true" />
            </span>
            SWMS
          </Link>

          <div className="mb-8">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-forest-700">Welcome back</div>
            <h2 className="text-3xl font-semibold tracking-tight text-slate-950">Sign in to your workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Use the email address and password associated with your authorized account.</p>
          </div>

          {serverError && (
            <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(submit)} noValidate>
            <div className="mb-5">
              <label htmlFor="login-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
              <input
                {...register('email', {
                  required: 'Enter your email address.',
                  validate: (value) => loginSchema.shape.email.safeParse(value).success || 'Enter a valid email address.',
                })}
                id="login-email"
                type="email"
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'login-email-error' : undefined}
                placeholder="name@organization.org"
                className="app-input h-12"
              />
              {errors.email && <p id="login-email-error" className="mt-1.5 text-xs text-red-700">{errors.email.message || 'Enter a valid email address.'}</p>}
            </div>

            <div className="mb-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <label htmlFor="login-password" className="text-sm font-semibold text-slate-700">Password</label>
                <Link to="/forgot-password" className="text-xs font-semibold text-forest-700 hover:text-forest-900 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  {...register('password', { required: 'Enter your password.' })}
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'login-password-error' : undefined}
                  placeholder="Enter your password"
                  className="app-input h-12 pr-12"
                />
                <button
                  type="button"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-r-xl text-slate-500 transition hover:text-forest-800"
                >
                  {showPassword
                    ? <EyeOff size={18} strokeWidth={1.8} aria-hidden="true" />
                    : <Eye size={18} strokeWidth={1.8} aria-hidden="true" />}
                </button>
              </div>
              {errors.password && <p id="login-password-error" className="mt-1.5 text-xs text-red-700">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-forest-800 px-4 text-sm font-semibold text-white shadow-sm shadow-forest-900/15 transition hover:bg-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <div className="mt-8 border-t border-slate-100 pt-5 text-center text-xs leading-5 text-slate-500">
            Access is limited to authorized SWMS accounts. Contact your system administrator if you need assistance.
          </div>
        </div>
      </section>
    </main>
  )
}
