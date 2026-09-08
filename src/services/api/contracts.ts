import type {
  Attachment,
  AuditEntry,
  ListParams,
  Option,
  Paginated,
} from '@/types/common'
import type { LoginPayload, Permission, Role, Session, User } from '@/types/auth'
import type { DashboardParams, DashboardSnapshot, WorkTypeId } from '@/types/dashboard'
import type {
  FloorWeightQuery,
  FloorWeightSession,
  IntegrationStatus,
} from '@/types/integration'
import type {
  Product,
  ProductPrice,
  ProductUnit,
  Warehouse,
} from '@/types/product'
import type {
  BankMaster,
  BranchMaster,
  ExpenseCategoryMaster,
  ProjectMaster,
} from '@/types/master'
import type {
  Booking,
  CocoonGrade,
  ExportBatch,
  ExportKind,
  ExportResult,
  FarmerPayment,
  PaymentMethod,
  DebtDeduction,
  DebtRecord,
  DeductionPreview,
  DeductionSource,
  Expense,
  ExpenseCategory,
  Farmer,
  FreshWeighSlip,
  PurchaseSummary,
  QueueTicket,
  ReceivingQuality,
  ShellWeighSlip,
} from '@/types/domain'

/**
 * §11 — Service Interface layer.
 *
 *   UI/Page → Feature Hook → Service Interface → API Adapter
 *                                              ↘ Mock Adapter
 *
 * Page components never call fetch/axios directly; they go through the feature
 * hooks in `src/features/<x>/hooks.ts`, which call these interfaces.
 */

/* ── Auth ───────────────────────────────────────────────────────────────── */

export interface AuthService {
  login(payload: LoginPayload): Promise<Session>
  logout(): Promise<void>
  me(): Promise<User>
}

/* ── Dashboard ──────────────────────────────────────────────────────────── */

export interface DashboardService {
  /** One snapshot per work type — switching work type re-queries. */
  getSnapshot(params: DashboardParams): Promise<DashboardSnapshot>
  /** Persists the user's own default work type server-side. */
  setDefaultWorkType(workTypeId: WorkTypeId): Promise<void>
}

/* ── Farmers ────────────────────────────────────────────────────────────── */

export interface FarmerPayload {
  code: string
  firstName: string
  lastName: string
  nationalId?: string
  phone?: string
  address?: string
  subDistrict?: string
  district?: string
  province?: string
  branchId: string
  status: Farmer['status']
  programs: Farmer['programs']
}

export interface FarmerHistoryItem {
  id: string
  kind: 'BOOKING' | 'RECEIVING' | 'PAYMENT' | 'DEBT'
  at: string
  title: string
  detail?: string
  amount?: number
  status: string
  href?: string
}

export interface FarmerService {
  list(params: ListParams): Promise<Paginated<Farmer>>
  get(id: string): Promise<Farmer>
  create(payload: FarmerPayload): Promise<Farmer>
  update(id: string, payload: FarmerPayload): Promise<Farmer>
  /** Async Select source. */
  search(query: string): Promise<Option[]>
  history(id: string): Promise<FarmerHistoryItem[]>
}

/* ── Bookings ───────────────────────────────────────────────────────────── */

/**
 * A booking line carries only the product and how many. The unit and the price
 * are resolved from the product master by the backend, so a document can never
 * charge a price that is not in the price list — changing what a farmer pays
 * means editing `ProductPrice`.
 */
export interface BookingItemPayload {
  productId: string
  quantity: number
}

export interface BookingPayload {
  bookingDate: string
  farmerId: string
  branchId: string
  projectId?: string
  batchNo: string
  hatchDate?: string
  expectedDeliveryDate: string
  items: BookingItemPayload[]
  remark?: string
}

/** What the officer actually handed over, line by line. */
export interface DeliveryItemPayload {
  bookingItemId: string
  quantity: number
}

export interface DeliveryPayload {
  deliveredAt: string
  receivedBy?: string
  items: DeliveryItemPayload[]
  remark?: string
}

/**
 * A farmer's round, and whether จุดคัดแยก may write a slip against it.
 *
 * Ineligible rounds are returned too, with the reason. "No round available" is
 * the same sentence for a farmer who has not been delivered yet, one whose
 * slip is already open, and one who sold last week — and the counter needs to
 * know which, because the next action is different in each case.
 */
