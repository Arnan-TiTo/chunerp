import type { Attachment, ID } from './common'
import type { ProductKind } from './product'

/* ── Farmer (§7.3) ──────────────────────────────────────────────────────── */

export type FarmerStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'

export interface Farmer {
  id: ID
  code: string
  firstName: string
  lastName: string
  fullName: string
  /** National ID — masked unless the viewer holds `farmer:viewSensitive`. */
  nationalId?: string
  phone?: string
  address?: string
  subDistrict?: string
  district?: string
  province?: string
  branchId: string
  branchName: string
  status: FarmerStatus
  joinedAt: string
  /** Programme enrolment flags seen on the paper receiving slip. */
  programs: {
    julUamJai: boolean
    debtRelief: boolean
    guaranteedGoodPrice: boolean
  }
  outstandingDebt: number
  totalPurchaseAmount: number
  createdAt: string
  updatedAt: string
}

/* ── Booking / จองไข่ไหม (§7.4, §12) ────────────────────────────────────── */

export type BookingStatus =
  | 'DRAFT'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'DELIVERED'
  | 'CANCELLED'

/**
 * One line of the booking document. Quantity is entered by staff; the unit and
 * the price come from the product master, so a document can never quietly
 * charge a price that is not in the price list.
 */
export interface BookingItem {
  id: ID
  productId: string
  productCode: string
  productName: string
  kind: ProductKind
  quantity: number
  unitId: string
  unitName: string
  /** Copied from the effective ProductPrice at save time — read-only in the UI. */
  unitPrice: number
  /** Backend result of quantity × unitPrice. */
  amount: number
}

/** One line of what the officer actually handed over. */
export interface DeliveryItem {
  bookingItemId: ID
  productName: string
  quantity: number
  unitName: string
  unitPrice: number
  amount: number
}

/**
 * บันทึกส่งของ — the promotion officer delivering the eggs and supplies.
 *
 * This is the event that puts the farmer in debt: the booking is only a
 * request, so nothing is owed until the goods are in the farmer's hands. The
 * debt is raised from what was *delivered*, which is why the quantities live
 * here rather than being read back off the booking lines.
 */
export interface BookingDelivery {
  deliveredAt: string
  deliveredBy: ID
  deliveredByName: string
  /** ผู้รับของ — whoever signed for it at the farm. */
  receivedBy?: string
  items: DeliveryItem[]
  /** Sum of the delivered lines — the amount the debt is opened at. */
  totalAmount: number
  /** The debt this delivery raised. */
  debtId: ID
  remark?: string
}

export interface Booking {
  id: ID
  bookingNo: string
  bookingDate: string
  farmerId: ID
  farmerName: string
  farmerCode: string
  branchId: string
  branchName: string
  projectId?: string
  projectName?: string
  batchNo: string
  /** รุ่นฟัก — hatch batch date printed on the slip. */
  hatchDate?: string
  expectedDeliveryDate: string

  /** The document body. */
  items: BookingItem[]
  /** Sum of every line — the figure carried forward to raise the farmer's debt. */
  totalAmount: number

  /* Derived by the backend from the EGG lines, so downstream screens (the
     receiving slip) keep working without duplicated input. */
  breedId?: string
  breedName?: string
  quantity: number
  unit: string

  remark?: string
  attachments: Attachment[]
  /** Set once the officer records the hand-over; also what raises the debt. */
  delivery?: BookingDelivery
  status: BookingStatus
  createdAt: string
  updatedAt: string
}

/* ── Queue / Receiving (§7.5, §12) ──────────────────────────────────────── */

/**
 * §7.5 — the physical flow is จุดคัดแยก → จุดชั่งน้ำหนัก.
 *
 * The paper ใบคิว is written and issued at the sorting station; only then does
 * the farmer carry the cocoons over to the scale. Sorting therefore comes
 * first, and the queue number is assigned at the moment the slip is issued.
 */
export type QueueStatus =
  | 'SORTING'
  | 'WAITING_WEIGH'
  | 'CALLED'
  | 'WEIGHING'
  | 'COMPLETED'
  | 'CANCELLED'

