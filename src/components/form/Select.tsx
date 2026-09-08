import { forwardRef } from 'react'
import { cn } from '@/utils/cn'
import { Icon } from '@/components/ui/Icon'
import type { Option } from '@/types/common'
import { controlBaseClass, controlInvalidClass, useFieldContext } from './Field'

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[]
  placeholder?: string
  invalid?: boolean
  selectSize?: 'md' | 'lg'
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder = 'เลือก...', className, invalid, selectSize = 'md', ...rest },
  ref,
) {
  const field = useFieldContext()
  const isInvalid = invalid ?? field?.invalid ?? false
  return (
    <div className="relative flex items-center">
      <select
        ref={ref}
        id={rest.id ?? field?.id}
        aria-invalid={isInvalid || undefined}
        aria-describedby={rest['aria-describedby'] ?? field?.describedBy}
        className={cn(
          controlBaseClass,
          selectSize === 'lg' ? 'h-12 text-base' : 'h-[42px]',
          'appearance-none pr-9',
          isInvalid && controlInvalidClass,
          className,
        )}
        {...rest}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={String(o.value)} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={16}
        className="pointer-events-none absolute right-3 text-ink-faint"
      />
    </div>
  )
})

/* AsyncSelect lives in its own file — its list is portalled so cards cannot clip it. */
export { AsyncSelect, type AsyncSelectProps } from './AsyncSelect'
