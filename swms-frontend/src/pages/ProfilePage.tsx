import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Eye, EyeOff, KeyRound, Mail, ShieldCheck, UserRound } from 'lucide-react'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'
import { Button, Card, PageHeader, SectionHeading, StatusBadge } from '../components/ui'
import { authService } from '../services/resources'
import { useAuth } from '../context/AuthContext'
import { useForm } from 'react-hook-form'

interface PasswordValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

type PasswordField = keyof PasswordValues

const passwordRequirements = 'Use 12–128 characters with uppercase and lowercase letters, a number, and a symbol.'

export function ProfilePage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [profileMessage, setProfileMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [visibleFields, setVisibleFields] = useState<PasswordField[]>([])
  const profile = useQuery({ queryKey: ['profile'], queryFn: authService.profile })
  const form = useForm<{ fullName: string; phone: string }>({
    values: {
      fullName: profile.data?.user.fullName || '',
      phone: profile.data?.user.phone || '',
    },
  })
  const passwordForm = useForm<PasswordValues>()

  const update = useMutation({
    mutationFn: authService.updateProfile,
    onMutate: () => setProfileMessage(''),
    onSuccess: async () => {
      setProfileMessage('Your profile details were updated.')
      await queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
  const changePassword = useMutation({
    mutationFn: ({ currentPassword, newPassword }: PasswordValues) =>
      authService.changePassword({ currentPassword, newPassword }),
    onMutate: () => setPasswordMessage(''),
    onSuccess: (result) => {
      passwordForm.reset()
      setVisibleFields([])
      setPasswordMessage(result.message || 'Your password was changed.')
    },
  })

  function toggleVisibility(field: PasswordField) {
    setVisibleFields((current) => current.includes(field)
      ? current.filter((value) => value !== field)
      : [...current, field])
  }

  function submitPassword(values: PasswordValues) {
    if (values.newPassword !== values.confirmPassword) {
      passwordForm.setError('confirmPassword', { type: 'validate', message: 'Passwords do not match.' })
      return
    }
    changePassword.mutate(values)
  }

  if (profile.isLoading) return <LoadingState label="Loading account profile…" />
  if (profile.error) return <ErrorState error={profile.error} />
  if (!profile.data) return <EmptyState label="Your account profile is not available." />

  const roleLabel = user?.role.replace(/_/g, ' ') || 'Account'

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Profile & security"
        description="Manage your personal contact details and account password."
        icon={UserRound}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,0.65fr)]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <SectionHeading
              title="Personal details"
              description="Keep the contact information associated with your SWMS account up to date."
            />
            <form onSubmit={form.handleSubmit((values) => update.mutate(values))}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label htmlFor="profile-name" className="text-sm font-semibold text-slate-700">
                  Full name
                  <input id="profile-name" {...form.register('fullName', { required: 'Enter your name.' })}
                    aria-invalid={Boolean(form.formState.errors.fullName)} className="app-input mt-2" />
                  {form.formState.errors.fullName && <span className="mt-1 block text-xs text-red-700">{form.formState.errors.fullName.message}</span>}
                </label>
                <label htmlFor="profile-phone" className="text-sm font-semibold text-slate-700">
                  Phone number
                  <input id="profile-phone" type="tel" autoComplete="tel"
                    {...form.register('phone', { maxLength: { value: 32, message: 'Use 32 characters or fewer.' } })}
                    aria-invalid={Boolean(form.formState.errors.phone)} className="app-input mt-2" />
                  {form.formState.errors.phone && <span className="mt-1 block text-xs text-red-700">{form.formState.errors.phone.message}</span>}
                </label>
              </div>
              <Button type="submit" className="mt-5" disabled={update.isPending}>
                {update.isPending ? 'Saving…' : 'Save profile'}
              </Button>
              {update.error && <div className="mt-4"><ErrorState error={update.error} /></div>}
              {profileMessage && <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" />{profileMessage}</p>}
            </form>
          </Card>

          <Card className="p-5 sm:p-6">
            <SectionHeading
              title="Change password"
              description="Your new password is validated against the server's password policy before it is saved."
            />
            <form onSubmit={passwordForm.handleSubmit(submitPassword)} noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                {([
                  ['currentPassword', 'Current password', 'current-password'],
                  ['newPassword', 'New password', 'new-password'],
                  ['confirmPassword', 'Confirm new password', 'new-password'],
                ] as const).map(([field, label, autocomplete]) => {
                  const isVisible = visibleFields.includes(field)
                  const error = passwordForm.formState.errors[field]
                  return (
                    <label key={field} htmlFor={`password-${field}`}
                      className={`text-sm font-semibold text-slate-700 ${field === 'currentPassword' ? 'sm:col-span-2' : ''}`}>
                      {label}
                      <span className="relative mt-2 block">
                        <input
                          id={`password-${field}`}
                          type={isVisible ? 'text' : 'password'}
                          autoComplete={autocomplete}
                          aria-invalid={Boolean(error)}
                          aria-describedby={error ? `password-${field}-error` : undefined}
                          {...passwordForm.register(field, field === 'currentPassword'
                            ? { required: 'Enter your current password.' }
                            : field === 'newPassword'
                              ? {
                                required: 'Enter a new password.',
                                minLength: { value: 12, message: passwordRequirements },
                                maxLength: { value: 128, message: passwordRequirements },
                                validate: (value) => (
                                  /[a-z]/.test(value)
                                  && /[A-Z]/.test(value)
                                  && /\d/.test(value)
                                  && /[^A-Za-z0-9]/.test(value)
                                ) || passwordRequirements,
                              }
                              : {
                                required: 'Confirm your new password.',
                                validate: (value) => value === passwordForm.getValues('newPassword') || 'Passwords do not match.',
                              })}
                          placeholder={field === 'currentPassword' ? 'Enter current password' : 'Enter new password'}
                          className="app-input h-11 pr-12"
                        />
                        <button
                          type="button"
                          aria-label={`${isVisible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
                          aria-pressed={isVisible}
                          onClick={() => toggleVisibility(field)}
                          className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-r-xl text-slate-500 hover:text-forest-800"
                        >
                          {isVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                        </button>
                      </span>
                      {error && <span id={`password-${field}-error`} className="mt-1 block text-xs font-normal text-red-700">{error.message}</span>}
                    </label>
                  )
                })}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-500">{passwordRequirements}</p>
              <Button type="submit" icon={KeyRound} className="mt-5" disabled={changePassword.isPending}>
                {changePassword.isPending ? 'Updating password…' : 'Update password'}
              </Button>
              {changePassword.error && <div className="mt-4"><ErrorState error={changePassword.error} /></div>}
              {passwordMessage && <p role="status" className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-800"><CheckCircle2 size={16} aria-hidden="true" />{passwordMessage}</p>}
            </form>
          </Card>
        </div>

        <Card className="h-fit p-5 sm:p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-forest-700">
            <ShieldCheck size={21} aria-hidden="true" />
          </div>
          <h2 className="mt-4 text-base font-semibold text-slate-900">Account information</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">Identity and access details for your current session.</p>
          <dl className="mt-5 divide-y divide-slate-100">
            <div className="py-3">
              <dt className="text-xs font-medium text-slate-500">Email</dt>
              <dd className="mt-1 flex items-center gap-2 break-all text-sm font-medium text-slate-800">
                <Mail size={15} className="shrink-0 text-slate-400" aria-hidden="true" />
                {profile.data.user.email}
              </dd>
            </div>
            <div className="py-3">
              <dt className="text-xs font-medium text-slate-500">Role</dt>
              <dd className="mt-1"><StatusBadge status={roleLabel} /></dd>
            </div>
            <div className="py-3">
              <dt className="text-xs font-medium text-slate-500">Account ID</dt>
              <dd className="mt-1 text-sm font-medium text-slate-800">{profile.data.user.id}</dd>
            </div>
          </dl>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            Password recovery is not available in this deployment. Contact your system administrator if you cannot sign in.
          </div>
        </Card>
      </div>
    </div>
  )
}
