import { cn } from '@/utils/cn'
import type { StatusMeta, StatusTone } from '@/constants'
import { Icon, type IconName } from './Icon'

/**
 * `.badge` — §3 requires status to carry colour *and* a label *and* an icon,
 * never colour alone.
 */
const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-[#e9eee6] text-ink-dim',
  info: 'bg-forest-soft text-forest',
  success: 'bg-meadow-soft text-meadow-deep',
  warning: 'bg-tan-soft text-[#7d5629]',
  danger: 'bg-danger-soft text-danger',
  active: 'bg-sage-soft text-sage',
}

const BASE =
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border border-current/25 font-bold'

export interface StatusBadgeProps {
  status: StatusMeta
  size?: 'sm' | 'md'
  className?: string
}

export function StatusBadge({ status, size = 'sm', className }: Readonly<StatusBadgeProps>) {
  return (
    <span
      className={cn(
        BASE,
        size === 'sm' ? 'px-2.5 py-[3px] text-[.72rem]' : 'px-3 py-1 text-[.82rem]',
        TONE_CLASSES[status.tone],
        className,
      )}
    >
      <Icon name={status.icon as IconName} size={size === 'sm' ? 12 : 14} />
      {status.label}
    </span>
  )
}

/** Free-form badge for API-supplied statuses that have no local registry. */
export function Badge({
  tone = 'neutral',
  icon,
  children,
  className,
}: Readonly<{
  tone?: StatusTone
  icon?: IconName
  children: React.ReactNode
  className?: string
}>) {
  return (
    <span className={cn(BASE, 'px-2.5 py-[3px] text-[.72rem]', TONE_CLASSES[tone], className)}>
      {icon && <Icon name={icon} size={12} />}
      {children}
    </span>
  )
}
