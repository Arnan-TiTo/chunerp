import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'

export interface Crumb {
  label: string
  to?: string
}

export function Breadcrumb({ items, className }: Readonly<{ items: Crumb[]; className?: string }>) {
  return (
    <nav aria-label="เส้นทางนำทาง" className={cn('min-w-0', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs text-ink-faint">
        {items.map((item, i) => {
          const last = i === items.length - 1
          return (
            <li key={`${item.label}-${i}`} className="flex items-center gap-1">
              {item.to && !last ? (
                <Link to={item.to} className="rounded transition-colors hover:text-forest hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn(last && 'font-semibold text-ink-dim')}>
                  {item.label}
                </span>
              )}
              {!last && <Icon name="chevron-right" size={11} className="opacity-60" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  breadcrumb?: Crumb[]
  backTo?: string
  actions?: React.ReactNode
  /** Rendered under the title row — filters, tabs, context switchers. */
  children?: React.ReactNode
  className?: string
}

/** `.page-head` — title block left, actions right, both bottom-aligned. */
export function PageHeader({
  title,
  subtitle,
  breadcrumb,
  backTo,
  actions,
  children,
  className,
}: Readonly<PageHeaderProps>) {
  return (
    <header className={cn('mb-6 flex flex-col gap-3', className)}>
      {breadcrumb && breadcrumb.length > 0 && <Breadcrumb items={breadcrumb} />}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-start gap-2.5">
          {backTo && (
            <Link
              to={backTo}
              aria-label="ย้อนกลับ"
              className="mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border-[1.5px] border-line bg-white text-ink-dim transition-colors hover:border-forest hover:text-forest"
            >
              <Icon name="arrow-left" size={16} />
            </Link>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[1.35rem] font-bold text-ink">{title}</h1>
            {subtitle && <p className="mt-[3px] text-[.86rem] text-ink-dim">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{actions}</div>}
      </div>
      {children}
    </header>
  )
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: Readonly<{
  tabs: { id: string; label: string; count?: number }[]
  active: string
  onChange: (id: string) => void
  className?: string
}>) {
  return (
    <div role="tablist" className={cn('app-scroll flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((tab) => {
        const isActive = tab.id === active
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px flex shrink-0 items-center gap-2 border-b-[3px] px-4 py-2.5 text-[.87rem] font-semibold transition-colors',
              isActive
                ? 'border-meadow text-forest'
                : 'border-transparent text-ink-dim hover:border-line hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  'dash-num rounded-pill px-1.5 py-0.5 text-[11px]',
                  isActive ? 'bg-forest-soft text-forest' : 'bg-line-soft text-ink-faint',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** `.ship-data-item` grid — uppercase label over value. */
export function DescriptionList({
  items,
  columns = 2,
  className,
}: Readonly<{
  items: { label: string; value: React.ReactNode; span?: boolean }[]
  columns?: 1 | 2 | 3 | 4
  className?: string
}>) {
  const cols = {
    1: '',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns]
  return (
    <dl className={cn('grid grid-cols-1 gap-x-6 gap-y-5', cols, className)}>
      {items.map((item, i) => (
        <div key={`${item.label}-${i}`} className={cn(item.span && 'sm:col-span-full')}>
          <dt className="mb-[3px] text-[.72rem] font-semibold uppercase tracking-[.3px] text-ink-dim">
            {item.label}
          </dt>
          <dd className="text-[.95rem] font-semibold text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
