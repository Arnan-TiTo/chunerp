import { describe, expect, it } from 'vitest'
import {
  addDaysInput,
  formatCurrency,
  formatDateTH,
  formatDuration,
  formatFileSize,
  formatNumber,
  formatPercent,
  formatWeight,
  maskNationalId,
  maskPhone,
  toDateInput,
} from './format'

describe('numeric formatting', () => {
  it('renders an em dash for missing values rather than NaN', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatCurrency(undefined)).toBe('—')
    expect(formatWeight(null)).toBe('—')
    expect(formatPercent(undefined)).toBe('—')
  })

  it('formats currency with the baht symbol and two decimals by default', () => {
    expect(formatCurrency(1234.5)).toBe('฿1,234.50')
    expect(formatCurrency(1234.5, { digits: 0 })).toBe('฿1,235')
    expect(formatCurrency(1234.5, { withSymbol: false })).toBe('1,234.50')
  })

  it('formats weight in kilograms', () => {
    expect(formatWeight(82.5)).toBe('82.50 กก.')
  })
})

describe('formatDateTH', () => {
  it('renders Buddhist-era dates like the paper receiving slip', () => {
    // 2026-07-27 → 27/07/2569
    expect(formatDateTH('2026-07-27T00:00:00.000Z')).toMatch(/^\d{2}\/\d{2}\/2569$/)
  })

  it('handles missing and invalid input', () => {
    expect(formatDateTH(null)).toBe('—')
    expect(formatDateTH('not-a-date')).toBe('—')
  })
})

describe('formatDuration', () => {
  it('describes short waits in minutes', () => {
    expect(formatDuration(0.4)).toBe('เพิ่งมาถึง')
    expect(formatDuration(35)).toBe('35 นาที')
  })

  it('switches to hours past 60 minutes', () => {
    expect(formatDuration(90)).toBe('1 ชม. 30 นาที')
    expect(formatDuration(120)).toBe('2 ชม.')
  })
})

describe('sensitive-data masking (§7.3)', () => {
  it('masks a national id unless the viewer is allowed to see it', () => {
    const id = '1234567890123'
    expect(maskNationalId(id, false)).toBe('1-XXXX-XXXXX-XX-3')
    expect(maskNationalId(id, true)).toBe('1-2345-67890-12-3')
  })

  it('masks a phone number unless the viewer is allowed to see it', () => {
    expect(maskPhone('0812345678', false)).toBe('081-XXX-78')
    expect(maskPhone('0812345678', true)).toBe('0812345678')
  })

  it('shows an em dash when there is nothing to mask', () => {
    expect(maskNationalId(undefined, true)).toBe('—')
    expect(maskPhone(undefined, false)).toBe('—')
  })
})

describe('date input helpers', () => {
  it('produces yyyy-mm-dd for <input type="date">', () => {
    expect(toDateInput('2026-09-07T12:00:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(toDateInput(null)).toBe('')
  })

  it('shifts a date by a number of days', () => {
    expect(addDaysInput('2026-09-07', 1)).toBe('2026-09-08')
    expect(addDaysInput('2026-09-07', -7)).toBe('2026-08-31')
  })
})

describe('formatFileSize', () => {
  it('scales the unit with the size', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(2048)).toBe('2 KB')
    expect(formatFileSize(5 * 1024 * 1024)).toBe('5.0 MB')
  })
})