export type RoundBlockedReason =
  /** ยังไม่ได้บันทึกส่งของ — nothing has been handed over. */
  | 'NOT_DELIVERED'
  /** มีใบคิวอยู่แล้ว — a slip is already open for this round. */
  | 'ALREADY_QUEUED'
  /** ขายรังไหมของรอบนี้แล้ว — the round is finished; the farmer must book again. */
  | 'ALREADY_PURCHASED'

export interface FarmerRound {
  booking: Booking
  eligible: boolean
  blockedReason?: RoundBlockedReason
  /** The slip that already claims the round, when there is one. */
  queueId?: string
  queueNo?: number | null
}

export interface BookingService {
  list(params: ListParams): Promise<Paginated<Booking>>
  get(id: string): Promise<Booking>
  create(payload: BookingPayload): Promise<Booking>
  update(id: string, payload: BookingPayload): Promise<Booking>
  cancel(id: string, reason: string): Promise<Booking>
  /**
   * บันทึกส่งของ — records the hand-over and raises the farmer's debt from the
   * delivered lines. Prices come from the product master, never the payload,
   * so a delivery cannot quietly change what a farmer owes.
   */
  recordDelivery(id: string, payload: DeliveryPayload): Promise<Booking>
  /**
   * ทุกรอบของเกษตรกรรายนี้ พร้อมบอกว่ารอบไหนออกใบคิวได้ และรอบที่ไม่ได้เพราะอะไร.
   *
   * `includeBookingId` keeps the round already on an open slip eligible, so
   * editing a draft does not lose its own selection.
   */
  rounds(farmerId: string, includeBookingId?: string): Promise<FarmerRound[]>
  /** Options for the batch selector, dependent on the chosen breed. */
  batchOptions(breedId: string): Promise<Option[]>
}

/* ── Receiving: queue → weighing → quality → purchase ───────────────────── */

/**
 * The header of the paper ใบคิว, captured at จุดคัดแยก.
 *
 * Only three things are decided here: which farmer, which round they are
 * bringing, and which buying point. สายพันธุ์ · โครงการ · รุ่นฟัก · จำนวนไข่ไหมที่จองไป
 * are all resolved by the backend from the booking, so the slip cannot claim a
 * farmer took eggs they were never delivered.
 */
export interface QueuePayload {
  farmerId: string
  branchId: string
  bookingId: string
  splitFromBoxes?: number
  remark?: string
}

/** One bag on the scale. Weight is captured per ถุง, never as one gross load. */
export interface WeighBagPayload {
  grade: CocoonGrade
  weightKg: number
  source: FreshWeighSlip['source']
}

export interface ShellWeighPayload {
  sampleCocoonCount: number | null
  sampleCocoonWeightG: number | null
  shellWeightG: number | null
  moisturePercent: number | null
}

export type QualityPayload = Omit<ReceivingQuality, 'queueId' | 'savedAt' | 'confirmed'>

export interface ReceivingService {
  getQueue(params: ListParams): Promise<Paginated<QueueTicket>>
  getTicket(queueId: string): Promise<QueueTicket>
  /** จุดคัดแยก — opens a new slip in SORTING; no queue number yet. */
  createQueue(payload: QueuePayload): Promise<QueueTicket>
  /** Updates the slip header while it is still being sorted. */
  updateQueue(queueId: string, payload: QueuePayload): Promise<QueueTicket>
  /**
   * ออกใบคิว — assigns the queue number and hands the farmer over to the weigh
   * station. The quality section must be filled before this succeeds.
   */
  issueSlip(queueId: string): Promise<QueueTicket>
  callQueue(queueId: string): Promise<QueueTicket>
  recallQueue(queueId: string): Promise<QueueTicket>
  startWeighing(queueId: string): Promise<QueueTicket>
  cancelQueue(queueId: string, reason: string): Promise<QueueTicket>

