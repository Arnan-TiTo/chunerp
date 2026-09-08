import { cn } from '@/utils/cn'
import { APP_NAME } from '@/constants'

/**
 * Chul Farm mark — a mulberry leaf over a silk cocoon, drawn in the same
 * paper-cut greens and teak tones as the key art.
 */
export function BrandLogo({ size = 34, className }: Readonly<{ size?: number; className?: string }>) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role="img"
      aria-label={APP_NAME}
    >
      {/* cocoon — the deep shade green */}
      <ellipse cx="24" cy="31" rx="10.5" ry="13" fill="#2a5340" />
      <ellipse cx="24" cy="31" rx="6.5" ry="9" fill="#3d6b53" opacity="0.6" />
      {/* mulberry leaf — rice-field green over sunlit meadow */}
      <path d="M24 20C24 11 30.5 5 39 4c.8 8.4-2 14.2-7 17.2-3 1.8-6 2.3-8 1.8Z" fill="#9cb35e" />
      <path
        d="M37 6c-5 3.6-9.5 8.4-12.4 14.8"
        stroke="#5f7a3c"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
      />
      {/* silk thread — teak */}
      <path
        d="M13 40c4-2.5 6-6 6-10"
        stroke="#a8763f"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function BrandMark({
  compact,
  className,
}: Readonly<{ compact?: boolean; className?: string }>) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandLogo size={32} />
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-[1.05rem] font-bold leading-tight tracking-[.2px] text-forest">
            ไร่กำนัน<span className="text-sage">จุล</span>
          </span>
          <span className="block truncate text-[.62rem] font-semibold uppercase tracking-[1.2px] text-ink-faint">
            Silk Management
          </span>
        </span>
      )}
    </span>
  )
}
