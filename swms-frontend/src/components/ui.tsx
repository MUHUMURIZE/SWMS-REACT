import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  actions?: ReactNode
  icon?: LucideIcon
}

export function PageHeader({ title, description, eyebrow, actions, icon: Icon }: PageHeaderProps) {
  return (
    <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-forest-700">{eyebrow}</div>
        )}
        <div className="flex items-center gap-3">
          {Icon && (
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-forest-700 sm:flex">
              <Icon size={21} strokeWidth={1.8} aria-hidden="true" />
            </span>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-[1.8rem]">{title}</h1>
        </div>
        {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return <section className={`app-card ${className}`} {...props}>{children}</section>
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  icon?: LucideIcon
}

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'border-transparent bg-forest-800 text-white hover:bg-forest-900 focus-visible:ring-forest-600',
  secondary: 'border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50',
  quiet: 'border-transparent bg-transparent text-slate-600 hover:bg-slate-100',
  danger: 'border-red-200 bg-red-50 text-red-700 hover:border-red-300 hover:bg-red-100',
}

export function Button({
  children,
  className = '',
  variant = 'primary',
  icon: Icon,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={16} strokeWidth={2} aria-hidden="true" />}
      {children}
    </button>
  )
}

const statusClassNames: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15',
  available: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15',
  completed: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15',
  collected: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15',
  assigned: 'bg-emerald-50 text-emerald-800 ring-emerald-600/15',
  pending: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  scheduled: 'bg-sky-50 text-sky-800 ring-sky-600/15',
  in_progress: 'bg-sky-50 text-sky-800 ring-sky-600/15',
  in_service: 'bg-sky-50 text-sky-800 ring-sky-600/15',
  medium: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  high: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  full: 'bg-red-50 text-red-700 ring-red-600/15',
  missed: 'bg-red-50 text-red-700 ring-red-600/15',
  overdue: 'bg-red-50 text-red-700 ring-red-600/15',
  inactive: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  unassigned: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  suspended: 'bg-orange-50 text-orange-800 ring-orange-600/20',
  terminated: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  expired: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  maintenance: 'bg-violet-50 text-violet-800 ring-violet-600/15',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  empty: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  low: 'bg-lime-50 text-lime-800 ring-lime-600/15',
}

export function StatusBadge({ status }: { status: string }) {
  const key = status.toLowerCase()
  const className = statusClassNames[key] || 'bg-slate-100 text-slate-700 ring-slate-500/15'
  const label = status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase())

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold ring-1 ring-inset ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" aria-hidden="true" />
      {label}
    </span>
  )
}

export function SectionHeading({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  )
}
