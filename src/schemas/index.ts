import { z } from 'zod'

/**
 * FND-007 — validation schemas.
 *
 * Rules here are *format* rules only: required, range, type, conditional
 * presence. Business calculations (price, deduction ceilings, moisture bands)
 * stay on the backend per §1 and §20.
 */

const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `กรุณากรอก${label}`).max(max, `${label}ยาวเกิน ${max} ตัวอักษร`)

const optionalText = (max = 500) =>
  z
    .string()
    .trim()
    .max(max, `ข้อความยาวเกิน ${max} ตัวอักษร`)
    .optional()
    .or(z.literal(''))

const positiveNumber = (label: string) =>
  z
    .number({ invalid_type_error: `กรุณากรอก${label}เป็นตัวเลข` })
    .positive(`${label}ต้องมากกว่า 0`)

const nonNegativeInt = (label: string) =>
  z
    .number({ invalid_type_error: `กรุณากรอก${label}เป็นตัวเลข` })
    .int(`${label}ต้องเป็นจำนวนเต็ม`)
    .min(0, `${label}ต้องไม่ติดลบ`)

/* ── Farmer (FAR-002) ───────────────────────────────────────────────────── */

export const farmerSchema = z.object({
  code: requiredText('รหัสเกษตรกร', 20).regex(/^\d{5,10}$/, 'รหัสเกษตรกรต้องเป็นตัวเลข 5–10 หลัก'),
  firstName: requiredText('ชื่อ', 80),
  lastName: requiredText('นามสกุล', 80),
  nationalId: z
    .string()
    .trim()
    .regex(/^\d{13}$/, 'เลขบัตรประชาชนต้องเป็นตัวเลข 13 หลัก')
    .optional()
    .or(z.literal('')),
  phone: z
    .string()
    .trim()
    .regex(/^0\d{8,9}$/, 'เบอร์โทรไม่ถูกต้อง (ขึ้นต้นด้วย 0 และมี 9–10 หลัก)')
    .optional()
    .or(z.literal('')),
  address: optionalText(200),
  subDistrict: optionalText(80),
  district: optionalText(80),
  province: optionalText(80),
  branchId: requiredText('สาขา'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']),
  programs: z.object({
    julUamJai: z.boolean(),
    debtRelief: z.boolean(),
    guaranteedGoodPrice: z.boolean(),
  }),
})

export type FarmerFormValues = z.infer<typeof farmerSchema>

/* ── Booking (BOOK-002) ─────────────────────────────────────────────────── */

/**
 * A booking line only carries the product and how many. The unit and the price
 * come from the product master, so they are deliberately absent here.
 */
export const bookingItemSchema = z.object({
  productId: requiredText('สินค้า'),
  quantity: positiveNumber('จำนวน').max(9_999, 'จำนวนสูงเกินไป'),
})

export const bookingSchema = z
  .object({
    bookingDate: requiredText('วันที่จอง'),
    farmerId: requiredText('เกษตรกร'),
    branchId: requiredText('สาขา'),
    projectId: z.string().optional().or(z.literal('')),
    batchNo: requiredText('รุ่น', 40),
    hatchDate: z.string().optional().or(z.literal('')),
    expectedDeliveryDate: requiredText('วันกำหนดส่งมอบ'),
    items: z.array(bookingItemSchema).min(1, 'ต้องเพิ่มรายการอย่างน้อย 1 รายการ'),
    remark: optionalText(500),
  })
  .refine((v) => !v.hatchDate || v.expectedDeliveryDate >= v.hatchDate, {
    message: 'วันกำหนดส่งมอบต้องไม่ก่อนวันรุ่นฟัก',
    path: ['expectedDeliveryDate'],
  })
  .refine((v) => v.expectedDeliveryDate >= v.bookingDate, {
    message: 'วันกำหนดส่งมอบต้องไม่ก่อนวันที่จอง',
    path: ['expectedDeliveryDate'],
  })

export type BookingFormValues = z.infer<typeof bookingSchema>

/* ── ใบคิว header — จุดคัดแยก (QUEUE-003) ───────────────────────────────── */

const boxes = (label: string) =>
  z
    .number({ invalid_type_error: `กรุณากรอก${label}เป็นตัวเลข` })
    .min(0, `${label}ต้องไม่ติดลบ`)
    .max(999, `${label}สูงเกินไป`)
    .optional()

/**
 * Mirrors the printed header of the ใบคิว:
 * ชื่อ · รหัส · สาขา · สายพันธุ์ · โครงการ · รุ่นฟัก · จำนวน · แบ่งไหมจาก
 */
/**
 * §7.5 — a slip is written against a round that has already been delivered.
 *
 * สายพันธุ์ / รุ่นฟัก / จำนวนไข่ไหมที่จองไป are not typed here: they are what the
 * farmer was actually given, so they come from the booking. Requiring the
 * booking is what stops a slip existing for cocoons nobody supplied eggs for.
 */
export const queueSchema = z.object({
  farmerId: requiredText('เกษตรกร'),
  branchId: requiredText('สาขา (จุดรับซื้อ)'),
  bookingId: requiredText('รอบที่รับไข่ไหมไป'),
  splitFromBoxes: boxes('จำนวนที่แบ่งไหมจาก'),
  remark: optionalText(300),
})

export type QueueFormValues = z.infer<typeof queueSchema>

/* ── Weighing (WEIGH-001) ───────────────────────────────────────────────── */

/** One bag on the scale — the whole of what the station types per weighing. */
export const weighBagSchema = z.object({
  grade: z.enum(['GOOD', 'DAMAGED', 'DOUBLE', 'THIN', 'FLOSS'], {
    required_error: 'กรุณาเลือกชั้นคุณภาพ',
  }),
  weightKg: positiveNumber('น้ำหนักถุง').max(500, 'น้ำหนักถุงสูงเกินช่วงที่รับได้'),
})

export type WeighBagFormValues = z.infer<typeof weighBagSchema>

/**
 * ใบชั่งน้ำหนักเปลือกรัง. %เปลือกรัง itself is a backend result (§7.6), so the
 * form only guards the impossibility of a shell heavier than the sample.
 */
export const shellWeighSchema = z
  .object({
    sampleCocoonCount: nonNegativeInt('จำนวนรังตัวอย่าง').max(999, 'จำนวนรังตัวอย่างสูงเกินไป'),
    sampleCocoonWeightG: positiveNumber('นน.รังรวม').max(5_000, 'น้ำหนักสูงเกินช่วงที่รับได้'),
    shellWeightG: positiveNumber('นน.เปลือกรัง').max(5_000, 'น้ำหนักสูงเกินช่วงที่รับได้'),
    moisturePercent: z
      .number({ invalid_type_error: 'กรุณากรอกความชื้นเป็นตัวเลข' })
      .min(0, 'ความชื้นต้องไม่ติดลบ')
      .max(100, 'ความชื้นต้องไม่เกิน 100%'),
  })
  .refine((v) => v.shellWeightG <= v.sampleCocoonWeightG, {
    message: 'น้ำหนักเปลือกรังต้องไม่เกิน นน.รังรวม',
    path: ['shellWeightG'],
  })

export type ShellWeighFormValues = z.infer<typeof shellWeighSchema>


/* ── Quality (QUAL-001) ─────────────────────────────────────────────────── */

export const qualitySchema = z
  .object({
    goodCocoonQty: nonNegativeInt('รังดี'),
    afterScreenQty: nonNegativeInt('รังหลังจ่อ'),
    damagedCocoonQty: nonNegativeInt('รังเสีย'),
    doubleCocoonQty: nonNegativeInt('รังแฝด'),
    thinCocoonQty: nonNegativeInt('รังบาง'),
    flossQty: nonNegativeInt('ปุยไหม'),
    dryingLevel: z.enum(['OLD', 'MEDIUM']).optional(),
    deadSilkworm: z.boolean().optional(),
    notDegummed: z.boolean().optional(),
    guaranteedGoodPrice: z.boolean().optional(),
    debtRelief: z.boolean().optional(),
    julUamJai: z.boolean().optional(),
    moisturePercent: z
      .number({ invalid_type_error: 'กรุณากรอกความชื้นเป็นตัวเลข' })
      .min(0, 'ความชื้นต้องไม่ติดลบ')
      .max(100, 'ความชื้นต้องไม่เกิน 100%')
      .optional(),
    remark: optionalText(500),
  })
  .refine(
    (v) =>
      v.goodCocoonQty +
        v.afterScreenQty +
        v.damagedCocoonQty +
        v.doubleCocoonQty +
        v.thinCocoonQty +
        v.flossQty >
      0,
    { message: 'ต้องระบุจำนวนรังอย่างน้อย 1 ประเภท', path: ['goodCocoonQty'] },
  )

export type QualityFormValues = z.infer<typeof qualitySchema>

/* ── Deduction (DEBT-003) ───────────────────────────────────────────────── */

export function deductionSchema(eligible: number) {
  return z.object({
    /** ใบรับซื้อที่นำรวมรายได้มาหักหนี้รอบนี้ */
    purchaseId: z.string().min(1, 'กรุณาเลือกใบรับซื้อที่จะนำมาหักหนี้'),
    currentDeduction: positiveNumber('จำนวนที่ตัด').max(
      eligible,
      `ตัดได้สูงสุด ฿${eligible.toLocaleString('th-TH')}`,
    ),
    remark: optionalText(300),
  })
}

export type DeductionFormValues = {
  purchaseId: string
  currentDeduction: number
  remark?: string
}

/* ── Expense (EXP-003, EXP-004) ─────────────────────────────────────────── */

/**
 * บันทึกจ่ายเงินเกษตรกร.
 *
 * The amount is not here on purpose — it is รวมรายได้ − หักหนี้ and the server
 * owns it, so the counter can choose *how* the money moves but never *how much*
 * (§7.10). A transfer must name the bank: a transfer nobody can trace back to
 * an account is not evidence of payment.
 */
export const paymentSchema = z
  .object({
    method: z.enum(['CASH', 'BANK_TRANSFER'], {
      errorMap: () => ({ message: 'เลือกวิธีจ่ายเงิน' }),
    }),
    paidDate: z.string().min(1, 'ระบุวันที่จ่าย'),
    bankName: z.string().optional(),
    accountNo: z.string().optional(),
    transferRef: z.string().optional(),
    remark: z.string().max(200, 'หมายเหตุยาวเกิน 200 ตัวอักษร').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.method === 'BANK_TRANSFER' && !value.bankName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bankName'],
        message: 'การโอนเงินต้องระบุธนาคาร',
      })
    }
  })

