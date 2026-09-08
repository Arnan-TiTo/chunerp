import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Skeleton } from '@/components/feedback/States'
import type { KpiFormat, KpiTone, KpiValue } from '@/types/dashboard'
import { formatCurrency, formatNumber, formatPercent, formatWeight } from '@/utils/format'

export function formatKpi(value: number, format: KpiFormat, unit?: string): string {
  switch (format) {
    case 'currency':
      return formatCurrency(value, { digits: 0 })
    case 'weight':
      return formatWeight(value)
    case 'percent':
      return formatPercent(value)
    default:
      return unit ? `${formatNumber(value)} ${unit}` : formatNumber(value)
  }
}

/** `.stat .icon` chips — one tint per tone. */
const ICON_TONE: Record<KpiTone, string> = {
  default: 'bg-forest-soft text-forest',
  info: 'bg-forest-soft text-forest',
  success: 'bg-sage-soft text-sage',
  warning: 'bg-tan-soft text-tan',
  danger: 'bg-danger-soft text-danger',
}

const DELTA_TONE = {
  up: 'text-meadow-deep',
  down: 'text-danger',
  flat: 'text-ink-faint',
}

const DELTA_ICON: Record<'up' | 'down' | 'flat', IconName> = {
  up: 'trending-up',
  down: 'trending-down',
  flat: 'arrow-right',
}

export interface KpiCardProps {
  kpi: KpiValue
  icon?: IconName
  className?: string
}

/** `.stat` — white card, uppercase label, 1.6rem value, absolute icon chip. */
export function KpiCard({ kpi, icon, className }: Readonly<KpiCardProps>) {
  const tone = kpi.tone ?? 'default'

  const body = (
    <>
      {icon && (
        <span
          className={cn(
            'absolute right-[18px] top-[18px] grid h-[34px] w-[34px] place-items-center rounded-[9px]',
            ICON_TONE[tone],
          )}
        >
          <Icon name={icon} size={18} />
        </span>
      )}

      <p className="mb-2 pr-10 text-[.76rem] font-semibold uppercase tracking-[.4px] text-ink-dim">
        {kpi.label}
      </p>

      <p className="dash-num text-[1.6rem] font-bold leading-tight text-ink">
        {formatKpi(kpi.value, kpi.format, kpi.unit)}
      </p>

      <div className="mt-1 flex min-h-[1.1rem] items-center gap-1.5 text-[.76rem]">
        {kpi.delta && (
          <span
            className={cn(
              'inline-flex items-center gap-1 font-semibold',
              DELTA_TONE[kpi.delta.direction],
            )}
          >
            <Icon name={DELTA_ICON[kpi.delta.direction]} size={12} />
            {kpi.delta.direction !== 'flat' && `${Math.abs(kpi.delta.value)}%`}
          </span>
        )}
        {kpi.delta ? (
          <span className="text-ink-faint">{kpi.delta.label}</span>
        ) : (
          kpi.hint && <span className="text-ink-faint">{kpi.hint}</span>
        )}
      </div>
    </>
  )

  const base = cn('relative rounded-lg bg-white px-[22px] py-5 shadow-md', className)

  if (kpi.href) {
    return (
      <Link
        to={kpi.href}
        className={cn(
          base,
          'block transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg',
        )}
      >
        {body}
      </Link>
    )
  }
  return <div className={base}>{body}</div>
}

export function KpiCardSkeleton() {
  return (
    <div className="rounded-lg bg-white px-[22px] py-5 shadow-md">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-2 h-3 w-20" />
    </div>
  )
}

/** `.dash-hero` — the featured metric panel, tinted by the work-area accent. */
export function HeroStat({
  eyebrow,
  value,
  unit,
  sub,
  accentClass,
  children,
  className,
}: Readonly<{
  eyebrow: string
  value: React.ReactNode
  unit?: string
  sub?: string
  accentClass: string
  children?: React.ReactNode
  className?: string
}>) {
  return (
    <div
      className={cn(
        'relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-lg px-7 py-[26px] text-white shadow-md',
        accentClass,
        className,
      )}
    >
      <div>
        <p className="text-[.68rem] font-bold uppercase tracking-[.09em] opacity-85">{eyebrow}</p>
        <p className="dash-num my-2 text-[2.6rem] font-bold leading-none">
          {value}
          {unit && <span className="ml-1.5 text-lg font-semibold opacity-85">{unit}</span>}
        </p>
        {sub && <p className="text-[.82rem] opacity-85">{sub}</p>}
      </div>
      {children}
    </div>
  )
}

/** `.dash-mini` — the small stat cards that sit beside the hero. */
export function MiniStat({
  icon,
  value,
  label,
  tone = 'default',
  href,
}: Readonly<{
  icon: IconName
  value: React.ReactNode
  label: string
  tone?: KpiTone
  href?: string
}>) {
  const inner = (
    <>
      <span
        className={cn(
          'grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[9px]',
          ICON_TONE[tone],
        )}
      >
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0">
        <span className="dash-num block text-[1.15rem] font-bold text-ink">{value}</span>
        <span className="block truncate text-[.7rem] font-semibold uppercase tracking-[.3px] text-ink-dim">
          {label}
        </span>
      </span>
    </>
  )

  const cls = 'flex flex-1 items-center gap-3 rounded bg-white px-4 py-3.5 shadow-md'
  if (href) {
    return (
      <Link to={href} className={cn(cls, 'transition-shadow hover:shadow-lg')}>
        {inner}
      </Link>
    )
  }
  return <div className={cls}>{inner}</div>
}

export function SummaryCard({
  label,
  value,
  hint,
  tone = 'default',
  emphasis,
  className,
}: Readonly<{
  label: string
  value: React.ReactNode
  hint?: string
  tone?: KpiTone
  emphasis?: boolean
  className?: string
}>) {
  const toneText = {
    default: 'text-ink',
    info: 'text-forest',
    success: 'text-sage',
    warning: 'text-tan',
    danger: 'text-danger',
  }[tone]

  return (
    <div className={cn('rounded border border-line bg-sunken px-4 py-3', className)}>
      <p className="text-[.72rem] font-semibold uppercase tracking-[.3px] text-ink-dim">{label}</p>
      <p className={cn('dash-num mt-1 font-bold', emphasis ? 'text-xl' : 'text-base', toneText)}>
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  )
}
