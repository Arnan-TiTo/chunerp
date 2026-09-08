import type { Branch, Option } from '@/types/common'
import type {
  BookingStatus,
  CocoonGrade,
  DebtStatus,
  ExpenseStatus,
  FarmerStatus,
  QueueStatus,
  PaymentMethod,
  PaymentStatus,
} from '@/types/domain'

export const APP_NAME = 'ไร่กำนันจุล'
/** The legal entity that buys the cocoons — the name printed on ใบรับซื้อ. */
export const COMPANY_NAME = 'บริษัท จุลไหมไทย จำกัด'
export const APP_NAME_EN = 'Chul Farm — Silk Management System'

export const BRANCHES: Branch[] = [
  { id: 'BR-KPP', code: 'KPP', name: 'ส.กำแพงเพชร' },
  { id: 'BR-NKT', code: 'NKT', name: 'ส.นครไทย' },
  { id: 'BR-PCB', code: 'PCB', name: 'ส.เพชรบูรณ์' },
  { id: 'BR-LOEI', code: 'LOEI', name: 'ส.เลย' },
]

/** §8.3 — seed categories. Editable from System → Setting (EXP-002). */
export const EXPENSE_CATEGORY_SEED = [
  { id: 'CAT-WATER', name: 'ค่าน้ำ', types: [{ id: 'T-WATER-MAIN', name: 'ค่าน้ำประปา' }, { id: 'T-WATER-TRUCK', name: 'ค่าน้ำรถบรรทุก' }] },
  { id: 'CAT-ELEC', name: 'ค่าไฟฟ้า', types: [{ id: 'T-ELEC-OFFICE', name: 'สำนักงาน' }, { id: 'T-ELEC-PLANT', name: 'โรงเรือน' }] },
  { id: 'CAT-ICE', name: 'ค่าน้ำแข็ง', types: [{ id: 'T-ICE-BLOCK', name: 'น้ำแข็งก้อน' }, { id: 'T-ICE-CRUSH', name: 'น้ำแข็งบด' }] },
  { id: 'CAT-FUEL', name: 'ค่าน้ำมัน', types: [{ id: 'T-FUEL-DIESEL', name: 'ดีเซล' }, { id: 'T-FUEL-GASOHOL', name: 'แก๊สโซฮอล์' }] },
  { id: 'CAT-TRANSPORT', name: 'ค่าขนส่ง', types: [{ id: 'T-TRANS-COCOON', name: 'ขนส่งรังไหม' }, { id: 'T-TRANS-EGG', name: 'ขนส่งไข่ไหม' }] },
  { id: 'CAT-FOOD', name: 'ค่าอาหาร', types: [{ id: 'T-FOOD-STAFF', name: 'อาหารพนักงาน' }, { id: 'T-FOOD-EVENT', name: 'จัดเลี้ยง' }] },
  { id: 'CAT-LABOR', name: 'ค่าแรง', types: [{ id: 'T-LABOR-DAILY', name: 'แรงงานรายวัน' }, { id: 'T-LABOR-OT', name: 'ล่วงเวลา' }] },
  { id: 'CAT-MATERIAL', name: 'ค่าวัสดุ', types: [{ id: 'T-MAT-PACK', name: 'วัสดุบรรจุ' }, { id: 'T-MAT-FARM', name: 'วัสดุการเกษตร' }] },
  { id: 'CAT-MAINT', name: 'ค่าซ่อมบำรุง', types: [{ id: 'T-MAINT-VEHICLE', name: 'ยานพาหนะ' }, { id: 'T-MAINT-BUILDING', name: 'อาคาร/โรงเรือน' }] },
  { id: 'CAT-OFFICE', name: 'ค่าใช้จ่ายสำนักงาน', types: [{ id: 'T-OFF-SUPPLY', name: 'เครื่องเขียน' }, { id: 'T-OFF-COMM', name: 'ค่าสื่อสาร' }] },
  { id: 'CAT-OTHER', name: 'ค่าใช้จ่ายอื่นๆ', types: [] },
]

