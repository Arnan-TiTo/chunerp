import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Button'
import { services } from '@/services'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatDateTH } from '@/utils/format'

interface Hit {
  id: string
  title: string
  subtitle: string
  to: string
  kind: string
}

/**
 * Topbar quick-find. Searches the record types the viewer is allowed to see —
 * results a user has no permission for are never fetched, let alone rendered.
 */
export function GlobalSearch() {
  const { can } = useAuth()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setHits([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      const found: Hit[] = []
      try {
        if (can('expense:view')) {
          const page = await services.expenses.list({ search: q, pageSize: 4 })
          found.push(
            ...page.items.map((e) => ({
              id: e.id,
              title: e.expenseNo,
              subtitle: `${e.categoryName} · ${e.description}`,
              to: `/expenses/${e.id}`,
              kind: 'ค่าใช้จ่าย',
            })),
          )
        }
        if (can('booking:view')) {
          const page = await services.bookings.list({ search: q, pageSize: 4 })
          found.push(
            ...page.items.map((b) => ({
              id: b.id,
              title: b.bookingNo,
              subtitle: `${b.farmerName} · ${formatDateTH(b.bookingDate)}`,
              to: `/bookings/${b.id}`,
              kind: 'ใบจอง',
            })),
          )
        }
        if (can('farmer:view')) {
          const page = await services.farmers.list({ search: q, pageSize: 4 })
          found.push(
            ...page.items.map((f) => ({
              id: f.id,
              title: f.fullName,
              subtitle: `${f.code} · ${f.branchName}`,
              to: `/farmers/${f.id}`,
              kind: 'เกษตรกร',
            })),
          )
        }
      } catch {
        /* quick-find failures stay silent — the page search still works */
      }
      if (!cancelled) {
        setHits(found)
        setLoading(false)
      }
    }, 280)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, can])

  const go = (to: string) => {
    setOpen(false)
    setQuery('')
    navigate(to)
  }

  return (
    <div ref={boxRef} className="relative mx-4 hidden min-w-0 flex-1 md:block" style={{ maxWidth: 640 }}>
      <Icon
        name="search"
        size={15}
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
      />
      <input
        type="text"
        value={query}
        autoComplete="off"
        placeholder="ค้นหาเอกสาร (เลขที่ / ชื่อเกษตรกร)"
        aria-label="ค้นหาทั่วทั้งระบบ"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
        }}
        className="w-full rounded border-[1.5px] border-line bg-sunken py-2 pl-8 pr-3 text-[.85rem] text-ink placeholder:text-ink-faint focus:border-forest focus:bg-white focus:outline-none"
      />

      {open && query.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-[var(--z-dropdown)] mt-1 max-h-80 overflow-y-auto rounded-[10px] border-[1.5px] border-line bg-white shadow-lg app-scroll">
          {loading && (
            <p className="flex items-center gap-2 px-3.5 py-3 text-sm text-ink-faint">
              <Spinner size={15} /> กำลังค้นหา...
            </p>
          )}
          {!loading && hits.length === 0 && (
            <p className="px-3.5 py-3 text-sm text-ink-faint">ไม่พบเอกสารที่ตรงกับคำค้น</p>
          )}
          {!loading &&
            hits.map((hit) => (
              <button
                key={`${hit.kind}-${hit.id}`}
                type="button"
                onClick={() => go(hit.to)}
                className={cn(
                  'flex w-full items-center gap-3 border-b border-line-faint px-3.5 py-2.5 text-left last:border-b-0',
                  'transition-colors hover:bg-meadow-soft',
                )}
              >
                <span className="rounded-pill bg-forest-soft px-2 py-0.5 text-[.68rem] font-bold text-forest">
                  {hit.kind}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[.86rem] font-semibold text-ink">
                    {hit.title}
                  </span>
                  <span className="block truncate text-[.75rem] text-ink-faint">
                    {hit.subtitle}
                  </span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  )
}