  /* ใบชั่งน้ำหนักรังไหมสด — slip 1. All subtotals arrive computed. */
  getFreshWeighSlip(queueId: string): Promise<FreshWeighSlip>
  addWeighBag(queueId: string, payload: WeighBagPayload): Promise<FreshWeighSlip>
  removeWeighBag(queueId: string, lineId: string): Promise<FreshWeighSlip>
  /** Locks the weight. Reversing it requires `weighing:override` (§7.6). */
  lockFreshWeighSlip(queueId: string): Promise<FreshWeighSlip>
  unlockFreshWeighSlip(queueId: string, reason: string): Promise<FreshWeighSlip>

  /* ใบชั่งน้ำหนักเปลือกรัง — slip 2, the sample. */
  getShellWeighSlip(queueId: string): Promise<ShellWeighSlip>
  saveShellWeighSlip(queueId: string, payload: ShellWeighPayload): Promise<ShellWeighSlip>
  lockShellWeighSlip(queueId: string): Promise<ShellWeighSlip>
  unlockShellWeighSlip(queueId: string, reason: string): Promise<ShellWeighSlip>

  getQuality(queueId: string): Promise<ReceivingQuality>
  saveQuality(queueId: string, payload: QualityPayload): Promise<ReceivingQuality>
  confirmQuality(queueId: string): Promise<ReceivingQuality>

  /** Every figure inside is backend-calculated (§7.8). */
  getPurchaseSummary(queueId: string): Promise<PurchaseSummary>
  completePurchase(queueId: string): Promise<PurchaseSummary>
}

/* ── Debt ───────────────────────────────────────────────────────────────── */

/** One line of the "waiting to be sent to accounting" list. */
export interface PendingExportRow {
  id: string
  /** เลขที่เอกสารที่บัญชีจะเห็น */
  docNo: string
  docDate: string
  farmerCode: string
  farmerName: string
  batchNo: string
  amount: number
  /** For a deduction: which purchase paid it. */
  reference?: string
}

export interface DeductionPayload {
  /** The completed purchase whose รวมรายได้ pays this debt down. */
  purchaseId: string
  currentDeduction: number
  remark?: string
}

export interface DebtService {
  list(params: ListParams & { farmerId?: string; batchNo?: string }): Promise<Paginated<DebtRecord>>
  get(id: string): Promise<DebtRecord>
  /**
   * Purchases whose income has not been fully applied yet, restricted to the
   * debt's own รอบ — income from one batch never pays down another's debt.
   */
  deductionSources(id: string): Promise<DeductionSource[]>
  /** Server-side preview — the client never computes the ceiling itself. */
  previewDeduction(id: string, payload: DeductionPayload): Promise<DeductionPreview>
  confirmDeduction(
    id: string,
    payload: DeductionPayload,
    idempotencyKey: string,
  ): Promise<DebtRecord>
  deductions(id: string): Promise<DebtDeduction[]>
  auditTrail(id: string): Promise<AuditEntry[]>

  /* ── ส่งออกไประบบบัญชี ───────────────────────────────────────────────── */

  /**
   * รายการที่ยังไม่ได้ส่งออก.
   *
   * `DEBT` คือหนี้ที่ตั้งแล้วแต่ยังไม่ได้ส่งไปตั้งลูกหนี้ที่บัญชี
   * `DEDUCTION` คือการหักกลบที่ทำในระบบนี้แล้วแต่บัญชียังไม่รู้
   * `PAYMENT` คือเงินที่จ่ายเกษตรกรไปแล้วแต่ยังไม่ได้ส่งใบสำคัญจ่าย
   */
  pendingExport(kind: ExportKind): Promise<PendingExportRow[]>
  /**
   * Cuts a file and stamps every row in it.
   *
   * Accounting posts from the file, so a row that goes twice doubles the
   * farmer's balance on their side — the stamp is what makes re-exporting a
   * deliberate act rather than an accident.
   */
  exportToAccounting(kind: ExportKind, ids: string[]): Promise<ExportResult>
  exportHistory(): Promise<ExportBatch[]>
}

/* ── จ่ายเงินเกษตรกร (§7.10) ─────────────────────────────────────────────── */

/**
 * What the counter fills in when it hands the farmer their money.
 *
 * The amount is deliberately absent: it is รวมรายได้ − หักหนี้ of the round and
 * the server owns it, so no one can pay out a different figure from the one
 * the invoice and the debt ledger agree on.
 */
