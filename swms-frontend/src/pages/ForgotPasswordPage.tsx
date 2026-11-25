import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { ArrowLeft, CircleHelp, Recycle } from 'lucide-react'

interface RecoveryValues {
  email: string
}

export function ForgotPasswordPage() {
  const [checked, setChecked] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RecoveryValues>()

  const checkAvailability = async () => {
    setChecked(true)
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_12%_10%,#e0f0e5,transparent_38%),#f4f7f5] px-4 py-10">
      <div className="w-full max-w-[28rem]">
        <Link to="/login" aria-label="SWMS sign in" className="mb-6 inline-flex items-center gap-2 text-sm font-bold tracking-wide text-forest-900">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-forest-800 text-white">
            <Recycle size={20} aria-hidden="true" />
          </span>
          SWMS
        </Link>

        <section className="app-card p-6 sm:p-8">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-forest-700">
            <CircleHelp size={23} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Password recovery</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter your account email to check the available recovery options.
          </p>

          <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
            Password recovery is not configured. This app has no recovery endpoint; submitting this form will not send an email or change your password. Contact your system administrator.
          </div>

          {checked && (
            <div role="alert" className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              No recovery request was sent. Contact your administrator for account assistance.
            </div>
          )}

          <form onSubmit={handleSubmit(checkAvailability)} noValidate className="mt-6">
            <label htmlFor="recovery-email" className="mb-2 block text-sm font-semibold text-slate-700">Email address</label>
            <input
              {...register('email', {
                required: 'Enter your account email.',
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address.' },
              })}
              id="recovery-email"
              type="email"
              autoComplete="email"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? 'recovery-email-error' : undefined}
              placeholder="name@organization.org"
              className="app-input h-12"
            />
            {errors.email && <p id="recovery-email-error" className="mt-1.5 text-xs text-red-700">{errors.email.message}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-xl bg-forest-800 px-4 text-sm font-semibold text-white transition hover:bg-forest-900 disabled:opacity-60"
            >
              Check recovery availability
            </button>
          </form>

          <Link to="/login" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-forest-700 hover:text-forest-900">
            <ArrowLeft size={16} aria-hidden="true" />
            Back to sign in
          </Link>
        </section>
      </div>
    </main>
  )
}
