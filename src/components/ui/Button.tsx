import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Icon, type IconName } from './Icon'

export type ButtonVariant =
  | 'primary'
  | 'accent'
  | 'green'
  | 'meadow'
  | 'ghost'
  | 'plain'
  | 'danger'
  | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl'

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-forest text-white border-transparent hover:bg-forest-dark hover:shadow-[0_6px_16px_rgba(40,51,140,.28)]',
  /** Follows the active work area's accent colour. */
  accent:
    'bg-[color:var(--accent)] text-white border-transparent hover:brightness-110 hover:shadow-md',
  green:
    'bg-sage text-white border-transparent hover:brightness-105 hover:shadow-[0_6px_16px_rgba(1,101,51,.28)]',
  meadow: 'bg-meadow text-white border-transparent hover:brightness-105 hover:shadow-[0_6px_16px_rgba(148,193,32,.35)]',
  ghost:
    'bg-transparent text-ink-dim border-line hover:border-forest hover:text-forest',
  plain: 'bg-transparent text-ink-dim border-transparent hover:bg-meadow-soft hover:text-forest',
  danger: 'bg-danger text-white border-transparent hover:brightness-110 hover:shadow-md',
  link: 'bg-transparent text-forest border-transparent px-0 underline-offset-4 hover:underline',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-4 text-[.86rem] gap-1.5',
  md: 'h-10 px-[18px] text-[.92rem] gap-2',
  // `lg`/`xl` exist for the touch-first queue & weighing screens (§3, §7.5)
  lg: 'h-12 px-5 text-base gap-2',
  xl: 'h-14 px-6 text-lg gap-2.5',
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  iconLeft?: IconName
  iconRight?: IconName
  fullWidth?: boolean
}

const BASE =
  'inline-flex items-center justify-center rounded border-[1.5px] font-semibold transition-[transform,box-shadow,background,color,border-color] duration-150 active:translate-y-px disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none whitespace-nowrap'

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'ghost',
    size = 'md',
    loading = false,
    iconLeft,
    iconRight,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconSize = size === 'xl' ? 22 : size === 'lg' ? 20 : 16
  return (
    <button
      ref={ref}
      type={type}
      // `loading` disables the control, which is what stops double-submits
      // while a mutation is in flight (§8.4).
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : iconLeft && <Icon name={iconLeft} size={iconSize} />}
      {children}
      {iconRight && !loading && <Icon name={iconRight} size={iconSize} />}
    </button>
  )
})

export interface LinkButtonProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  variant?: ButtonVariant
  size?: ButtonSize
  iconLeft?: IconName
  iconRight?: IconName
  fullWidth?: boolean
}

export function LinkButton({
  to,
  variant = 'ghost',
  size = 'md',
  iconLeft,
  iconRight,
  fullWidth,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  const iconSize = size === 'xl' ? 22 : size === 'lg' ? 20 : 16
  return (
    <Link
      to={to}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && 'w-full', className)}
      {...rest}
    >
      {iconLeft && <Icon name={iconLeft} size={iconSize} />}
      {children}
      {iconRight && <Icon name={iconRight} size={iconSize} />}
    </Link>
  )
}

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  /** Required — icon-only controls must still be announced. */
  label: string
  variant?: 'soft' | 'ghost' | 'onDark'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

const ICON_VARIANTS = {
  soft: 'bg-meadow-soft text-forest border-transparent hover:bg-forest hover:text-white',
  ghost: 'bg-transparent text-ink-faint border-transparent hover:bg-line-soft hover:text-forest',
  onDark: 'bg-white/10 text-white border-white/25 hover:bg-white/20',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, label, variant = 'ghost', size = 'md', loading, className, disabled, ...rest },
  ref,
) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'
  const iconSize = size === 'sm' ? 15 : size === 'lg' ? 20 : 17
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[7px] border transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45',
        ICON_VARIANTS[variant],
        box,
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : <Icon name={icon} size={iconSize} />}
    </button>
  )
})

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cn('animate-spin', className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