export interface PaymentPayload {
  method: PaymentMethod
  paidDate: string
  bankName?: string
  accountNo?: string
  transferRef?: string
  remark?: string
}

export interface PaymentService {
  list(params: ListParams & { farmerId?: string }): Promise<Paginated<FarmerPayment>>
  get(id: string): Promise<FarmerPayment>
  /** The pay-out belonging to one ใบรับซื้อ, if the purchase is finished. */
  forPurchase(purchaseId: string): Promise<FarmerPayment | null>
  /** บันทึกจ่ายเงิน — an idempotency key so a retried click cannot pay twice. */
  pay(id: string, payload: PaymentPayload, idempotencyKey: string): Promise<FarmerPayment>
  cancel(id: string, reason: string): Promise<FarmerPayment>
}

/* ── Integration: Floor Weight Cocoon ───────────────────────────────────── */

/**
 * The scale at จุดชั่งน้ำหนัก is a separate system with its own database. This
 * service is the only way into it, and it is read-only by design — ChunERP
 * pulls the weighing, it never writes one back.
 */
export interface IntegrationService {
  /** Is the link up, and how much is visible through it right now. */
  floorWeightStatus(): Promise<IntegrationStatus>
  /** วันที่ชั่งล่าสุดของเกษตรกรรายนี้ — null when they have never been weighed. */
  floorWeightLatestDate(farmerCode: string): Promise<string | null>
  /** ดึงรายการชั่งด้วยรหัสเกษตรกร + วันที่ชั่ง (ไม่ระบุวันที่ = ล่าสุด). */
  floorWeightSessions(query: FloorWeightQuery): Promise<FloorWeightSession[]>
  /**
   * นำเข้าใบชั่งเข้าคิว — the backend builds both slips from the external rows
   * and returns them; the station never types a weight that came off the scale.
   */
  importFloorWeight(
    queueId: string,
    sessionId: number,
  ): Promise<{ fresh: FreshWeighSlip; shell: ShellWeighSlip }>
}

/* ── Expenses ───────────────────────────────────────────────────────────── */

export interface ExpensePayload {
  expenseDate: string
  branchId: string
  categoryId: string
  expenseTypeId?: string
  description: string
  vendor?: string
  referenceNo?: string
  quantity: number
  unit?: string
  unitPrice: number
  paymentMethod: Expense['paymentMethod']
  paidDate?: string
  bankName?: string
  accountNo?: string
  transferDate?: string
  transferRef?: string
  remark?: string
  status: Extract<Expense['status'], 'DRAFT' | 'SUBMITTED'>
}

export interface ExpenseService {
  list(params: ListParams & { categoryId?: string; createdBy?: string }): Promise<Paginated<Expense>>
  get(id: string): Promise<Expense>
  create(payload: ExpensePayload): Promise<Expense>
  update(id: string, payload: ExpensePayload): Promise<Expense>
  cancel(id: string, reason: string): Promise<Expense>
  /**
   * §8 — approval releases the money, so it is a separate right
   * (`expense:approve`) from creating the record, and only a SUBMITTED item
   * can be acted on. The backend is the authority; the buttons are just UX.
   */
  approve(id: string, remark?: string): Promise<Expense>
  reject(id: string, reason: string): Promise<Expense>
  duplicate(id: string): Promise<Expense>
  categories(): Promise<ExpenseCategory[]>
  uploadAttachment(
    id: string,
    file: File,
    onProgress?: (percent: number) => void,
  ): Promise<Attachment>
  removeAttachment(id: string, attachmentId: string): Promise<void>
  auditTrail(id: string): Promise<AuditEntry[]>
}

/* ── Reports & System ───────────────────────────────────────────────────── */

export type ReportId =
  | 'PURCHASE_SUMMARY'
  | 'FARMER_ACTIVITY'
  | 'EXPENSE_BY_CATEGORY'
  | 'DEBT_OUTSTANDING'

export interface ReportColumn {
  key: string
  label: string
  align?: 'left' | 'right'
  format?: 'text' | 'number' | 'currency' | 'weight' | 'date'
}

export interface ReportResult {
  reportId: ReportId
  title: string
  generatedAt: string
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
  totals?: Record<string, number>
}

export interface ReportService {
  definitions(): Promise<{ id: ReportId; title: string; description: string }[]>
  run(reportId: ReportId, params: ListParams & { categoryId?: string }): Promise<ReportResult>
}

