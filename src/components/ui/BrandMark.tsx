import { cn } from '@/utils/cn'
import { APP_NAME } from '@/constants'

/** ไฟล์โลโก้จริงจาก kamnanchul.com — พื้นหลังโปร่งใส วางบนสีพื้นไหนก็ได้ */
const LOGO_SRC = '/brand/kamnanchul-logo.png'
/** สัดส่วนจริงของไฟล์ 242 × 150 */
const LOGO_RATIO = 242 / 150

/**
 * โลโก้ไร่กำนันจุล.
 *
 * `size` คือ *ความสูง* ไม่ใช่ด้านกว้าง เพราะโลโก้เป็นแนวนอน — ที่ทุกจุดในระบบ
 * สิ่งที่ต้องเท่ากันคือความสูงให้พอดีกับแถบหรือบรรทัดที่มันอยู่ ส่วนความกว้าง
 * ปล่อยให้เป็นไปตามสัดส่วนจริง ห้ามยืดบีบโลโก้บริษัท
 */
export function BrandLogo({ size = 34, className }: Readonly<{ size?: number; className?: string }>) {
  return (
    <img
      src={LOGO_SRC}
      alt={APP_NAME}
      width={Math.round(size * LOGO_RATIO)}
      height={size}
      className={cn('shrink-0 select-none object-contain', className)}
      draggable={false}
    />
  )
}

export function BrandMark({
  compact,
  className,
}: Readonly<{ compact?: boolean; className?: string }>) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <BrandLogo size={46} />
      {/* ชื่อไร่อยู่ในตัวโลโก้อยู่แล้ว ข้างนอกจึงบอกแค่ว่านี่คือระบบอะไร */}
      {!compact && (
        <span className="min-w-0 border-l border-line-soft pl-2.5">
          <span className="block truncate text-[.82rem] font-bold leading-tight text-forest">
            ระบบจัดการไหม
          </span>
          <span className="block truncate text-[.62rem] font-semibold uppercase tracking-[1.2px] text-ink-faint">
            Silk Management
          </span>
        </span>
      )}
    </span>
  )
}
