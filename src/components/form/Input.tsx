import { forwardRef, useState } from 'react'
import { cn } from '@/utils/cn'
import { Icon, type IconName } from '@/components/ui/Icon'
import {
  controlBaseClass,
  controlInvalidClass,
  controlReadOnlyClass,
  useFieldContext,
} from './Field'

type Size = 'md' | 'lg'

const HEIGHTS: Record<Size, string> = { md: 'h-[42px]', lg: 'h-12 text-base' }

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  invalid?: boolean
  inputSize?: Size
  iconLeft?: IconName
  suffix?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, inputSize = 'md', iconLeft, suffix, ...rest },
  ref,
) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  // ช่องที่แก้ไม่ได้ไม่ควรรับโฟกัส — คลิกแล้วมีเคอร์เซอร์กะพริบในช่องที่พิมพ์
  // ไม่ได้ คือการบอกผู้ใช้ผิด
  const inert = Boolean(rest.readOnly)
  return (
    <div className="relative flex w-full items-center">
      {iconLeft && (
        <Icon
          name={iconLeft}
          size={18}
          className="pointer-events-none absolute left-3 text-ink-faint"
        />
      )}
      <input
        ref={ref}
        id={rest.id ?? field?.id}
        aria-invalid={isInvalid || undefined}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        tabIndex={inert ? -1 : rest.tabIndex}
        className={cn(
          controlBaseClass,
          HEIGHTS[inputSize],
          iconLeft && 'pl-10',
          suffix && 'pr-14',
          isInvalid && controlInvalidClass,
          inert && controlReadOnlyClass,
          className,
        )}
        {...rest}
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 text-sm text-ink-faint">
          {suffix}
        </span>
      )}
    </div>
  )
})

export interface NumberInputProps extends Omit<InputProps, 'type'> {
  unit?: string
  /** Large touch-friendly presentation for the weighing / quality screens. */
  emphasis?: boolean
}

export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function NumberInput({ unit, emphasis, className, ...rest }, ref) {
    return (
      <Input
        ref={ref}
        type="number"
        inputMode="decimal"
        suffix={unit}
        className={cn(
          'dash-num',
          emphasis && 'h-16 text-3xl font-bold tracking-tight',
          className,
        )}
        {...rest}
      />
    )
  },
)

export const CurrencyInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function CurrencyInput({ className, ...rest }, ref) {
    return (
      <div className="relative flex w-full items-center">
        <span className="pointer-events-none absolute left-3 text-sm text-ink-faint">
          ฿
        </span>
        <NumberInput
          ref={ref}
          step="0.01"
          min={0}
          unit="บาท"
          className={cn('pl-7 text-right', className)}
          {...rest}
        />
      </div>
    )
  },
)

export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput({ className, ...rest }, ref) {
    const [visible, setVisible] = useState(false)
    return (
      <div className="relative flex w-full items-center">
        <Input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={cn('pr-11', className)}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
          aria-pressed={visible}
          className="absolute right-1 grid h-8 w-8 place-items-center rounded-lg text-ink-faint transition-colors hover:bg-meadow-soft hover:text-forest"
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={18} />
        </button>
      </div>
    )
  },
)

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  const inert = Boolean(rest.readOnly)
  return (
    <textarea
      ref={ref}
      rows={rows}
      id={rest.id ?? field?.id}
      aria-invalid={isInvalid || undefined}
      aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
      tabIndex={inert ? -1 : rest.tabIndex}
      className={cn(
        controlBaseClass,
        'resize-y py-2.5 leading-relaxed',
        isInvalid && controlInvalidClass,
        inert && cn(controlReadOnlyClass, 'resize-none'),
        className,
      )}
      {...rest}
    />
  )
})

export const DateInput = forwardRef<HTMLInputElement, InputProps>(
  function DateInput({ className, ...rest }, ref) {
    return <Input ref={ref} type="date" className={cn('dash-num', className)} {...rest} />
  },
)

export function DateRangeInput({
  from,
  to,
  onChange,
  disabled,
  className,
}: {
  from: string
  to: string
  onChange: (next: { from: string; to: string }) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DateInput
        value={from}
        max={to || undefined}
        disabled={disabled}
        aria-label="ตั้งแต่วันที่"
        onChange={(e) => onChange({ from: e.target.value, to })}
      />
      <span className="shrink-0 text-sm text-ink-faint">ถึง</span>
      <DateInput
        value={to}
        min={from || undefined}
        disabled={disabled}
        aria-label="ถึงวันที่"
        onChange={(e) => onChange({ from, to: e.target.value })}
      />
    </div>
  )
}