export type PaymentFormValues = z.infer<typeof paymentSchema>

export const expenseSchema = z
  .object({
    expenseDate: requiredText('วันที่'),
    branchId: requiredText('สาขา'),
    categoryId: requiredText('ประเภทค่าใช้จ่าย'),
    expenseTypeId: z.string().optional().or(z.literal('')),
    description: requiredText('รายละเอียด', 500),
    vendor: optionalText(200),
    referenceNo: optionalText(60),
    quantity: positiveNumber('จำนวน').max(1_000_000, 'จำนวนสูงเกินไป'),
    unit: optionalText(40),
    unitPrice: z
      .number({ invalid_type_error: 'กรุณากรอกราคาต่อหน่วยเป็นตัวเลข' })
      .min(0, 'ราคาต่อหน่วยต้องไม่ติดลบ')
      .max(100_000_000, 'ราคาต่อหน่วยสูงเกินไป'),
    paymentMethod: z.enum(['CASH', 'BANK_TRANSFER'], {
      errorMap: () => ({ message: 'กรุณาเลือกวิธีชำระเงิน' }),
    }),
    paidDate: z.string().optional().or(z.literal('')),
    bankName: z.string().optional().or(z.literal('')),
    accountNo: z.string().optional().or(z.literal('')),
    transferDate: z.string().optional().or(z.literal('')),
    transferRef: z.string().optional().or(z.literal('')),
    remark: optionalText(500),
  })
  // §8.4 — bank fields are required only for BANK_TRANSFER.
  .superRefine((v, ctx) => {
    if (v.paymentMethod !== 'BANK_TRANSFER') return
    const required: [keyof typeof v, string][] = [
      ['bankName', 'กรุณาเลือกธนาคาร'],
      ['accountNo', 'กรุณากรอกเลขที่บัญชี'],
      ['transferDate', 'กรุณาเลือกวันที่โอน'],
      ['transferRef', 'กรุณากรอกเลขที่อ้างอิงการโอน'],
    ]
    for (const [field, message] of required) {
      if (!v[field]) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message })
    }
  })

export type ExpenseFormValues = z.infer<typeof expenseSchema>
