import { forwardRef } from 'react'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'
import type { Option } from '@/types/common'

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: React.ReactNode
  description?: string
  /** Bigger hit area for the tablet-first quality form (§7.7). */
  emphasis?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  function Checkbox({ label, description, emphasis, className, ...rest }, ref) {
    return (
      <label
        className={cn(
          'group flex cursor-pointer items-start gap-2.5 rounded border border-transparent transition-colors',
          emphasis
            ? 'border-line-soft bg-white px-3 py-3 hover:border-forest hover:bg-meadow-soft has-[:checked]:border-forest has-[:checked]:bg-meadow-soft'
            : 'py-1',
          rest.disabled && 'cursor-not-allowed opacity-60',
          className,
        )}
      >
        <input
          ref={ref}
          type="checkbox"
          className={cn(
            'mt-0.5 shrink-0 cursor-pointer appearance-none rounded-[4px] border-2 border-line bg-white transition-colors',
            'checked:border-forest checked:bg-forest',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meadow/40 focus-visible:ring-offset-1',
            'disabled:cursor-not-allowed',
            emphasis ? 'h-5 w-5' : 'h-[18px] w-[18px]',
            "bg-[length:80%] bg-center bg-no-repeat checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%206%209%2017l-5-5%22%2F%3E%3C%2Fsvg%3E')]",
          )}
          {...rest}
        />
        <span className="min-w-0">
          <span
            className={cn(
              'block text-ink',
              emphasis ? 'text-sm font-medium' : 'text-sm',
            )}
          >
            {label}
          </span>
          {description && (
            <span className="block text-xs text-ink-faint">{description}</span>
          )}
        </span>
      </label>
    )
  },
)

export interface RadioGroupProps {
  name: string
  value: string | undefined
  onChange: (value: string) => void
  options: Option[]
  /**
   * `cards` = boxed options; `ticks` = square tick-boxes drawn exactly like the
   * ☐ pairs on the paper slip, while still holding a single value.
   */
  variant?: 'inline' | 'cards' | 'ticks'
  disabled?: boolean
  invalid?: boolean
  className?: string
}

export function RadioGroup({
  name,
  value,
  onChange,
  options,
  variant = 'inline',
  disabled,
  invalid,
  className,
}: RadioGroupProps) {
  return (
    <div
      role="radiogroup"
      aria-invalid={invalid || undefined}
      className={cn(
        variant === 'inline'
          ? 'flex flex-wrap gap-x-5 gap-y-2'
          : 'grid grid-cols-2 gap-2 sm:flex sm:flex-wrap',
        className,
      )}
    >
      {options.map((o) => {
        const checked = value === String(o.value)
        return (
          <label
            key={String(o.value)}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 transition-colors',
              variant !== 'inline' && 'rounded border px-3 py-2.5 sm:min-w-[9rem]',
              variant !== 'inline' &&
                (checked
                  ? 'border-forest bg-meadow-soft shadow-sm'
                  : 'border-line-soft bg-white hover:border-forest hover:bg-meadow-soft'),
              (disabled || o.disabled) && 'cursor-not-allowed opacity-60',
            )}
          >
            <input
              type="radio"
              name={name}
              value={String(o.value)}
              checked={checked}
              disabled={disabled || o.disabled}
              onChange={() => onChange(String(o.value))}
              className={cn(
                'h-[18px] w-[18px] shrink-0 cursor-pointer appearance-none border-2 border-line bg-white transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-meadow/40 focus-visible:ring-offset-1',
                'disabled:cursor-not-allowed',
                variant === 'ticks'
                  ? cn(
                      'rounded-[4px] checked:border-forest checked:bg-forest',
                      "bg-[length:80%] bg-center bg-no-repeat checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23ffffff%22%20stroke-width%3D%223.5%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M20%206%209%2017l-5-5%22%2F%3E%3C%2Fsvg%3E')]",
                    )
                  : 'rounded-full checked:border-[6px] checked:border-forest',
              )}
            />
            <span className="min-w-0">
              <span className="block text-sm text-ink">{o.label}</span>
              {o.description && (
                <span className="block text-xs text-ink-faint">
                  {o.description}
                </span>
              )}
            </span>
          </label>
        )
      })}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: React.ReactNode
  description?: string
  disabled?: boolean
  className?: string
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">
          {label}
        </span>
        {description && (
          <span className="block text-xs text-ink-faint">{description}</span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
          checked
            ? 'border-forest bg-forest'
            : 'border-line bg-line-faint',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
    </label>
  )
}

/** Tick-box row that mirrors the printed slip: ☐ label ☐ label */
export function CheckboxRow({
  title,
  children,
  className,
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6', className)}>
      <span className="shrink-0 text-sm font-medium text-ink-dim underline decoration-line decoration-1 underline-offset-4">
        {title}
      </span>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">{children}</div>
    </div>
  )
}

export function ReadOnlyValue({
  label,
  value,
  hint,
  emphasis,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: string
  emphasis?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-sm font-medium text-ink-dim">{label}</span>
      <span
        className={cn(
          'flex min-h-[2.5rem] items-center rounded border border-line-soft bg-line-faint px-3 text-ink',
          emphasis ? 'text-lg font-semibold dash-num' : 'text-sm',
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </div>
  )
}

export function LockedNotice({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded border bg-[color:var(--status-warning-bg)] px-3 py-2 text-xs text-[color:var(--status-warning-fg)]">
      <Icon name="lock" size={14} className="mt-px" />
      {children}
    </p>
  )
}
