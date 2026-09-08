import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, ErrorState, SkeletonTable } from '@/components/feedback/States'

export interface Column<T> {
  key: string
  header: React.ReactNode
  /** Cell renderer. Keep it pure — no fetching from inside a cell. */
  cell: (row: T) => React.ReactNode
  align?: 'left' | 'right' | 'center'
  sortable?: boolean
  width?: string
  /** Hide below the given breakpoint so tables stay usable on tablets. */
  hideBelow?: 'sm' | 'md' | 'lg'
  className?: string
}

export interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string
  loading?: boolean
  error?: unknown
  onRetry?: () => void
  onRowClick?: (row: T) => void
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  onSortChange?: (key: string, dir: 'asc' | 'desc') => void
  emptyTitle?: string
  emptyDescription?: string
  emptyAction?: React.ReactNode
  /** Rendered under the table — pagination usually. */
  footer?: React.ReactNode
  className?: string
}

const HIDE_CLASSES = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}

function alignClass(align: Column<unknown>['align'], numeric = false): string {
  if (align === 'right') return numeric ? 'text-right dash-num' : 'text-right'
  if (align === 'center') return 'text-center'
  return 'text-left'
}

/** Navy header row, 22px cell padding, tinted hover — matching `table` in the portal. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading,
  error,
  onRetry,
  onRowClick,
  sortBy,
  sortDir = 'asc',
  onSortChange,
  emptyTitle = 'ยังไม่มีข้อมูล',
  emptyDescription,
  emptyAction,
  footer,
  className,
}: Readonly<DataTableProps<T>>) {
  if (error) {
    return (
      <div className={cn('rounded-lg bg-white shadow-md', className)}>
        <ErrorState error={error} onRetry={onRetry} />
      </div>
    )
  }

  let content: React.ReactNode
  if (loading) {
    content = <SkeletonTable columns={Math.min(columns.length, 6)} />
  } else if (rows.length === 0) {
    content = (
      <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
    )
  } else {
    content = (
      <div className="app-scroll overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse">
          <thead>
            <tr>
              {columns.map((col) => {
                const active = sortBy === col.key
                let ariaSort: 'ascending' | 'descending' | undefined
                if (active) ariaSort = sortDir === 'asc' ? 'ascending' : 'descending'
                return (
                  <th
                    key={col.key}
                    scope="col"
                    style={col.width ? { width: col.width } : undefined}
                    aria-sort={ariaSort}
                    className={cn(
                      'border-b border-forest-dark bg-forest px-[22px] py-[11px] text-[.72rem] font-bold uppercase tracking-[.5px] text-white',
                      alignClass(col.align),
                      col.hideBelow && HIDE_CLASSES[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.sortable && onSortChange ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSortChange(col.key, active && sortDir === 'asc' ? 'desc' : 'asc')
                        }
                        className={cn(
                          'inline-flex items-center gap-1 rounded transition-opacity hover:opacity-80',
                          col.align === 'right' && 'flex-row-reverse',
                        )}
                      >
                        {col.header}
                        <Icon
                          name={active && sortDir === 'desc' ? 'chevron-down' : 'chevron-up'}
                          size={12}
                          className={cn(!active && 'opacity-45')}
                        />
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === 'Enter') onRowClick(row)
                      }
                    : undefined
                }
                className={cn(
                  'transition-colors',
                  onRowClick && 'cursor-pointer focus:outline-none',
                  'hover:bg-[#f8faf6] focus:bg-[#f8faf6]',
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'border-b border-line-faint px-[22px] py-[13px] align-middle text-[.86rem] text-ink',
                      alignClass(col.align, true),
                      col.hideBelow && HIDE_CLASSES[col.hideBelow],
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={cn('overflow-hidden rounded-lg bg-white shadow-md', className)}>
      {content}
      {footer && !loading && rows.length > 0 && (
        <div className="border-t border-line">{footer}</div>
      )}
    </div>
  )
}

/** `.docno-link` — the document-number cell style used across every list. */
export function DocLink({
  to,
  children,
  onClick,
}: Readonly<{ to?: string; children: React.ReactNode; onClick?: () => void }>) {
  const cls =
    'font-semibold text-forest underline decoration-transparent underline-offset-2 transition-[text-decoration-color] hover:decoration-forest'
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls}>
        {children}
      </button>
    )
  }
  return (
    <a href={to} className={cls}>
      {children}
    </a>
  )
}