export interface QueueTicket {
  id: ID
  /** Assigned when the sorting station issues the slip — null while SORTING. */
  queueNo: number | null
  queueDate: string
  /** สาขา / จุดรับซื้อ */
  branchId: string
  branchName: string
  farmerId: ID
  farmerCode: string
  farmerName: string
  bookingId?: ID
  bookingNo?: string
  breedId?: string
  /** สายพันธุ์ — e.g. ไหมวัยอ่อน จุล1 แม่จีน */
  breedName?: string
  /** โครงการ / ประเภทไข่ไหมที่จองไป — e.g. ไหมจุลอุ่นใจ */
  projectId?: string
  projectName?: string
  /** รุ่นฟัก — hatch batch date printed on the slip */
  hatchDate?: string
  /** แบ่งไหมจาก — boxes split from another farmer's allocation */
  splitFromBoxes?: number
  /** จำนวนไข่ไหมที่จองไป (กล่อง) */
  expectedBoxes?: number
  status: QueueStatus
  /** When the ใบรับซื้อ built from this ticket was sent to accounting. */
  exportedAt?: string
  exportBatchNo?: string
  arrivedAt: string
  /** When the sorting station issued the slip and assigned the queue number. */
  issuedAt?: string
  calledAt?: string
  startedWeighingAt?: string
  completedAt?: string
  counter?: string
  remark?: string
}

/* ── Weighing (§7.6) ────────────────────────────────────────────────────── */

/**
 * Grades as printed on ใบชั่งน้ำหนักรังไหมสด.
 *
 * On the purchase invoice the first three are billed under น้ำหนักรัง and the
 * last two under น้ำหนักเศษ, which is why the split lives on the grade itself.
 */
export type CocoonGrade = 'GOOD' | 'DAMAGED' | 'DOUBLE' | 'THIN' | 'FLOSS'

export const COCOON_GRADE_ORDER: CocoonGrade[] = [
  'GOOD',
  'DAMAGED',
  'DOUBLE',
  'THIN',
  'FLOSS',
]

/** One weighed bag. The scale is read per ถุง, never once for the whole load. */
export interface WeighBagLine {
  id: ID
  seq: number
  grade: CocoonGrade
  weightKg: number
}

export interface GradeTotal {
  grade: CocoonGrade
  bags: number
  weightKg: number
}

/** ใบชั่งน้ำหนักรังไหมสด — slip 1 of 2. */
export interface FreshWeighSlip {
  queueId: ID
  slipNo: string
  lines: WeighBagLine[]
  /** Backend-computed subtotals, one per grade that has bags. */
  gradeTotals: GradeTotal[]
  /** ดี + เสีย + แฝด */
  totalCocoonWeight: number
  /** บาง + ปุยไหม */
  totalScrapWeight: number
  /** รวมน้ำหนัก / จำนวนกล่องที่จองไป */
  avgWeightPerBox: number | null
  weighedAt?: string
  weighedBy?: string
  source: 'MANUAL' | 'SCALE'
  locked: boolean
}

/** ใบชั่งน้ำหนักเปลือกรัง — slip 2 of 2, the shell sample. */
export interface ShellWeighSlip {
  queueId: ID
  slipNo: string
  /** จำนวนรังตัวอย่าง */
  sampleCocoonCount: number | null
  /** นน.รังรวม (กรัม) */
  sampleCocoonWeightG: number | null
  /** นน.เปลือกรัง (กรัม) */
  shellWeightG: number | null
  /** %เปลือกรัง — backend: shell ÷ total */
  shellPercent: number | null
  moisturePercent: number | null
  weighedAt?: string
  weighedBy?: string
  locked: boolean
}

/* ── Quality (§6.1, §7.7) ───────────────────────────────────────────────── */

export type DryingLevel = 'OLD' | 'MEDIUM'

/**
 * Field names mirror §6.1 of the master spec. The Thai labels come from the
 * scanned receiving slip on the Figma board:
 *   1 รังดี · 2 รังหลังจ่อ · 3 รังเสีย · 4 รังแฝด · 5 รังบาง · 6 ปุยไหม
 * All six are recorded in ถุง (bags) on paper — the bag→kg conversion is still
 * unconfirmed (§20) so it is exposed as configuration, never hard-coded.
 */
export interface ReceivingQuality {
  queueId: ID
  goodCocoonQty: number
  afterScreenQty: number
  damagedCocoonQty: number
  doubleCocoonQty: number
  thinCocoonQty: number
  flossQty: number
  dryingLevel?: DryingLevel
  deadSilkworm?: boolean
  notDegummed?: boolean
  guaranteedGoodPrice?: boolean
  debtRelief?: boolean
  julUamJai?: boolean
  moisturePercent?: number
  remark?: string
  savedAt?: string
  confirmed: boolean
}

