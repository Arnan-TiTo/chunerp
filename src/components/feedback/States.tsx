import { cn } from '@/utils/cn'
import { Button, LinkButton } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { toUserMessage } from '@/utils/errors'

/**
 * §1 — every screen must be able to render Loading / Empty / Error / Success /
 * Permission-denied. These are the shared implementations.
 */

export function EmptyState({
  icon = 'archive',
  title,
  description,
  action,
  className,
}: {
  icon?: IconName
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-meadow-soft text-ink-faint">
        <Icon name={icon} size={26} />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {description && (
          <p className="mt-1 max-w-sm text-sm text-ink-faint">{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}

export function ErrorState({
  error,
  onRetry,
  title = 'ไม่สามารถโหลดข้อมูลได้',
  className,
}: {
  error: unknown
  onRetry?: () => void
  title?: string
  className?: string
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-14 text-center',
        className,
      )}
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]">
        <Icon name="alert" size={26} />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        <p className="mt-1 max-w-md text-sm text-ink-faint">
          {toUserMessage(error)}
        </p>
      </div>
      {onRetry && (
        <Button variant="ghost" iconLeft="refresh" onClick={onRetry}>
          ลองใหม่อีกครั้ง
        </Button>
      )}
    </div>
  )
}

export function PermissionDenied({
  message = 'บัญชีของคุณไม่มีสิทธิ์เข้าถึงส่วนนี้ หากต้องการใช้งานกรุณาติดต่อผู้ดูแลระบบ',
  className,
}: {
  message?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-16 text-center',
        className,
      )}
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)]">
        <Icon name="shield" size={26} />
      </span>
      <div>
        <p className="text-[15px] font-semibold text-ink">
          ไม่มีสิทธิ์เข้าถึง
        </p>
        <p className="mt-1 max-w-md text-sm text-ink-faint">{message}</p>
      </div>
      <LinkButton to="/dashboard" variant="ghost" iconLeft="home">
        กลับหน้าแดชบอร์ด
      </LinkButton>
    </div>
  )
}

export function NotFoundState({ what = 'หน้า' }: { what?: string }) {
  return (
    <EmptyState
      icon="search"
      title={`ไม่พบ${what}ที่ต้องการ`}
      description="ลิงก์อาจไม่ถูกต้อง หรือข้อมูลถูกลบไปแล้ว"
      action={
        <LinkButton to="/dashboard" variant="ghost" iconLeft="home">
          กลับหน้าแดชบอร์ด
        </LinkButton>
      }
    />
  )
}

/* ── Skeletons — must preserve layout so pages never jump (§7.2) ────────── */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden="true" />
}

export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className={cn('h-3.5', i === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}

export function SkeletonTable({
  rows = 6,
  columns = 5,
}: {
  rows?: number
  columns?: number
}) {
  return (
    <div className="flex flex-col" aria-hidden="true" data-testid="skeleton-table">
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-line-soft px-4 py-3.5 last:border-b-0"
        >
          {Array.from({ length: columns }).map((__, c) => (
            <Skeleton
              key={c}
              className={cn('h-3.5', c === 0 ? 'w-28' : c === columns - 1 ? 'w-16' : 'flex-1')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Inline banner for non-blocking notices (dependency TODOs, API caveats). */
export function InfoBanner({
  tone = 'info',
  icon = 'info',
  title,
  children,
  className,
}: {
  tone?: 'info' | 'warning' | 'success' | 'danger'
  icon?: IconName
  title?: string
  children?: React.ReactNode
  className?: string
}) {
  const tones = {
    info: 'bg-[color:var(--status-info-bg)] text-[color:var(--status-info-fg)]',
    warning:
      'bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)]',
    success:
      'bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]',
    danger:
      'bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]',
  }
  return (
    <div
      className={cn('flex items-start gap-2.5 rounded border px-3.5 py-3', tones[tone], className)}
    >
      <Icon name={icon} size={17} className="mt-0.5" />
      <div className="min-w-0 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'leading-relaxed')}>{children}</div>}
      </div>
    </div>
  )
}
