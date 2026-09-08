import { cn } from '@/utils/cn'
import { Icon, type IconName } from './Icon'

/** `.card` — white surface, 14px radius, soft shadow, clipped content. */
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('overflow-hidden rounded-lg bg-white shadow-md', className)} {...rest}>
      {children}
    </div>
  )
}

export interface CardHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  icon?: IconName
  actions?: React.ReactNode
  className?: string
  /** Tailwind classes for the icon chip, so panels can carry a module accent. */
  iconClassName?: string
}

export function CardHeader({
  title,
  subtitle,
  icon,
  actions,
  className,
  iconClassName,
}: Readonly<CardHeaderProps>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-line-soft px-[22px] py-4',
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          <span
            className={cn(
              'grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-forest-soft text-forest',
              iconClassName,
            )}
          >
            <Icon name={icon} size={16} />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[.98rem] font-bold text-ink">{title}</h3>
          {subtitle && <p className="truncate text-xs text-ink-faint">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

export function CardBody({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('px-[22px] py-5', className)} {...rest}>
      {children}
    </div>
  )
}

export function CardFooter({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-line-soft px-[22px] py-3.5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}

/** `.ship-card` — padded panel used for detail/summary surfaces. */
export function PanelCard({
  title,
  actions,
  children,
  className,
}: Readonly<{
  title?: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}>) {
  return (
    <section className={cn('rounded-lg bg-white px-7 py-6 shadow-md', className)}>
      {title && (
        <header className="mb-5 flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}