/* ── Purchase summary (§7.8) ────────────────────────────────────────────── */

/** One printed row of ใบรับซื้อรังไหมสด. */
export interface PurchaseLine {
  key: string
  label: string
  grade: CocoonGrade
  /** น้ำหนักรัง — set for ดี / เสีย / แฝด. */
  cocoonWeight: number | null
  /** น้ำหนักเศษ — set for บาง / ปุยไหม. */
  scrapWeight: number | null
  /** ราคารังไหม (บาท/กก.) */
  unitPrice: number | null
  amount: number | null
}

/**
 * The analysis block at the foot of the invoice. Every figure is produced by
 * the backend; the frontend only formats it (§7.8, §20).
 */
export interface PurchaseAnalysis {
  sampleCocoonCount: number | null
  sampleCocoonWeightG: number | null
  shellWeightG: number | null
  shellPercent: number | null
  moisturePercent: number | null
  /** %เลี้ยงรอด — against the egg boxes the farmer took. */
  survivalPercent: number | null
  weightPerCocoonG: number | null
  weightPerBoxKg: number | null
  incomePerBox: number | null
  /** ปัญหาที่ตรวจพบ และแนวทางแก้ไข, from the backend's analysis rules. */
  findings: string[]
  recommendations: string[]
}

export interface PurchaseSummary {
  id: ID
  queueId: ID
  transactionNo: string
  /**
   * Value encoded in the document QR code. Accounting scans it to trigger the
   * document check, so it is the transaction number itself — a scanner works
   * the same whether or not the office is online.
   */
  documentCode: string
  purchaseDate: string
  farmerId: ID
  farmerName: string
  farmerCode: string
  farmerAddress?: string
  branchId: string
  branchName: string
  breedName?: string
  batchNo?: string
  hatchDate?: string
  boxes: number | null

  lines: PurchaseLine[]
  /** Every figure below arrives calculated from the backend (§7.8). */
  totalCocoonWeight: number
  totalScrapWeight: number
  /** รวมรายได้ — the amount that can be applied against the farmer's debt. */
  grossAmount: number
  /** เงินเพิ่มพิเศษ บาท/กก. paid separately within the accounting period. */
  bonusPerKg: number | null

  analysis: PurchaseAnalysis

  deductionAmount: number
  netPayable: number
  debtPreview?: {
    outstandingDebt: number
    eligibleDeduction: number
  }
  documents: { label: string; ref: string }[]
  status: 'PENDING' | 'COMPLETED'
  completedAt?: string
  /**
   * When this purchase was sent to accounting as ซื้อวัตถุดิบ.
   *
   * Carried through from the queue ticket, which is where it is stored — the
   * invoice itself is recomputed on every read and has nowhere to keep it.
   */
  exportedAt?: string
  exportBatchNo?: string
}

/* ── Debt / ตัดหนี้รังไหมสด (§7.9, §12) ─────────────────────────────────── */

export type DebtStatus = 'OPEN' | 'PARTIAL' | 'SETTLED' | 'HOLD'

/** What the farmer took on credit — one line per booking item. */
export interface DebtItem {
  id: ID
  productName: string
  quantity: number
  unitName: string
  unitPrice: number
  amount: number
}

/**
 * A debt is raised by a booking and belongs to that booking's round.
 *
 * Deductions are matched round by round: income from a purchase can only pay
 * down debts from the same รุ่น/รอบ, so a farmer running two batches never has
 * one batch's income silently clear the other's debt.
 */
export interface DebtRecord {
  id: ID
  /**
   * Where the debt came from: the delivery of a booking. `sourceId` /
   * `sourceNo` point at the booking, because that is the number everyone
   * quotes, but the amount and the items are the delivered ones.
   */
  sourceType: 'BOOKING_DELIVERY'
  sourceId: ID
  sourceNo: string
  farmerId: ID
  farmerName: string
  farmerCode: string
  branchId: string
  branchName: string
  /** รอบ / รุ่นไข่ไหม the debt belongs to. */
  batchNo: string
  hatchDate?: string
  breedName?: string
  /** รายการหนี้ที่รับไปตอนจอง */
  items: DebtItem[]
  originalAmount: number
  deductedAmount: number
  remainingBalance: number
  status: DebtStatus
  remark?: string
  /**
   * When this debt was exported for การตั้งหนี้ in the accounting system.
   *
   * Undefined means it has not been sent. Accounting raises the receivable on
   * their side from that file, so sending the same debt twice would double the
   * farmer's balance there — the stamp is what makes the export repeatable
   * without being repeatable by accident.
   */
  exportedAt?: string
  exportBatchNo?: string
  createdAt: string
  updatedAt: string
}

