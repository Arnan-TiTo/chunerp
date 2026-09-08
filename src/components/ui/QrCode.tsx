import { useMemo } from 'react'
import qrcode from 'qrcode-generator'
import { cn } from '@/utils/cn'

/**
 * QR code, drawn as plain SVG.
 *
 * Accounting scans the printed ใบรับซื้อ to open the document check, so this
 * has to be a real symbology rather than decoration. Rendering the module
 * matrix ourselves keeps the document self-contained — no canvas, no image
 * round-trip, and it prints at the printer's own resolution instead of being
 * resampled from a bitmap.
 */
export function QrCode({
  value,
  size = 96,
  /**
   * Error correction. 'M' is the usual choice for a printed slip: it survives
   * a smudge or a fold without inflating the module count.
   */
  level = 'M',
  caption,
  className,
}: Readonly<{
  value: string
  size?: number
  level?: 'L' | 'M' | 'Q' | 'H'
  caption?: string
  className?: string
}>) {
  const { path, count } = useMemo(() => {
    // Type 0 lets the encoder pick the smallest version that fits.
    const qr = qrcode(0, level)
    qr.addData(value)
    qr.make()

    const modules = qr.getModuleCount()
    let d = ''
    for (let row = 0; row < modules; row++) {
      for (let col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) d += `M${col} ${row}h1v1h-1z`
      }
    }
    return { path: d, count: modules }
  }, [value, level])

  // A 2-module quiet zone keeps scanners happy without wasting paper.
  const quiet = 2
  const extent = count + quiet * 2

  return (
    <figure className={cn('inline-flex flex-col items-center gap-1', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${extent} ${extent}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`คิวอาร์โค้ด ${value}`}
      >
        <rect width={extent} height={extent} fill="#ffffff" />
        <g transform={`translate(${quiet} ${quiet})`}>
          <path d={path} fill="#0f1512" />
        </g>
      </svg>
      {caption && (
        <figcaption className="dash-num text-[8.5px] tracking-[1px] text-black/70">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
