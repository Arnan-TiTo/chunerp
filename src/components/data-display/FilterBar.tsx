import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { PAGE_SIZES } from '@/constants'
import type { Option, Paginated } from '@/types/common'
import { formatNumber } from '@/utils/format'

export function SearchBox({
  value,
  onChange,
  placeholder = 'ค้นหา...',
  delay = 300,
  className,
  'aria-label': ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  delay?: number
  className?: string
  'aria-label'?: string
}) {
  const [local, setLocal] = useState(value)

  // Keep in sync when the parent resets filters.
  useEffect(() => setLocal(value), [value])

  useEffect(() => {
    if (local === value) return
    const t = window.setTimeout(() => onChange(local), delay)
    return () => window.clearTimeout(t)
    // `value` intentionally excluded — this effect debounces local edits only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local, delay])

  return (
    <div className={cn('relative', className)}>
      <Input
        type="search"
        iconLeft="search"
        value={local}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => setLocal(e.target.value)}
        className="pr-9"
      />
      {local && (
        <button
          type="button"
          aria-label="ล้างคำค้นหา"
          onClick={() => {
            setLocal('')
            onChange('')
          }}
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-ink-faint hover:bg-meadow-soft hover:text-forest"
        >
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  )
}

export interface FilterBarProps {
  children: React.ReactNode
  onReset?: () => void
  activeCount?: number
  className?: string
}

export function FilterBar({ children, onReset, activeCount = 0, className }: FilterBarProps) {
  return (
    <div
      className={cn(
        'mb-5 flex flex-col gap-3 rounded-lg bg-white p-4 shadow-md sm:flex-row sm:flex-wrap sm:items-end',
        className,
      )}
    >
      {children}
      {onReset && activeCount > 0 && (
        <Button variant="ghost" size="sm" iconLeft="x" onClick={onReset} className="sm:ml-auto">
          ล้างตัวกรอง ({activeCount})
        </Button>
      )}
    </div>
  )
}

export function FilterField({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <label className={cn('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[.72rem] font-semibold uppercase tracking-[.3px] text-ink-dim">{label}</span>
      {children}
    </label>
  )
}

export function StatusFilter({
  value,
  onChange,
  options,
  label = 'สถานะ',
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: Option[]
  label?: string
  className?: string
}) {
  return (
    <FilterField label={label} className={className}>
      <Select
        options={options}
        value={value}
        placeholder="ทั้งหมด"
        onChange={(e) => onChange(e.target.value)}
      />
    </FilterField>
  )
}

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  totalPages: number
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
  className?: string
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row',
        className,
      )}
    >
      <p className="text-[.78rem] text-ink-dim">
        แสดง <span className="font-medium dash-num">{formatNumber(from)}</span>–
        <span className="font-medium dash-num">{formatNumber(to)}</span> จาก{' '}
        <span className="font-medium dash-num">{formatNumber(total)}</span> รายการ
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="hidden items-center gap-2 text-xs text-ink-faint sm:flex">
            แสดงหน้าละ
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-lg border border-line bg-white px-2 text-xs text-ink focus:border-forest focus:outline-none"
            >
              {PAGE_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav aria-label="แบ่งหน้า" className="flex flex-wrap items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" iconLeft="chevron-left" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            ก่อนหน้า
          </Button>
          <span className="dash-num px-2 text-[.78rem] text-ink-dim">
            {page} / {Math.max(totalPages, 1)}
          </span>
          <Button size="sm" variant="ghost" iconRight="chevron-right" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
            ถัดไป
          </Button>
        </nav>
      </div>
    </div>
  )
}

/** Convenience wrapper: renders `<Pagination>` straight from a page result. */
export function PaginationFor<T>({
  data,
  onPageChange,
  onPageSizeChange,
}: {
  data: Paginated<T> | undefined
  onPageChange: (page: number) => void
  onPageSizeChange?: (size: number) => void
}) {
  if (!data) return null
  return (
    <Pagination
      page={data.page}
      pageSize={data.pageSize}
      total={data.total}
      totalPages={data.totalPages}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
    />
  )
}