/** One applied deduction, kept so the history is reconstructable. */
export interface DebtDeduction {
  id: ID
  debtId: ID
  purchaseId?: ID
  transactionNo?: string
  amount: number
  at: string
  actorName: string
  remark?: string
  /** When this offset was exported for การตัดหนี้ in the accounting system. */
  exportedAt?: string
  exportBatchNo?: string
}

/* ── จ่ายเงินเกษตรกร (§7.10) ─────────────────────────────────────────────── */

export type PaymentStatus = 'PENDING' | 'PAID' | 'CANCELLED'

/**
 * เบิกจ่ายให้เกษตรกร — what is left after the round's debt has been taken off.
 *
 * One per completed purchase. The three figures are kept together on purpose:
 * a farmer asking "ทำไมได้เท่านี้" is answered by the row itself, without
 * anyone having to reopen the invoice and the debt ledger side by side.
 */
export interface FarmerPayment {
  id: ID
  paymentNo: string
  purchaseId: ID
  /** เลขที่ใบรับซื้อรังไหมสด */
  transactionNo: string
  farmerId: ID
  farmerCode: string
  farmerName: string
  branchId: string
  branchName: string
  batchNo?: string
  /** รวมรายได้ในใบรับซื้อ */
  grossAmount: number
  /** หักหนี้ของรอบนี้ */
  deductedAmount: number
  /** ยอดที่ต้องจ่ายจริง = gross − deducted */
  netAmount: number
  status: PaymentStatus
  method?: PaymentMethod
  paidDate?: string
  bankName?: string
  accountNo?: string
  transferRef?: string
  remark?: string
  paidBy?: string
  paidByName?: string
  createdAt: string
  updatedAt: string
  exportedAt?: string
  exportBatchNo?: string
}

/* ── ส่งออกไประบบบัญชี (§12) ─────────────────────────────────────────────── */

/** Which accounting event a file carries. */
export type ExportKind = 'DEBT' | 'PURCHASE' | 'DEDUCTION' | 'PAYMENT'

export interface ExportBatch {
  batchNo: string
  kind: ExportKind
  /** The accounting system the file was cut for. */
  target: string
  fileName: string
  rowCount: number
  totalAmount: number
  exportedAt: string
  exportedBy: string
}

/** A file the browser hands to the user, ready to import. */
export interface ExportResult {
  batch: ExportBatch
  /** CSV text, already including the BOM Excel needs for Thai. */
  content: string
}

/** A completed purchase whose income has not been fully applied yet. */
export interface DeductionSource {
  purchaseId: ID
  transactionNo: string
  purchaseDate: string
  batchNo?: string
  /** รวมรายได้ from the invoice. */
  grossAmount: number
  appliedAmount: number
  availableAmount: number
}

export interface DeductionPreview {
  debtId: ID
  currentDeduction: number
  remainingBalance: number
  /** What is left of the purchase income after this deduction. */
  sourceRemaining: number
  netPayable: number
  warnings: string[]
}

/* ── Expense (§8, §12) ──────────────────────────────────────────────────── */

export type ExpenseStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER'

export interface ExpenseCategory {
  id: string
  name: string
  types: { id: string; name: string }[]
}

export interface Expense {
  id: ID
  expenseNo: string
  expenseDate: string
  branchId: string
  branchName: string
  categoryId: string
  categoryName: string
  expenseTypeId?: string
  expenseTypeName?: string
  description: string
  vendor?: string
  referenceNo?: string
  quantity: number
  unit?: string
  unitPrice: number
  /** Always Quantity × Unit Price — read-only in the UI (§8.4). */
  amount: number
  paymentMethod: PaymentMethod
  paidDate?: string
  bankName?: string
  accountNo?: string
  transferDate?: string
  transferRef?: string
  attachments: Attachment[]
  remark?: string
  status: ExpenseStatus
  createdBy: string
  createdByName: string
  /** Set when the approver acts — the audit trail of who released the money. */
  approvedBy?: string
  approvedByName?: string
  approvedAt?: string
  /** Required when rejecting, so the submitter knows what to fix. */
  rejectedReason?: string
  createdAt: string
  updatedAt: string
}
