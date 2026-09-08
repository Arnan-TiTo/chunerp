import { describe, expect, it } from 'vitest'
import {
  bookingSchema,
  deductionSchema,
  expenseSchema,
  farmerSchema,
  qualitySchema,
  shellWeighSchema,
  weighBagSchema,
} from './index'

const validExpense = {
  expenseDate: '2026-09-01',
  branchId: 'BR-KPP',
  categoryId: 'CAT-WATER',
  expenseTypeId: '',
  description: 'ค่าน้ำประปา งวดเดือนกันยายน',
  vendor: '',
  referenceNo: '',
  quantity: 2,
  unit: 'หน่วย',
  unitPrice: 150,
  paymentMethod: 'CASH' as const,
  paidDate: '2026-09-01',
  bankName: '',
  accountNo: '',
  transferDate: '',
  transferRef: '',
  remark: '',
}

describe('expenseSchema — §8.4 conditional payment fields', () => {
  it('accepts a cash expense with no bank details', () => {
    expect(expenseSchema.safeParse(validExpense).success).toBe(true)
  })

  it('requires every bank field when the method is BANK_TRANSFER', () => {
    const result = expenseSchema.safeParse({
      ...validExpense,
      paymentMethod: 'BANK_TRANSFER',
    })
    expect(result.success).toBe(false)
    if (result.success) return
    const paths = result.error.issues.map((i) => i.path[0])
    expect(paths).toEqual(
      expect.arrayContaining(['bankName', 'accountNo', 'transferDate', 'transferRef']),
    )
  })

  it('accepts a transfer once the bank details are filled in', () => {
    const result = expenseSchema.safeParse({
      ...validExpense,
      paymentMethod: 'BANK_TRANSFER',
      bankName: 'BAAC',
      accountNo: '123-4-56789-0',
      transferDate: '2026-09-01',
      transferRef: 'TRF1234567',
    })
    expect(result.success).toBe(true)
  })

  it('rejects a zero or negative quantity', () => {
    expect(expenseSchema.safeParse({ ...validExpense, quantity: 0 }).success).toBe(false)
    expect(expenseSchema.safeParse({ ...validExpense, quantity: -1 }).success).toBe(false)
  })

  it('rejects a negative unit price but allows zero', () => {
    expect(expenseSchema.safeParse({ ...validExpense, unitPrice: -1 }).success).toBe(false)
    expect(expenseSchema.safeParse({ ...validExpense, unitPrice: 0 }).success).toBe(true)
  })
})

describe('weighBagSchema — §7.6', () => {
  it('rejects a bag with no weight on it', () => {
    expect(weighBagSchema.safeParse({ grade: 'GOOD', weightKg: 0 }).success).toBe(false)
  })

  it('rejects a grade the scale does not know', () => {
    expect(weighBagSchema.safeParse({ grade: 'PREMIUM', weightKg: 2 }).success).toBe(false)
  })

  it('accepts one weighed bag', () => {
    expect(weighBagSchema.safeParse({ grade: 'DOUBLE', weightKg: 2.45 }).success).toBe(true)
  })
})

describe('shellWeighSchema — §7.6', () => {
  const sample = {
    sampleCocoonCount: 25,
    sampleCocoonWeightG: 42,
    shellWeightG: 8.4,
    moisturePercent: 14.5,
  }

  it('rejects a shell heavier than the sample it came from', () => {
    expect(shellWeighSchema.safeParse({ ...sample, shellWeightG: 43 }).success).toBe(false)
  })

  it('rejects a fractional cocoon count', () => {
    expect(shellWeighSchema.safeParse({ ...sample, sampleCocoonCount: 25.5 }).success).toBe(false)
  })

  it('rejects moisture above 100%', () => {
    expect(shellWeighSchema.safeParse({ ...sample, moisturePercent: 101 }).success).toBe(false)
  })

  it('accepts a normal sample', () => {
    expect(shellWeighSchema.safeParse(sample).success).toBe(true)
  })
})

describe('qualitySchema — §7.7', () => {
  const empty = {
    goodCocoonQty: 0,
    afterScreenQty: 0,
    damagedCocoonQty: 0,
    doubleCocoonQty: 0,
    thinCocoonQty: 0,
    flossQty: 0,
  }

  it('requires at least one cocoon grade to be recorded', () => {
    expect(qualitySchema.safeParse(empty).success).toBe(false)
  })

  it('accepts a single non-zero grade', () => {
    expect(qualitySchema.safeParse({ ...empty, goodCocoonQty: 12 }).success).toBe(true)
  })

  it('keeps moisture inside 0–100%', () => {
    expect(
      qualitySchema.safeParse({ ...empty, goodCocoonQty: 5, moisturePercent: 101 }).success,
    ).toBe(false)
    expect(
      qualitySchema.safeParse({ ...empty, goodCocoonQty: 5, moisturePercent: -1 }).success,
    ).toBe(false)
    expect(
      qualitySchema.safeParse({ ...empty, goodCocoonQty: 5, moisturePercent: 18.5 }).success,
    ).toBe(true)
  })
})

