import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { authService } from '../services/resources'
import { EmptyState, ErrorState, LoadingState } from '../components/PageState'

export function ProfilePage() {
  const queryClient = useQueryClient()
  const profile = useQuery({ queryKey: ['profile'], queryFn: authService.profile })
  const form = useForm<{ fullName: string; phone: string }>({
    values: {
      fullName: profile.data?.user.fullName || '',
      phone: profile.data?.user.phone || '',
    },
  })
  const passwordForm = useForm<{ currentPassword: string; newPassword: string }>()
  const update = useMutation({
    mutationFn: authService.updateProfile,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['profile'] }),
  })
  const changePassword = useMutation({ mutationFn: authService.changePassword })

  if (profile.isLoading) return <LoadingState label="Loading profile..." />
  if (profile.error) return <ErrorState error={profile.error} />
  if (!profile.data) return <EmptyState label="Profile unavailable." />

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">Profile and Security</h1>
      <form onSubmit={form.handleSubmit((values) => update.mutate(values))}
        className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Personal details</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm text-slate-700">Full name
            <input {...form.register('fullName')} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
          <label className="text-sm text-slate-700">Phone
            <input {...form.register('phone')} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>
        </div>
        <button disabled={update.isPending} className="mt-5 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
          {update.isPending ? 'Saving...' : 'Save changes'}
        </button>
        {update.error && <div className="mt-4"><ErrorState error={update.error} /></div>}
      </form>
      <form onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))}
        className="rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="font-semibold text-slate-900">Change password</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <input {...passwordForm.register('currentPassword', { required: true })} type="password" placeholder="Current password"
            className="rounded-lg border border-slate-300 px-3 py-2.5" />
          <input {...passwordForm.register('newPassword', { required: true })} type="password" placeholder="New strong password"
            className="rounded-lg border border-slate-300 px-3 py-2.5" />
        </div>
        <button disabled={changePassword.isPending} className="mt-5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60">
          {changePassword.isPending ? 'Changing...' : 'Change password'}
        </button>
        {changePassword.error && <div className="mt-4"><ErrorState error={changePassword.error} /></div>}
        {changePassword.data && <div className="mt-4 text-sm text-emerald-700">{changePassword.data.message}</div>}
      </form>
    </div>
  )
}
