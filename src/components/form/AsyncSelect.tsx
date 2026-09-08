import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'
import { Spinner } from '@/components/ui/Button'
import type { Option } from '@/types/common'
import { controlBaseClass, controlInvalidClass, useFieldContext } from './Field'

export interface AsyncSelectProps {
  value: string
  onChange: (value: string, option: Option | null) => void
  /** Resolves options for the typed query. */
  loadOptions: (query: string) => Promise<Option[]>
  /** Label for an already-selected value, so edit screens render immediately. */
  selectedOption?: Option | null
  placeholder?: string
  emptyText?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
  id?: string
}

interface Anchor {
  top: number
  left: number
  width: number
}

/**
 * Type-ahead select backed by a service call (§7.4 / §7.5 Async Select).
 *
 * The list is rendered in a portal and positioned from the input's rect, so it
 * escapes the cards and form sections that clip their overflow. It follows the
 * input on scroll and resize, and flips above when there is no room below.
 */
export function AsyncSelect({
  value,
  onChange,
  loadOptions,
  selectedOption,
  placeholder = 'พิมพ์เพื่อค้นหา...',
  emptyText = 'ไม่พบข้อมูลที่ค้นหา',
  disabled,
  invalid,
  className,
  id,
}: Readonly<AsyncSelectProps>) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  const inputId = id ?? field?.id
  const listboxId = `${inputId}-listbox`

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<Option[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [flipUp, setFlipUp] = useState(false)

  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const MAX_LIST_HEIGHT = 256

  const measure = useCallback(() => {
    const el = wrapRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const up = spaceBelow < MAX_LIST_HEIGHT + 16 && rect.top > spaceBelow
    setFlipUp(up)
    setAnchor({
      top: up ? rect.top - 4 : rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    measure()
    // `true` so the listbox also tracks scrolling inside any parent container.
    window.addEventListener('scroll', measure, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('scroll', measure, true)
      window.removeEventListener('resize', measure)
    }
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      loadOptions(query)
        .then((res) => {
          if (cancelled) return
          setOptions(res)
          setActiveIndex(0)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [query, open, loadOptions])

  // Closing on outside click has to consider the portalled list too.
  useEffect(() => {
    if (!open) return
    const onDocPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (wrapRef.current?.contains(target)) return
      if (listRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDocPointerDown)
    return () => document.removeEventListener('mousedown', onDocPointerDown)
  }, [open])

  const commit = (option: Option) => {
    onChange(String(option.value), option)
    setOpen(false)
    setQuery('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      const option = options[activeIndex]
      if (option) commit(option)
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const displayLabel = selectedOption?.label ?? ''

  let listBody: React.ReactNode
  if (loading) {
    listBody = (
      <li className="flex items-center gap-2 px-3 py-2.5 text-sm text-ink-faint">
        <Spinner size={15} /> กำลังค้นหา...
      </li>
    )
  } else if (options.length === 0) {
    listBody = <li className="px-3 py-2.5 text-sm text-ink-faint">{emptyText}</li>
  } else {
    listBody = options.map((option, i) => (
      <li key={String(option.value)}>
        <button
          type="button"
          role="option"
          aria-selected={String(option.value) === value}
          onMouseEnter={() => setActiveIndex(i)}
          onClick={() => commit(option)}
          className={cn(
            'flex w-full flex-col items-start px-3 py-2 text-left transition-colors',
            i === activeIndex ? 'bg-meadow-soft' : 'hover:bg-meadow-soft/60',
          )}
        >
          <span className="text-sm font-medium text-ink">{option.label}</span>
          {option.description && (
            <span className="text-xs text-ink-faint">{option.description}</span>
          )}
        </button>
      </li>
    ))
  }

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div className="relative flex w-full items-center">
        <Icon
          name="search"
          size={18}
          className="pointer-events-none absolute left-3 text-ink-faint"
        />
        <input
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-invalid={isInvalid || undefined}
          aria-describedby={field?.describedBy}
          disabled={disabled}
          value={open ? query : displayLabel}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
          className={cn(controlBaseClass, 'h-[42px] pl-10 pr-9', isInvalid && controlInvalidClass)}
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label="ล้างค่าที่เลือก"
            onClick={() => {
              onChange('', null)
              setQuery('')
            }}
            className="absolute right-2 grid h-7 w-7 place-items-center rounded-[7px] text-ink-faint hover:bg-meadow-soft hover:text-forest"
          >
            <Icon name="x" size={15} />
          </button>
        )}
      </div>

      {open &&
        anchor &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            style={{
              position: 'fixed',
              top: flipUp ? undefined : anchor.top,
              bottom: flipUp ? window.innerHeight - anchor.top : undefined,
              left: anchor.left,
              width: anchor.width,
              maxHeight: MAX_LIST_HEIGHT,
            }}
            className="app-scroll z-[var(--z-dropdown)] animate-fade-up-fast overflow-auto rounded-[10px] border border-line bg-white py-1 shadow-lg"
          >
            {listBody}
          </ul>,
          document.body,
        )}
    </div>
  )
}