export interface SystemUser {
  id: string
  username: string
  displayName: string
  role: Role
  branchName: string
  active: boolean
  permissions: Permission[]
}

export interface SystemSetting {
  key: string
  group: string
  label: string
  description?: string
  type: 'text' | 'number' | 'boolean' | 'select'
  value: string | number | boolean
  options?: Option[]
  /** Set when the value depends on a business rule that is not yet locked (§20). */
  pendingConfirmation?: boolean
}

export interface SystemService {
  audit(params: ListParams): Promise<Paginated<AuditEntry>>
  users(): Promise<SystemUser[]>
  updateUserPermissions(userId: string, permissions: Permission[]): Promise<SystemUser>
  settings(): Promise<SystemSetting[]>
  updateSetting(key: string, value: string | number | boolean): Promise<SystemSetting>
}

/* ── Product master ─────────────────────────────────────────────────────── */

export interface ProductPayload {
  code: string
  name: string
  kind: Product['kind']
  unitId: string
  warehouseId?: string
  breedId?: string
  description?: string
  active: boolean
}

export interface ProductPricePayload {
  productId: string
  price: number
  effectiveFrom: string
  effectiveTo?: string
  note?: string
}

export interface ProductUnitPayload {
  code: string
  name: string
  active: boolean
}

export interface WarehousePayload {
  code: string
  name: string
  branchId: string
  active: boolean
}

export interface ProductService {
  list(params: ListParams & { kind?: string }): Promise<Paginated<Product>>
  get(id: string): Promise<Product>
  /** Picker source for documents — only active products with a live price. */
  sellable(query?: string): Promise<Product[]>
  create(payload: ProductPayload): Promise<Product>
  update(id: string, payload: ProductPayload): Promise<Product>

  units(): Promise<ProductUnit[]>
  saveUnit(id: string | null, payload: ProductUnitPayload): Promise<ProductUnit>

  prices(params: ListParams & { productId?: string }): Promise<Paginated<ProductPrice>>
  /**
   * Adds a new dated price. The backend closes the previous row rather than
   * overwriting it, so the price history stays auditable.
   */
  savePrice(payload: ProductPricePayload): Promise<ProductPrice>

  warehouses(): Promise<Warehouse[]>
  saveWarehouse(id: string | null, payload: WarehousePayload): Promise<Warehouse>
}

/* ── General master data ────────────────────────────────────────────────── */

export interface BranchPayload {
  code: string
  name: string
  address?: string
  phone?: string
  active: boolean
}

export interface ProjectPayload {
  code: string
  name: string
  description?: string
  active: boolean
}

export interface BankPayload {
  code: string
  name: string
  active: boolean
}

export interface ExpenseCategoryPayload {
  code: string
  name: string
  active: boolean
  types: { id?: string; name: string; active: boolean }[]
}

/**
 * Every dropdown in the app reads its options from here. `options()` returns the
 * active rows only — the CRUD lists return everything so a disabled row can
 * still be re-enabled.
 */
export interface MasterService {
  branches(includeInactive?: boolean): Promise<BranchMaster[]>
  saveBranch(id: string | null, payload: BranchPayload): Promise<BranchMaster>

  projects(includeInactive?: boolean): Promise<ProjectMaster[]>
  saveProject(id: string | null, payload: ProjectPayload): Promise<ProjectMaster>

  banks(includeInactive?: boolean): Promise<BankMaster[]>
  saveBank(id: string | null, payload: BankPayload): Promise<BankMaster>

  expenseCategories(includeInactive?: boolean): Promise<ExpenseCategoryMaster[]>
  saveExpenseCategory(
    id: string | null,
    payload: ExpenseCategoryPayload,
  ): Promise<ExpenseCategoryMaster>
}

/* ── Root registry ──────────────────────────────────────────────────────── */

export interface Services {
  auth: AuthService
  dashboard: DashboardService
  farmers: FarmerService
  bookings: BookingService
  products: ProductService
  master: MasterService
  receiving: ReceivingService
  integration: IntegrationService
  debts: DebtService
  payments: PaymentService
  expenses: ExpenseService
  reports: ReportService
  system: SystemService
}
