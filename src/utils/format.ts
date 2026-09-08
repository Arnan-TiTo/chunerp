/**
 * Display formatting. Everything here is presentation-only — no business
 * calculation lives in this module (§1, §20).
 */

const THAI_LOCALE = 'th-TH'

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toLocaleString(THAI_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

export function formatCurrency(
  value: number | null | undefined,
  opts: { withSymbol?: boolean; digits?: number } = {},
): string {
  const { withSymbol = true, digits = 2 } = opts
  if (value == null || Number.isNaN(value)) return '—'
  const n = value.toLocaleString(THAI_LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return withSymbol ? `฿${n}` : n
}

export function formatWeight(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${formatNumber(value, digits)} กก.`
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return '—'
  return `${formatNumber(value, digits)}%`
}

export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)} ล้าน`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return formatNumber(value)
}

/** Thai Buddhist-era date, matching the paper forms (e.g. 27/07/2569). */
export function formatDateTH(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear() + 543
  return `${dd}/${mm}/${yyyy}`
}

export function formatDateLongTH(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(THAI_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleTimeString(THAI_LOCALE, { hour: '2-digit', minute: '2-digit' })
}

export function formatDateTimeTH(iso: string | null | undefined): string {
  if (!iso) return '—'
  return `${formatDateTH(iso)} ${formatTime(iso)} น.`
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return 'เพิ่งมาถึง'
  if (minutes < 60) return `${Math.round(minutes)} นาที`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h} ชม. ${m} นาที` : `${h} ชม.`
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** §7.3 — mask sensitive data when the viewer lacks the permission. */
export function maskNationalId(value: string | undefined, unmask: boolean): string {
  if (!value) return '—'
  if (unmask) return value.replace(/(\d)(\d{4})(\d{5})(\d{2})(\d)/, '$1-$2-$3-$4-$5')
  return `${value.slice(0, 1)}-XXXX-XXXXX-XX-${value.slice(-1)}`
}

export function maskPhone(value: string | undefined, unmask: boolean): string {
  if (!value) return '—'
  if (unmask) return value
  return `${value.slice(0, 3)}-XXX-${value.slice(-2)}`
}

/** ISO date (yyyy-mm-dd) for `<input type="date">`. */
export function toDateInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayInput(): string {
  return toDateInput(new Date().toISOString())
}

export function addDaysInput(base: string, days: number): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  return toDateInput(d.toISOString())
}