/* ── Status metadata: colour + label + icon, never colour alone (§3) ────── */

export type StatusTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'active'

export interface StatusMeta {
  label: string
  tone: StatusTone
  icon: string
}

export const QUEUE_STATUS: Record<QueueStatus, StatusMeta> = {
  SORTING: { label: 'กำลังคัดแยก', tone: 'active', icon: 'check-square' },
  WAITING_WEIGH: { label: 'รอชั่ง', tone: 'neutral', icon: 'clock' },
  CALLED: { label: 'เรียกชั่งแล้ว', tone: 'info', icon: 'bell' },
  WEIGHING: { label: 'กำลังชั่ง', tone: 'active', icon: 'scale' },
  COMPLETED: { label: 'เสร็จสิ้น', tone: 'success', icon: 'check-circle' },
  CANCELLED: { label: 'ยกเลิก', tone: 'danger', icon: 'x-circle' },
}

export const BOOKING_STATUS: Record<BookingStatus, StatusMeta> = {
  DRAFT: { label: 'ร่าง', tone: 'neutral', icon: 'file' },
  CONFIRMED: { label: 'ยืนยันแล้ว', tone: 'info', icon: 'check-circle' },
  PREPARING: { label: 'กำลังเตรียม', tone: 'active', icon: 'package' },
  DELIVERED: { label: 'ส่งมอบแล้ว', tone: 'success', icon: 'truck' },
  CANCELLED: { label: 'ยกเลิก', tone: 'danger', icon: 'x-circle' },
}

export const EXPENSE_STATUS: Record<ExpenseStatus, StatusMeta> = {
  DRAFT: { label: 'ร่าง', tone: 'neutral', icon: 'file' },
  SUBMITTED: { label: 'รออนุมัติ', tone: 'warning', icon: 'clock' },
  APPROVED: { label: 'อนุมัติแล้ว', tone: 'success', icon: 'check-circle' },
  REJECTED: { label: 'ไม่อนุมัติ', tone: 'danger', icon: 'x-circle' },
  CANCELLED: { label: 'ยกเลิก', tone: 'neutral', icon: 'slash' },
}

export const DEBT_STATUS: Record<DebtStatus, StatusMeta> = {
  OPEN: { label: 'ค้างชำระ', tone: 'warning', icon: 'alert' },
  PARTIAL: { label: 'ตัดบางส่วน', tone: 'info', icon: 'minus-circle' },
  SETTLED: { label: 'ปิดยอดแล้ว', tone: 'success', icon: 'check-circle' },
  HOLD: { label: 'ระงับ', tone: 'neutral', icon: 'pause' },
}

export const PAYMENT_STATUS: Record<PaymentStatus, StatusMeta> = {
  PENDING: { label: 'รอจ่ายเงิน', tone: 'warning', icon: 'clock' },
  PAID: { label: 'จ่ายแล้ว', tone: 'success', icon: 'check-circle' },
  CANCELLED: { label: 'ยกเลิก', tone: 'neutral', icon: 'slash' },
}

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด',
  BANK_TRANSFER: 'โอนเข้าบัญชี',
}

export const FARMER_STATUS: Record<FarmerStatus, StatusMeta> = {
  ACTIVE: { label: 'ใช้งาน', tone: 'success', icon: 'check-circle' },
  INACTIVE: { label: 'ไม่ใช้งาน', tone: 'neutral', icon: 'slash' },
  SUSPENDED: { label: 'ระงับสิทธิ์', tone: 'danger', icon: 'alert' },
}

/* ── Reference data seen on the receiving slip ──────────────────────────── */

