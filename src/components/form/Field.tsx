import { createContext, useContext, useId } from 'react'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'

interface FieldContextValue {
  id: string
  describedBy?: string
  invalid: boolean
  disabled: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext)
}

export interface FieldProps {
  label?: React.ReactNode
  required?: boolean
  error?: string
  hint?: string
  /** Renders to the right of the label — units, helper links, etc. */
  addon?: React.ReactNode
  disabled?: boolean
  className?: string
  children: React.ReactNode
}

/**
 * Label + control + hint/error wrapper. Wiring `id` / `aria-describedby` here
 * keeps every input accessible without each screen re-doing it (QA-006).
 */
export function Field({
  label,
  required,
  error,
  hint,
  addon,
  disabled = false,
  className,
  children,
}: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: Boolean(error), disabled }}>
      <div className={cn('flex flex-col gap-1.5', className)}>
        {label && (
          <div className="flex items-baseline justify-between gap-2">
            <label
              htmlFor={id}
              className={cn(
                'text-[.78rem] font-semibold uppercase tracking-[.2px] text-ink-dim',
                disabled && 'opacity-60',
              )}
            >
              {label}
              {required && (
                <span className="ml-1 text-danger" aria-hidden="true">
                  *
                </span>
              )}
            </label>
            {addon}
          </div>
        )}
        {children}
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-start gap-1.5 text-xs font-semibold text-danger"
          >
            <Icon name="alert" size={14} className="mt-px" />
            {error}
          </p>
        ) : (
          hint && (
            <p id={hintId} className="text-xs text-ink-faint">
              {hint}
            </p>
          )
        )}
      </div>
    </FieldContext.Provider>
  )
}

export const controlBaseClass = cn(
  'w-full rounded border-[1.5px] border-line bg-sunken px-[13px] text-[.94rem] text-ink',
  'placeholder:text-ink-faint transition-[border-color,background] duration-150',
  'focus:border-forest focus:bg-white focus:outline-none',
  'disabled:cursor-not-allowed disabled:bg-line-faint disabled:opacity-70',
  'read-only:bg-line-faint read-only:text-ink-dim',
)

export const controlInvalidClass = 'border-danger focus:border-danger'

/** Groups related fields into the numbered sections used by the expense form (§8.2). */
export function FormSection({
  title,
  step,
  description,
  actions,
  children,
  className,
}: {
  title: string
  step?: number
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        'overflow-hidden rounded-lg bg-white shadow-md',
        className,
      )}
    >
      <header className="flex items-start justify-between gap-3 border-b border-line-soft px-[22px] py-4">
        <div className="flex items-center gap-3">
          {step != null && (
            <span className="dash-num grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[color:var(--accent)] text-sm font-bold text-white">
              {step}
            </span>
          )}
          <div>
            <h2 className="text-[.98rem] font-bold text-ink">
              {title}
            </h2>
            {description && (
              <p className="text-xs text-ink-faint">{description}</p>
            )}
          </div>
        </div>
        {actions}
      </header>
      <div className="px-[22px] py-5">{children}</div>
    </section>
  )
}

/** Responsive form grid — 1 column on phones, up to 12 on desktop. */
export function FormGrid({
  columns = 2,
  children,
  className,
}: {
  columns?: 1 | 2 | 3 | 4
  children: React.ReactNode
  className?: string
}) {
  const cols = {
    1: 'sm:grid-cols-1',
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  }[columns]
  return <div className={cn('grid grid-cols-1 gap-4', cols, className)}>{children}</div>
}

export function FormRow({
  span = 1,
  children,
  className,
}: {
  span?: 1 | 2 | 3 | 4 | 'full'
  children: React.ReactNode
  className?: string
}) {
  const spanClass = {
    1: '',
    2: 'sm:col-span-2',
    3: 'sm:col-span-2 lg:col-span-3',
    4: 'sm:col-span-2 lg:col-span-4',
    full: 'col-span-full',
  }[span]
  return <div className={cn(spanClass, className)}>{children}</div>
}