describe('deductionSchema — §7.9', () => {
  const source = { purchaseId: 'PU-Q-0001' }

  it('cannot exceed the eligible amount', () => {
    const schema = deductionSchema(5_000)
    expect(schema.safeParse({ ...source, currentDeduction: 5_001 }).success).toBe(false)
    expect(schema.safeParse({ ...source, currentDeduction: 5_000 }).success).toBe(true)
  })

  it('needs the invoice the income comes from', () => {
    expect(
      deductionSchema(5_000).safeParse({ purchaseId: '', currentDeduction: 100 }).success,
    ).toBe(false)
  })

  it('rejects a zero deduction', () => {
    expect(
      deductionSchema(5_000).safeParse({ ...source, currentDeduction: 0 }).success,
    ).toBe(false)
  })
})

describe('bookingSchema — §7.4', () => {
  const base = {
    bookingDate: '2026-09-01',
    farmerId: 'F-0001',
    branchId: 'BR-KPP',
    projectId: '',
    batchNo: 'R1/2569',
    hatchDate: '2026-09-05',
    expectedDeliveryDate: '2026-09-22',
    items: [
      { productId: 'P-0001', quantity: 1.5 },
      { productId: 'P-0006', quantity: 5 },
    ],
    remark: '',
  }

  it('accepts a valid booking', () => {
    expect(bookingSchema.safeParse(base).success).toBe(true)
  })

  it('requires at least one line', () => {
    const result = bookingSchema.safeParse({ ...base, items: [] })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.error.issues.some((i) => i.path[0] === 'items')).toBe(true)
  })

  it('rejects a line with a zero or negative quantity', () => {
    expect(
      bookingSchema.safeParse({ ...base, items: [{ productId: 'P-0001', quantity: 0 }] }).success,
    ).toBe(false)
    expect(
      bookingSchema.safeParse({ ...base, items: [{ productId: 'P-0001', quantity: -2 }] }).success,
    ).toBe(false)
  })

  it('rejects a line with no product', () => {
    expect(
      bookingSchema.safeParse({ ...base, items: [{ productId: '', quantity: 1 }] }).success,
    ).toBe(false)
  })

  it('rejects a delivery date before the booking date', () => {
    const result = bookingSchema.safeParse({ ...base, expectedDeliveryDate: '2026-08-01' })
    expect(result.success).toBe(false)
  })

  it('rejects a delivery date before the hatch date', () => {
    const result = bookingSchema.safeParse({
      ...base,
      hatchDate: '2026-09-25',
      expectedDeliveryDate: '2026-09-20',
    })
    expect(result.success).toBe(false)
  })
})

describe('farmerSchema — FAR-002', () => {
  const base = {
    code: '3606609',
    firstName: 'ทรงกรด',
    lastName: 'บัวหลวง',
    nationalId: '',
    phone: '',
    address: '',
    subDistrict: '',
    district: '',
    province: '',
    branchId: 'BR-KPP',
    status: 'ACTIVE' as const,
    programs: { julUamJai: false, debtRelief: false, guaranteedGoodPrice: false },
  }

  it('accepts the minimum required fields', () => {
    expect(farmerSchema.safeParse(base).success).toBe(true)
  })

  it('rejects a non-numeric farmer code', () => {
    expect(farmerSchema.safeParse({ ...base, code: 'ABC123' }).success).toBe(false)
  })

  it('rejects a malformed national id but allows it to be blank', () => {
    expect(farmerSchema.safeParse({ ...base, nationalId: '123' }).success).toBe(false)
    expect(farmerSchema.safeParse({ ...base, nationalId: '1234567890123' }).success).toBe(true)
    expect(farmerSchema.safeParse({ ...base, nationalId: '' }).success).toBe(true)
  })

  it('rejects a malformed phone number', () => {
    expect(farmerSchema.safeParse({ ...base, phone: '12345' }).success).toBe(false)
    expect(farmerSchema.safeParse({ ...base, phone: '0812345678' }).success).toBe(true)
  })
})