export const SILK_BREEDS: Option[] = [
  { value: 'BR-JUL1-MAEJIN', label: 'ไหมวัยอ่อน จุล1 แม่จีน' },
  { value: 'BR-JUL5', label: 'จุล 5' },
  { value: 'BR-JUL6', label: 'จุล 6 (ผสมเอง)' },
  { value: 'BR-JUL1', label: 'จุล 1 (แม่พันธุ์)' },
  { value: 'BR-THAI-LUANG', label: 'ไหมไทยพื้นบ้าน (นางน้อย)' },
]

export const PROJECTS: Option[] = [
  { value: 'PJ-ORGANIC-13', label: '13คก.ออแกนิค' },
  { value: 'PJ-JUL-UAMJAI', label: 'ไหมจุลอุ่นใจ' },
  { value: 'PJ-DEBT-RELIEF', label: 'บรรเทาหนี้เกษตรกร' },
  { value: 'PJ-GUARANTEE', label: 'ประกันราคารังดี 200 บาท/กก.' },
]

export const BOOKING_UNITS: Option[] = [
  { value: 'BOX', label: 'กล่อง' },
  { value: 'SHEET', label: 'แผ่น' },
]

/**
 * Unit recorded on the paper slip for every cocoon grade.
 * §20 flags ถุง → กก. conversion as *unconfirmed*, so it stays configuration.
 */
export const COCOON_QTY_UNIT = 'ถุง'

/**
 * The five grades weighed at จุดชั่งน้ำหนัก, in the order they are printed.
 *
 * `column` is the invoice column the grade is billed under: ดี/เสีย/แฝด go to
 * น้ำหนักรัง, บาง/ปุยไหม to น้ำหนักเศษ.
 */
export const COCOON_GRADES: {
  grade: CocoonGrade
  /** Short name used on screen. */
  label: string
  /**
   * The line wording on the printed ใบรับซื้อ. The cocoon grades are suffixed
   * with the breed in brackets on the paper — `breedSuffix` says which ones —
   * and the scrap grades carry the company's own grade numbers.
   */
  receiptLabel: string
  breedSuffix: boolean
  column: 'COCOON' | 'SCRAP'
}[] = [
  { grade: 'GOOD', label: 'รังดี', receiptLabel: 'รังสดรับซื้อ-ดี', breedSuffix: true, column: 'COCOON' },
  { grade: 'DAMAGED', label: 'รังเสีย', receiptLabel: 'รังสดรับซื้อ-เสีย', breedSuffix: true, column: 'COCOON' },
  { grade: 'DOUBLE', label: 'รังแฝด', receiptLabel: 'รังสดรับซื้อ-เสียแฝด', breedSuffix: true, column: 'COCOON' },
  { grade: 'THIN', label: 'รังบาง', receiptLabel: 'รังสดรับซื้อ-เสีย บาง (0)', breedSuffix: false, column: 'SCRAP' },
  { grade: 'FLOSS', label: 'ปุยไหม', receiptLabel: 'ปุยไหม-ตกเกรด (5)', breedSuffix: false, column: 'SCRAP' },
]

export const COCOON_GRADE_LABELS = Object.fromEntries(
  COCOON_GRADES.map((g) => [g.grade, g.label]),
) as Record<CocoonGrade, string>

export const PAYMENT_METHODS: Option[] = [
  { value: 'CASH', label: 'เงินสด' },
  { value: 'BANK_TRANSFER', label: 'โอนผ่านธนาคาร' },
]

export const BANKS: Option[] = [
  { value: 'BAAC', label: 'ธ.ก.ส.' },
  { value: 'KTB', label: 'กรุงไทย' },
  { value: 'SCB', label: 'ไทยพาณิชย์' },
  { value: 'KBANK', label: 'กสิกรไทย' },
  { value: 'BBL', label: 'กรุงเทพ' },
]

export const PAGE_SIZES = [10, 20, 50, 100]

export const UPLOAD_LIMITS = {
  maxSizeBytes: 10 * 1024 * 1024,
  maxFiles: 10,
  acceptedMimeTypes: [
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
  ],
}
