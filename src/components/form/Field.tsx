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

/**
 * ช่องที่ "ทำอะไรกับมันได้" — พื้นขาว ตัวอักษรเข้ม
 *
 * พื้นขาวคือสัญญาณเดียวที่ผู้ใช้ต้องจำ: ขาว = พิมพ์หรือเลือกได้ · เทา = ทำไม่ได้
 * เดิมช่องปกติเป็นสีครีมอ่อน (--surface-sunken) ซึ่งห่างจากสีเทาของช่องที่
 * แก้ไม่ได้แค่ไม่กี่ค่า มองเผิน ๆ จึงแยกไม่ออกว่าช่องไหนกรอกได้
 *
 * ห้ามใส่ variant `read-only:` ในคลาสชุดนี้เด็ดขาด — ในนิยามของ CSS นั้น
 * `<select>` เข้าเงื่อนไข `:read-only` เสมอ (เพราะพิมพ์ลงไปไม่ได้) ดรอปดาวน์
 * ที่ใช้งานได้ทุกตัวจึงถูกทาสีเป็นช่องที่แก้ไม่ได้ไปด้วย สถานะอ่านอย่างเดียว
 * ต้องสั่งจากฝั่ง React ผ่าน `controlReadOnlyClass` เท่านั้น
 */
export const controlBaseClass = cn(
  'w-full rounded border-[1.5px] border-line bg-white px-[13px] text-[.94rem] text-ink',
  'placeholder:text-ink-faint transition-[border-color,box-shadow,background] duration-150',
  'focus:border-forest focus:outline-none focus:ring-2 focus:ring-meadow/25',
  'disabled:cursor-not-allowed disabled:border-line-soft disabled:bg-line-soft',
  // Chrome ทา opacity 0.7 ให้ select:disabled เอง ถ้าไม่ล้าง ดรอปดาวน์ที่ปิด
  // ใช้งานจะจางกว่าช่องกรอกที่ปิดใช้งาน ทั้งที่ควรดูเหมือนกัน
  'disabled:text-ink-faint disabled:opacity-100 disabled:shadow-none disabled:ring-0',
)

/**
 * ช่องที่แสดงค่าอย่างเดียว — เทา ไม่มีเส้นขอบเน้น และกดเข้าไปไม่ได้
 *
 * ใช้คู่กับ `tabIndex={-1}` ในตัว component เพื่อไม่ให้แป้น Tab วิ่งเข้ามาหยุด
 * ที่ช่องที่ทำอะไรไม่ได้
 */
export const controlReadOnlyClass = cn(
  'cursor-default border-line-soft bg-line-soft text-ink-dim',
  'pointer-events-none select-none focus:border-line-soft focus:ring-0',
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
