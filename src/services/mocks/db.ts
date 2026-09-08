import {
  BANKS,
  BRANCHES,
  COCOON_GRADES,
  EXPENSE_CATEGORY_SEED,
  PROJECTS,
  SILK_BREEDS,
} from '@/constants'
import { ROLE_PERMISSIONS } from '@/constants/rbac'
import type { Role, User } from '@/types/auth'
import type { AuditEntry } from '@/types/common'
import type { SystemSetting } from '@/services/api/contracts'
import type {
  Product,
  ProductKind,
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
import type { FloorWeightSession } from '@/types/integration'
import type {
  Booking,
  BookingItem,
  CocoonGrade,
  DeliveryItem,
  DebtDeduction,
  DebtRecord,
  Expense,
  ExpenseStatus,
  ExportBatch,
  Farmer,
  FarmerPayment,
  FreshWeighSlip,
  PaymentMethod,
  PurchaseAnalysis,
  PurchaseLine,
  PurchaseSummary,
  QueueStatus,
  QueueTicket,
  ReceivingQuality,
  ShellWeighSlip,
} from '@/types/domain'
import { COCOON_GRADE_ORDER } from '@/types/domain'

/**
 * API-002 — deterministic fixture data for the mock adapter.
 *
 * Everything here is *shaped* like the real contract so swapping in the HTTP
 * adapter changes no page code. Prices and deduction ceilings are produced by
 * this "backend" on purpose: §20 forbids locking those formulas into the
 * frontend.
 */

/* ── Deterministic PRNG so every reload shows the same board ─────────────── */

function makeRng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

const rng = makeRng(20260907)

const pick = <T,>(list: T[]): T => list[Math.floor(rng() * list.length)]
const between = (min: number, max: number) => min + rng() * (max - min)
const intBetween = (min: number, max: number) => Math.floor(between(min, max + 1))
const round2 = (n: number) => Math.round(n * 100) / 100

/** Rounds as it sums, so a total never inherits a float tail. */
const sumBy = <T,>(list: T[], get: (item: T) => number) =>
  round2(list.reduce((sum, item) => sum + get(item), 0))


const DISTRICTS = [
  { district: 'เมืองกำแพงเพชร', province: 'กำแพงเพชร', sub: 'หนองปลิง' },
  { district: 'นครไทย', province: 'พิษณุโลก', sub: 'บ้านแยง' },
  { district: 'หล่มสัก', province: 'เพชรบูรณ์', sub: 'ปากช่อง' },
  { district: 'ภูเรือ', province: 'เลย', sub: 'หนองบัว' },
]

/**
 * The fixture clock.
 *
 * Seeded times are offsets from *now*, never from a pinned calendar date. The
 * station boards ask for "today", so a fixture frozen on some past day means
 * every slip written after the next midnight lands on a date nobody is looking
 * at — the queue silently empties. Determinism comes from the PRNG, which is
 * seeded independently of the date.
 */
const now = new Date()

function daysAgo(days: number, hour = 9, minute = 0): string {
  const d = new Date(now)
  d.setDate(d.getDate() - days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

/**
 * A moment earlier today.
 *
 * Clamped to midnight on purpose: the station boards ask for *today's* queue,
 * so an offset taken in the small hours would push the whole board onto
 * yesterday's date and show nothing. Clamping keeps the demo populated at any
 * hour, and keeps every "waited N minutes" non-negative.
 */
function minutesAgo(minutes: number): string {
  const startOfDay = new Date(now)
  startOfDay.setHours(0, 0, 0, 0)
  const at = Math.max(now.getTime() - minutes * 60_000, startOfDay.getTime() + 60_000)
  return new Date(at).toISOString()
}

/** Wall-clock time for records the app creates while it runs. */
export function mockNow(): Date {
  return new Date()
}

/**
 * The local calendar day of an instant.
 *
 * Date columns and `<input type="date">` both hold a local day, while records
 * hold UTC instants — slicing an ISO string instead would put anything before
 * 07:00 in UTC+7 on the day before.
 */
export function localDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

/* ── Users (AUTH-001) ───────────────────────────────────────────────────── */

const USER_SEED: { username: string; displayName: string; role: Role; branchId: string }[] = [
  { username: 'admin', displayName: 'สุริยา ชัยมงคล', role: 'ADMIN', branchId: 'BR-KPP' },
  { username: 'farm', displayName: 'ประเสริฐ ศรีทอง', role: 'FARM_MANAGER', branchId: 'BR-KPP' },
  { username: 'receiving', displayName: 'อรุณี ดวงแก้ว', role: 'RECEIVING_STAFF', branchId: 'BR-KPP' },
  { username: 'account', displayName: 'พิมพ์ใจ เพ็ชรรัตน์', role: 'ACCOUNTING', branchId: 'BR-NKT' },
  { username: 'manager', displayName: 'ณรงค์ ภูมิใจ', role: 'MANAGER', branchId: 'BR-KPP' },
  { username: 'viewer', displayName: 'กมล สายบัว', role: 'VIEWER', branchId: 'BR-PCB' },
]

/** Demo credentials only — the real backend never ships passwords in source. */
export const DEMO_PASSWORD = 'chulfarm2569'

export const users: User[] = USER_SEED.map((seed, i) => ({
  id: `U-${String(i + 1).padStart(3, '0')}`,
  username: seed.username,
  displayName: seed.displayName,
  email: `${seed.username}@chulfarm.co.th`,
  role: seed.role,
  permissions: ROLE_PERMISSIONS[seed.role],
  branchId: seed.branchId,
  branches: seed.role === 'ADMIN' || seed.role === 'MANAGER' ? BRANCHES : [BRANCHES.find((b) => b.id === seed.branchId)!],
  defaultWorkTypeId: undefined,
}))

/* ── Farmers (FAR-001) ──────────────────────────────────────────────────── */

/**
 * Ten farmers, one round each.
 *
 * A farmer rears one batch at a time: จอง → เจ้าหน้าที่ส่งของ → ตั้งหนี้ → เลี้ยง
 * → เอารังไหมสดมาขาย → หักหนี้ → รับส่วนต่าง, and only then do they book the
 * next round. There is never a second round waiting to be sold while the first
 * is still open.
 *
 * So the fixture is a table of ten farmers standing at ten different points on
 * that one path, not a random spread — every screen then shows a state someone
 * could actually be in.
 */
type FarmerStage =
  /** ครบทั้งกระบวนการ — sold, invoiced, debt settled. */
  | 'COMPLETE'
  /** จองแล้ว รอเจ้าหน้าที่ส่งของ — no debt yet. */
  | 'BOOKED'
  /** ส่งของแล้ว ตั้งหนี้แล้ว กำลังเลี้ยง — no queue yet. */
  | 'DELIVERED'
  /** ส่งของแล้ว และมาถึงจุดคัดแยกวันนี้. */
  | 'QUEUE_SORTING'
  /** ออกใบคิวแล้ว รอชั่งน้ำหนัก. */
  | 'QUEUE_WAITING_WEIGH'

const FARMER_SEED: {
  first: string
  last: string
  stage: FarmerStage
  /** รอบของเกษตรกรรายนี้ */
  batchNo: string
}[] = [
  { first: 'สมชาย', last: 'ทองอินทร์', stage: 'COMPLETE', batchNo: 'R1/2569' },
  { first: 'บุญมี', last: 'ศรีสุข', stage: 'BOOKED', batchNo: 'R2/2569' },
  { first: 'ปราณี', last: 'วงศ์คำ', stage: 'BOOKED', batchNo: 'R3/2569' },
  { first: 'ทรงกรด', last: 'บัวหลวง', stage: 'QUEUE_WAITING_WEIGH', batchNo: 'R4/2569' },
  { first: 'ละมัย', last: 'พรมมา', stage: 'QUEUE_SORTING', batchNo: 'R5/2569' },
  { first: 'สุนีย์', last: 'ดวงแก้ว', stage: 'DELIVERED', batchNo: 'R6/2569' },
  { first: 'จันทร์เพ็ญ', last: 'สายบัว', stage: 'DELIVERED', batchNo: 'R7/2569' },
  { first: 'เฉลิม', last: 'ศรีทอง', stage: 'DELIVERED', batchNo: 'R8/2569' },
  { first: 'วิชัย', last: 'มั่นคง', stage: 'DELIVERED', batchNo: 'R9/2569' },
  { first: 'ทองสุข', last: 'อินทร์ทอง', stage: 'DELIVERED', batchNo: 'R10/2569' },
]

/** Everyone buys and sells at the same branch, so one board shows the lot. */
const HOME_BRANCH = BRANCHES.find((b) => b.id === 'BR-KPP') ?? BRANCHES[0]

export const farmers: Farmer[] = FARMER_SEED.map((seed, i) => {
  const area = DISTRICTS[i % DISTRICTS.length]
  return {
    id: `F-${String(i + 1).padStart(4, '0')}`,
    // Codes follow the 7-digit format printed on the receiving slip (3606609).
    code: String(3_600_000 + (i + 1) * 137 + 41),
    firstName: seed.first,
    lastName: seed.last,
    fullName: `${seed.first} ${seed.last}`,
    nationalId: `${intBetween(1, 8)}${String(intBetween(1000, 9999))}${String(intBetween(10_000, 99_999))}${String(intBetween(10, 99))}${intBetween(0, 9)}`,
    phone: `08${intBetween(1, 9)}${String(intBetween(1_000_000, 9_999_999))}`,
    address: `${intBetween(1, 240)} หมู่ ${intBetween(1, 14)}`,
    subDistrict: area.sub,
    district: area.district,
    province: area.province,
    branchId: HOME_BRANCH.id,
    branchName: HOME_BRANCH.name,
    status: 'ACTIVE',
    joinedAt: daysAgo(intBetween(400, 2200)),
    programs: {
      julUamJai: i % 2 === 0,
      debtRelief: i % 3 === 0,
      guaranteedGoodPrice: i % 4 === 0,
    },
    // Filled in from the debt ledger once the rounds below are built.
    outstandingDebt: 0,
    totalPurchaseAmount: 0,
    createdAt: daysAgo(intBetween(400, 2200)),
    updatedAt: daysAgo(intBetween(0, 40)),
  } satisfies Farmer
})

const stageOf = (farmerId: string): FarmerStage =>
  FARMER_SEED[farmers.findIndex((f) => f.id === farmerId)].stage

/* ── General master data ────────────────────────────────────────────────── */

export const branchMasters: BranchMaster[] = BRANCHES.map((b) => ({
  id: b.id,
  code: b.code,
  name: b.name,
  address: `สำนักงาน${b.name}`,
  phone: `05${intBetween(1, 6)}-${intBetween(100000, 999999)}`,
  active: true,
  updatedAt: daysAgo(intBetween(10, 200)),
}))

export const projectMasters: ProjectMaster[] = PROJECTS.map((p, i) => ({
  id: String(p.value),
  code: `PJ${String(i + 1).padStart(2, '0')}`,
  name: p.label,
  active: true,
  updatedAt: daysAgo(intBetween(10, 200)),
}))

export const bankMasters: BankMaster[] = BANKS.map((b) => ({
  id: `BK-${String(b.value)}`,
  code: String(b.value),
  name: b.label,
  active: true,
  updatedAt: daysAgo(intBetween(10, 200)),
}))

export const expenseCategoryMasters: ExpenseCategoryMaster[] = EXPENSE_CATEGORY_SEED.map(
  (c, i) => ({
    id: c.id,
    code: `EC${String(i + 1).padStart(2, '0')}`,
    name: c.name,
    types: c.types.map((t) => ({ id: t.id, categoryId: c.id, name: t.name, active: true })),
    active: true,
    updatedAt: daysAgo(intBetween(10, 200)),
  }),
)

/* ── Product master ─────────────────────────────────────────────────────── */

export const productUnits: ProductUnit[] = [
  { id: 'UN-BOX', code: 'BOX', name: 'กล่อง', active: true },
  { id: 'UN-BAG', code: 'BAG', name: 'ถุง', active: true },
  { id: 'UN-BOTTLE', code: 'BTL', name: 'ขวด', active: true },
  { id: 'UN-SHEET', code: 'SHT', name: 'แผ่น', active: true },
  { id: 'UN-PIECE', code: 'PCS', name: 'อัน', active: true },
  { id: 'UN-KG', code: 'KG', name: 'กิโลกรัม', active: true },
]

export const warehouses: Warehouse[] = BRANCHES.map((b, i) => ({
  id: `WH-${b.code}`,
  code: `WH${String(i + 1).padStart(2, '0')}`,
  name: `คลัง${b.name}`,
  branchId: b.id,
  branchName: b.name,
  active: true,
}))

interface ProductSeed {
  code: string
  name: string
  kind: ProductKind
  unitId: string
  price: number
  breedId?: string
}

/**
 * Seeded catalogue. The EGG rows mirror `SILK_BREEDS`, so a booking line and
 * the สายพันธุ์ on the receiving slip refer to the same thing.
 */
const PRODUCT_SEED: ProductSeed[] = [
  ...SILK_BREEDS.map((b, i) => ({
    code: `EGG-${String(i + 1).padStart(3, '0')}`,
    name: b.label,
    kind: 'EGG' as ProductKind,
    unitId: 'UN-BOX',
    price: 200,
    breedId: String(b.value),
  })),
  { code: 'SUP-001', name: 'ปุยไหม', kind: 'SUPPLY', unitId: 'UN-BAG', price: 40 },
  { code: 'SUP-002', name: 'กระด้งเลี้ยงไหม', kind: 'SUPPLY', unitId: 'UN-PIECE', price: 120 },
  { code: 'SUP-003', name: 'จ่อพลาสติก', kind: 'SUPPLY', unitId: 'UN-PIECE', price: 95 },
  { code: 'SUP-004', name: 'ตาข่ายลอกปุย', kind: 'SUPPLY', unitId: 'UN-SHEET', price: 60 },
  { code: 'CHM-001', name: 'น้ำยาเคมี', kind: 'CHEMICAL', unitId: 'UN-BOTTLE', price: 100 },
  { code: 'CHM-002', name: 'ยาฆ่าเชื้อโรงเลี้ยง', kind: 'CHEMICAL', unitId: 'UN-BOTTLE', price: 85 },
  { code: 'CHM-003', name: 'ปูนขาวโรยพื้น', kind: 'CHEMICAL', unitId: 'UN-KG', price: 25 },
  { code: 'EQP-001', name: 'เครื่องพ่นยา', kind: 'EQUIPMENT', unitId: 'UN-PIECE', price: 1450 },
]

export const products: Product[] = PRODUCT_SEED.map((seed, i) => {
  const unit = productUnits.find((u) => u.id === seed.unitId)!
  const warehouse = warehouses[i % warehouses.length]
  return {
    id: `P-${String(i + 1).padStart(4, '0')}`,
    code: seed.code,
    name: seed.name,
    kind: seed.kind,
    unitId: unit.id,
    unitName: unit.name,
    warehouseId: warehouse.id,
    warehouseName: warehouse.name,
    currentPrice: seed.price,
    breedId: seed.breedId,
    active: true,
    updatedAt: daysAgo(intBetween(1, 60)),
  } satisfies Product
})

/** One current price row per product, plus a superseded one to show history. */
export const productPrices: ProductPrice[] = products.flatMap((p, i) => {
  const current: ProductPrice = {
    id: `PP-${String(i + 1).padStart(4, '0')}-C`,
    productId: p.id,
    productCode: p.code,
    productName: p.name,
    unitName: p.unitName,
    price: p.currentPrice ?? 0,
    effectiveFrom: daysAgo(intBetween(30, 120)),
    current: true,
    updatedAt: daysAgo(intBetween(1, 30)),
  }
  const previous: ProductPrice = {
    ...current,
    id: `PP-${String(i + 1).padStart(4, '0')}-P`,
    price: Math.round((p.currentPrice ?? 0) * 0.92),
    effectiveFrom: daysAgo(intBetween(200, 400)),
    effectiveTo: current.effectiveFrom,
    current: false,
    note: 'ราคาก่อนปรับ',
  }
  return [current, previous]
})

/* ── Bookings (BOOK-001) ────────────────────────────────────────────────── */

const round0 = (n: number) => Math.round(n * 100) / 100

/** Mirrors what the backend does on save: resolve unit + price, then total. */
export function buildBookingItems(
  lines: { productId: string; quantity: number }[],
  idPrefix: string,
): BookingItem[] {
  return lines.flatMap((line, i) => {
    const product = products.find((p) => p.id === line.productId)
    if (!product || product.currentPrice == null) return []
    return [
      {
        id: `${idPrefix}-L${i + 1}`,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        kind: product.kind,
        quantity: line.quantity,
        unitId: product.unitId,
        unitName: product.unitName,
        unitPrice: product.currentPrice,
        amount: round0(line.quantity * product.currentPrice),
      },
    ]
  })
}

/** Derives the header fields the receiving slip needs from the EGG lines. */
export function summariseBookingItems(items: BookingItem[]) {
  const eggs = items.filter((i) => i.kind === 'EGG')
  const firstEgg = eggs[0]
  const product = firstEgg ? products.find((p) => p.id === firstEgg.productId) : undefined
  return {
    totalAmount: round0(items.reduce((sum, i) => sum + i.amount, 0)),
    quantity: round2(eggs.reduce((sum, i) => sum + i.quantity, 0)),
    unit: firstEgg?.unitName ?? 'กล่อง',
    breedId: product?.breedId,
    breedName: firstEgg?.productName,
  }
}

const EGG_PRODUCTS = products.filter((p) => p.kind === 'EGG')
const SUPPLY_PRODUCTS = products.filter((p) => p.kind !== 'EGG')

/** How far along each stage is, in days back from today. */
const STAGE_AGE: Record<FarmerStage, { booked: number; delivered: number }> = {
  COMPLETE: { booked: 52, delivered: 45 },
  BOOKED: { booked: 4, delivered: 0 },
  DELIVERED: { booked: 26, delivered: 20 },
  QUEUE_SORTING: { booked: 34, delivered: 28 },
  QUEUE_WAITING_WEIGH: { booked: 34, delivered: 28 },
}

/** One booking per farmer — the round they are on right now. */
export const bookings: Booking[] = farmers.map((farmer, i) => {
  const stage = FARMER_SEED[i].stage
  const age = STAGE_AGE[stage]
  const id = `B-${String(i + 1).padStart(4, '0')}`

  // One egg line (boxes come in halves on the paper slip) plus a few supplies,
  // each product at most once — the document editor allows one row per product.
  const supplyPool = [...SUPPLY_PRODUCTS]
  const lines = [
    {
      productId: EGG_PRODUCTS[i % EGG_PRODUCTS.length].id,
      quantity: round2(intBetween(1, 4) + (i % 2 === 0 ? 0.5 : 0)),
    },
    ...Array.from({ length: intBetween(2, 3) }, () => {
      const [product] = supplyPool.splice(Math.floor(rng() * supplyPool.length), 1)
      return product ? { productId: product.id, quantity: intBetween(1, 6) } : null
    }).filter((line): line is { productId: string; quantity: number } => line != null),
  ]

  const items = buildBookingItems(lines, id)
  const summary = summariseBookingItems(items)
  const projectId = String(PROJECTS[i % PROJECTS.length].value)

  return {
    id,
    bookingNo: `BK-2569-${String(i + 1).padStart(4, '0')}`,
    bookingDate: daysAgo(age.booked),
    farmerId: farmer.id,
    farmerName: farmer.fullName,
    farmerCode: farmer.code,
    branchId: farmer.branchId,
    branchName: farmer.branchName,
    projectId,
    projectName: PROJECTS.find((p) => String(p.value) === projectId)?.label,
    batchNo: FARMER_SEED[i].batchNo,
    hatchDate: daysAgo(age.booked - 3),
    expectedDeliveryDate: daysAgo(age.delivered),
    items,
    ...summary,
    remark: undefined,
    attachments: [],
    status: stage === 'BOOKED' ? 'CONFIRMED' : 'DELIVERED',
    createdAt: daysAgo(age.booked),
    updatedAt: daysAgo(age.delivered),
  } satisfies Booking
})

/* ── บันทึกส่งของ → ตั้งหนี้ (BOOK-005 / DEBT-001) ───────────────────────── */

/**
 * The chain the whole system rests on:
 *
 *   ใบจอง → เจ้าหน้าที่ส่งเสริมส่งของ → ตั้งหนี้ → เกษตรกรเลี้ยงไหม
 *   → เอารังไหมสดมาขาย → ใบรับซื้อ → หักหนี้ → รับส่วนต่าง
 *
 * A booking is only a request; nothing is owed until the officer hands the eggs
 * and supplies over. So the debt is raised here, from the delivered lines, and
 * every queue below is built from a booking that reached this point — a farmer
 * cannot turn up with cocoons they were never given eggs for.
 */
export const debts: DebtRecord[] = []
export const debtDeductions: DebtDeduction[] = []

const deliveryOfficer =
  users.find((u) => u.permissions.includes('booking:deliver') && u.role === 'FARM_MANAGER') ??
  users[0]

bookings
  .filter((booking) => booking.status === 'DELIVERED')
  .forEach((booking, i) => {
    const debtId = `D-${String(i + 1).padStart(4, '0')}`
    const deliveredAt = booking.expectedDeliveryDate

    const items: DeliveryItem[] = booking.items.map((item) => ({
      bookingItemId: item.id,
      productName: item.productName,
      quantity: item.quantity,
      unitName: item.unitName,
      unitPrice: item.unitPrice,
      amount: item.amount,
    }))
    const totalAmount = sumBy(items, (item) => item.amount)

    booking.delivery = {
      deliveredAt,
      deliveredBy: deliveryOfficer.id,
      deliveredByName: deliveryOfficer.displayName,
      receivedBy: booking.farmerName,
      items,
      totalAmount,
      debtId,
    }

    debts.push({
      id: debtId,
      sourceType: 'BOOKING_DELIVERY',
      sourceId: booking.id,
      sourceNo: booking.bookingNo,
      farmerId: booking.farmerId,
      farmerName: booking.farmerName,
      farmerCode: booking.farmerCode,
      branchId: booking.branchId,
      branchName: booking.branchName,
      batchNo: booking.batchNo,
      hatchDate: booking.hatchDate,
      breedName: booking.breedName,
      items: items.map((item, n) => ({
        id: `${debtId}-L${n + 1}`,
        productName: item.productName,
        quantity: item.quantity,
        unitName: item.unitName,
        unitPrice: item.unitPrice,
        amount: item.amount,
      })),
      originalAmount: totalAmount,
      deductedAmount: 0,
      remainingBalance: totalAmount,
      status: 'OPEN',
      createdAt: deliveredAt,
      updatedAt: deliveredAt,
    })
  })

/* ── Queue / receiving (QUEUE-001) ──────────────────────────────────────── */

export const queueTickets: QueueTicket[] = []

/**
 * Three slips: the finished round, and the two farmers at the buying point
 * today — one still being sorted, one waiting on the scale.
 */
const QUEUE_PLAN: {
  stage: FarmerStage
  status: QueueStatus
  queueNo: number
  waitMinutes: number
}[] = [
  { stage: 'COMPLETE', status: 'COMPLETED', queueNo: 1, waitMinutes: 260 },
  { stage: 'QUEUE_WAITING_WEIGH', status: 'WAITING_WEIGH', queueNo: 2, waitMinutes: 38 },
  { stage: 'QUEUE_SORTING', status: 'SORTING', queueNo: 0, waitMinutes: 12 },
]

QUEUE_PLAN.forEach((plan, i) => {
  const booking = bookings.find((b) => stageOf(b.farmerId) === plan.stage)
  if (!booking) return
  const farmer = farmers.find((f) => f.id === booking.farmerId)!
  const issued = plan.status !== 'SORTING'
  const eggLine = booking.delivery?.items.find((item) =>
    booking.items.some((line) => line.id === item.bookingItemId && line.kind === 'EGG'),
  )

  queueTickets.push({
    id: `Q-${String(i + 1).padStart(4, '0')}`,
    queueNo: issued ? plan.queueNo : null,
    queueDate: daysAgo(0, 6, 0),
    branchId: farmer.branchId,
    branchName: farmer.branchName,
    farmerId: farmer.id,
    farmerCode: farmer.code,
    farmerName: farmer.fullName,
    bookingId: booking.id,
    bookingNo: booking.bookingNo,
    breedId: booking.breedId,
    breedName: booking.breedName,
    projectId: booking.projectId,
    projectName: booking.projectName,
    hatchDate: booking.hatchDate,
    // What the farmer actually took, not what they asked for.
    expectedBoxes: eggLine?.quantity ?? booking.quantity,
    status: plan.status,
    arrivedAt: minutesAgo(plan.waitMinutes),
    issuedAt: issued ? minutesAgo(plan.waitMinutes - 5) : undefined,
    calledAt: plan.status === 'COMPLETED' ? minutesAgo(plan.waitMinutes - 10) : undefined,
    startedWeighingAt:
      plan.status === 'COMPLETED' ? minutesAgo(plan.waitMinutes - 20) : undefined,
    completedAt: plan.status === 'COMPLETED' ? minutesAgo(plan.waitMinutes - 45) : undefined,
  })
})

/* ── Weighing + quality + purchase, keyed by queue id ───────────────────── */

/** ใบชั่งน้ำหนักรังไหมสด (ใบที่ 1) */
export const freshSlips = new Map<string, FreshWeighSlip>()
/** ใบชั่งน้ำหนักเปลือกรัง (ใบที่ 2) */
export const shellSlips = new Map<string, ShellWeighSlip>()
export const qualities = new Map<string, ReceivingQuality>()
export const purchases = new Map<string, PurchaseSummary>()

/**
 * Stand-in for the backend pricing and document-analysis engine.
 *
 * These live on the mock side of the boundary precisely so no page can depend
 * on the formulas (§20). The egg constants and the analysis thresholds are
 * still awaiting confirmation and are mirrored into Settings as pending.
 */
export const RECEIVING_CONSTANTS = {
  /** ราคารับซื้อ บาท/กก. ต่อชั้นคุณภาพ */
  gradePrice: {
    GOOD: 273.75,
    DAMAGED: 140,
    DOUBLE: 140,
    THIN: 25,
    FLOSS: 5,
  } as Record<CocoonGrade, number>,
  /** เงินเพิ่มพิเศษ บาท/กก. จ่ายภายในงวดบัญชี */
  bonusPerKg: 4,
  /** น้ำหนักไข่ไหมต่อกล่อง (กรัม) */
  eggWeightPerBoxG: 1.68,
  /** จำนวนไข่ต่อกรัม — ใช้หาจำนวนตัวที่ควรได้จากไข่ที่รับไป */
  eggsPerGram: 12_000,
  /** เกณฑ์วิเคราะห์เอกสาร */
  minWeightPerCocoonG: 1.7,
  targetShellPercent: 20,
  maxMoisturePercent: 18,
  targetSurvivalPercent: 75,
  maxScrapRatio: 0.15,
}

const GRADE_COLUMN = new Map(COCOON_GRADES.map((g) => [g.grade, g.column] as const))

/**
 * The backend's aggregation of one fresh-weigh slip: per-grade subtotals, the
 * รังไหม/เศษ split, and the average per box. The station only sends bag weights.
 */
export function recalcFreshSlip(slip: FreshWeighSlip, boxes?: number | null): FreshWeighSlip {
  const gradeTotals = COCOON_GRADE_ORDER.flatMap((grade) => {
    const bags = slip.lines.filter((l) => l.grade === grade)
    if (bags.length === 0) return []
    return [{ grade, bags: bags.length, weightKg: sumBy(bags, (b) => b.weightKg) }]
  })
  const columnTotal = (column: 'COCOON' | 'SCRAP') =>
    sumBy(
      gradeTotals.filter((t) => GRADE_COLUMN.get(t.grade) === column),
      (t) => t.weightKg,
    )

  const totalCocoonWeight = columnTotal('COCOON')
  const totalScrapWeight = columnTotal('SCRAP')

  return {
    ...slip,
    lines: slip.lines.map((line, i) => ({ ...line, seq: i + 1 })),
    gradeTotals,
    totalCocoonWeight,
    totalScrapWeight,
    avgWeightPerBox:
      boxes && boxes > 0 ? round2((totalCocoonWeight + totalScrapWeight) / boxes) : null,
  }
}

/** %เปลือกรัง is the only derived figure on the shell slip. */
export function recalcShellSlip(slip: ShellWeighSlip): ShellWeighSlip {
  const { sampleCocoonWeightG: total, shellWeightG: shell } = slip
  return {
    ...slip,
    shellPercent:
      total != null && total > 0 && shell != null ? round2((shell / total) * 100) : null,
  }
}

function buildAnalysis(
  fresh: FreshWeighSlip | undefined,
  shell: ShellWeighSlip | undefined,
  quality: ReceivingQuality | undefined,
  boxes: number | null,
  grossAmount: number,
): PurchaseAnalysis {
  const c = RECEIVING_CONSTANTS
  const totalCocoon = fresh?.totalCocoonWeight ?? 0
  const totalScrap = fresh?.totalScrapWeight ?? 0
  const totalWeight = round2(totalCocoon + totalScrap)

  const sampleCount = shell?.sampleCocoonCount ?? null
  const sampleWeight = shell?.sampleCocoonWeightG ?? null
  const weightPerCocoonG =
    sampleCount && sampleCount > 0 && sampleWeight != null
      ? round2(sampleWeight / sampleCount)
      : null

  /**
   * %เลี้ยงรอด compares the cocoons actually produced with the cocoons the eggs
   * taken at booking should have produced — hence the egg constants above.
   */
  const expectedCocoons = boxes && boxes > 0 ? boxes * c.eggWeightPerBoxG * c.eggsPerGram : null
  const actualCocoons =
    weightPerCocoonG && weightPerCocoonG > 0 ? (totalCocoon * 1000) / weightPerCocoonG : null
  const survivalPercent =
    expectedCocoons && expectedCocoons > 0 && actualCocoons != null
      ? round2((actualCocoons / expectedCocoons) * 100)
      : null

  const moisturePercent = shell?.moisturePercent ?? quality?.moisturePercent ?? null
  const shellPercent = shell?.shellPercent ?? null

  const findings: string[] = []
  const recommendations: string[] = []
  const flag = (finding: string, recommendation: string) => {
    findings.push(finding)
    recommendations.push(recommendation)
  }

  if (weightPerCocoonG != null && weightPerCocoonG < c.minWeightPerCocoonG) {
    findings.push(`น้ำหนัก/รัง ต่ำกว่า ${c.minWeightPerCocoonG} กรัม`)
    recommendations.push(
      'ขยายพื้นที่และกระจายตัวไหมให้สม่ำเสมอ โดยไหม 1 กล่อง ต้องขยายพื้นที่ให้ได้ 60-80 ตรม.',
      'การเลือกใบหม่อนให้เหมาะสมกับวัยนอนไหม',
      'การปรับสภาพระหว่างเลี้ยง เพื่อให้หนอนไหมกินใบหม่อนที่สดได้อย่างเต็มที่',
    )
  }
  if (shellPercent != null && shellPercent < c.targetShellPercent) {
    flag(
      `%เปลือกรัง ${shellPercent}% ต่ำกว่าเกณฑ์ ${c.targetShellPercent}%`,
      'ปรับคุณภาพใบหม่อนและควบคุมอุณหภูมิช่วงวัย 5 ให้คงที่',
    )
  }
  if (moisturePercent != null && moisturePercent > c.maxMoisturePercent) {
    flag(
      `ความชื้น ${moisturePercent}% สูงกว่าเกณฑ์ ${c.maxMoisturePercent}%`,
      'ผึ่งรังในที่ร่มลมโกรกก่อนนำส่ง และหลีกเลี่ยงการเก็บรังขณะฝนตก',
    )
  }
  if (survivalPercent != null && survivalPercent < c.targetSurvivalPercent) {
    flag(
      `%เลี้ยงรอด ${survivalPercent}% ต่ำกว่าเป้า ${c.targetSurvivalPercent}%`,
      'ตรวจโรคแม่ผีเสื้อ และฆ่าเชื้อโรงเลี้ยง/จ่อ ก่อนเริ่มรุ่นถัดไป',
    )
  }
  if (totalWeight > 0 && totalScrap / totalWeight > c.maxScrapRatio) {
    flag(
      `สัดส่วนรังบาง/ปุยไหม ${round2((totalScrap / totalWeight) * 100)}% สูงกว่าปกติ`,
      'เก็บรังให้ตรงอายุและคัดแยกที่จ่อก่อนบรรจุถุง',
    )
  }
  if (quality?.deadSilkworm) {
    flag('พบไหมตายในรุ่นนี้', 'แยกรังที่มีไหมตายออก และแจ้งนักส่งเสริมตรวจโรงเลี้ยง')
  }
  if (quality?.notDegummed) {
    flag('รังไม่ลอกปุย', 'ลอกปุยก่อนนำส่งเพื่อให้ได้ราคาชั้นรังดี')
  }
  if (findings.length === 0) {
    findings.push('ตรวจสอบเอกสารครบถ้วน ไม่พบข้อผิดปกติ')
    recommendations.push('รักษามาตรฐานการเลี้ยงเดิมในรุ่นถัดไป')
  }

  return {
    sampleCocoonCount: sampleCount,
    sampleCocoonWeightG: sampleWeight,
    shellWeightG: shell?.shellWeightG ?? null,
    shellPercent,
    moisturePercent,
    survivalPercent,
    weightPerCocoonG,
    weightPerBoxKg: boxes && boxes > 0 ? round2(totalWeight / boxes) : null,
    incomePerBox: boxes && boxes > 0 ? round2(grossAmount / boxes) : null,
    findings,
    recommendations,
  }
}

/**
 * ใบรับซื้อรังไหมสด. Every figure on the document is produced here — the four
 * receiving screens only format what this returns (§7.8, §20).
 */
export function buildPurchase(ticket: QueueTicket): PurchaseSummary {
  const fresh = freshSlips.get(ticket.id)
  const shell = shellSlips.get(ticket.id)
  const quality = qualities.get(ticket.id)
  const farmer = farmers.find((f) => f.id === ticket.farmerId)
  const booking = ticket.bookingId ? bookings.find((b) => b.id === ticket.bookingId) : undefined
  const boxes = ticket.expectedBoxes ?? booking?.quantity ?? null

  const weightOf = (grade: CocoonGrade) =>
    fresh?.gradeTotals.find((t) => t.grade === grade)?.weightKg ?? 0

  const lines: PurchaseLine[] = COCOON_GRADES.map(({ grade, receiptLabel, breedSuffix, column }) => {
    const weight = weightOf(grade)
    const unitPrice = RECEIVING_CONSTANTS.gradePrice[grade]
    return {
      key: grade,
      label:
        breedSuffix && ticket.breedName ? `${receiptLabel}(${ticket.breedName})` : receiptLabel,
      grade,
      cocoonWeight: column === 'COCOON' ? weight : null,
      scrapWeight: column === 'SCRAP' ? weight : null,
      unitPrice,
      amount: round2(weight * unitPrice),
    }
  })

  const grossAmount = sumBy(lines, (l) => l.amount ?? 0)
  const id = `PU-${ticket.id}`
  const transactionNo = `TR-2569-${ticket.id.replace(/\D/g, '').padStart(5, '0')}`

  // Debt matching is round-scoped: only debts raised by a booking of the same
  // รอบ may be paid down by this document (§7.9).
  const batchNo = booking?.batchNo
  const scopedDebts = debts.filter(
    (d) =>
      d.farmerId === ticket.farmerId &&
      d.remainingBalance > 0 &&
      d.status !== 'HOLD' &&
      (batchNo == null || d.batchNo === batchNo),
  )
  const outstandingDebt = sumBy(scopedDebts, (d) => d.remainingBalance)
  const applied = sumBy(
    debtDeductions.filter((x) => x.purchaseId === id),
    (x) => x.amount,
  )
  // The ceiling is the invoice's own รวมรายได้, less what it has already paid.
  const eligibleDeduction = Math.max(0, Math.min(outstandingDebt, round2(grossAmount - applied)))

  return {
    id,
    queueId: ticket.id,
    transactionNo,
    documentCode: transactionNo,
    purchaseDate: ticket.completedAt ?? ticket.queueDate,
    farmerId: ticket.farmerId,
    farmerName: ticket.farmerName,
    farmerCode: ticket.farmerCode,
    farmerAddress: farmer
      ? [farmer.address, farmer.subDistrict, farmer.district, farmer.province]
          .filter(Boolean)
          .join(' ')
      : undefined,
    branchId: ticket.branchId,
    branchName: ticket.branchName,
    breedName: ticket.breedName,
    batchNo,
    hatchDate: ticket.hatchDate,
    boxes,
    lines,
    totalCocoonWeight: fresh?.totalCocoonWeight ?? 0,
    totalScrapWeight: fresh?.totalScrapWeight ?? 0,
    grossAmount,
    bonusPerKg: RECEIVING_CONSTANTS.bonusPerKg,
    analysis: buildAnalysis(fresh, shell, quality, boxes, grossAmount),
    deductionAmount: applied,
    netPayable: round2(grossAmount - applied),
    debtPreview: outstandingDebt > 0 ? { outstandingDebt, eligibleDeduction } : undefined,
    documents: [
      { label: 'ใบคิว / จุดคัดแยก', ref: `QS-${ticket.id}` },
      { label: 'ใบชั่งน้ำหนักรังไหมสด', ref: fresh?.slipNo ?? `WS-${ticket.id}-1` },
      { label: 'ใบชั่งน้ำหนักเปลือกรัง', ref: shell?.slipNo ?? `WS-${ticket.id}-2` },
    ],
    status: ticket.status === 'COMPLETED' ? 'COMPLETED' : 'PENDING',
    completedAt: ticket.completedAt,
    // The invoice is recomputed on every read and has nowhere of its own to
    // remember this, so it is kept on the ticket and carried through here.
    exportedAt: ticket.exportedAt,
    exportBatchNo: ticket.exportBatchNo,
  }
}

for (const ticket of queueTickets) {
  const farmer = farmers.find((f) => f.id === ticket.farmerId)

  /**
   * Sorting happens first, so quality exists as soon as a slip is issued —
   * and is already confirmed, because issuing the slip locks it.
   */
  const issued = ticket.queueNo != null && ticket.status !== 'CANCELLED'
  if (issued) {
    qualities.set(ticket.id, {
      queueId: ticket.id,
      goodCocoonQty: intBetween(2, 22),
      afterScreenQty: intBetween(0, 6),
      damagedCocoonQty: intBetween(0, 4),
      doubleCocoonQty: intBetween(0, 3),
      thinCocoonQty: intBetween(0, 5),
      flossQty: intBetween(0, 4),
      dryingLevel: rng() < 0.65 ? 'OLD' : 'MEDIUM',
      deadSilkworm: rng() < 0.12,
      notDegummed: rng() < 0.1,
      guaranteedGoodPrice: farmer?.programs.guaranteedGoodPrice ?? false,
      debtRelief: farmer?.programs.debtRelief ?? false,
      julUamJai: farmer?.programs.julUamJai ?? false,
      moisturePercent: round2(between(11, 24)),
      savedAt: ticket.issuedAt,
      confirmed: true,
    })
  }

  // Nothing is weighed in ChunERP — see the Floor Weight seed below.
}

/* ── Floor Weight Cocoon — the external scale system's data ─────────────── */

/**
 * Rows as they exist in the *other* system's database, generated here only so
 * the SQLite stand-in has something realistic to serve. ChunERP never writes
 * these; it pulls them by รหัสเกษตรกร + วันที่ชั่ง.
 *
 * There is a closed session waiting for **every farmer who has taken eggs** —
 * the floor scale weighs the load as it arrives, and ChunERP syncs it in
 * afterwards. The finished round's session was pulled long ago; the seven
 * rounds still out there have theirs sitting ready.
 */
export const floorWeightSeed: FloorWeightSession[] = []

const FLOOR_GRADE_CODE: Record<CocoonGrade, { code: string; name: string }> = {
  GOOD: { code: '01', name: 'รังดี' },
  DAMAGED: { code: '02', name: 'รังเสีย' },
  DOUBLE: { code: '03', name: 'รังแฝด' },
  THIN: { code: '04', name: 'รังบาง' },
  FLOSS: { code: '05', name: 'ปุยไหม' },
}

let floorSessionId = 100_000
let floorDetailId = 0

for (const booking of bookings) {
  if (!booking.delivery) continue

  const farmer = farmers.find((f) => f.id === booking.farmerId)!
  const stage = stageOf(farmer.id)
  const ticket = queueTickets.find((t) => t.bookingId === booking.id)

  floorSessionId += 1

  // Bag count follows the eggs the farmer took, so the analysis block's
  // น้ำหนัก/กล่อง and %เลี้ยงรอด land in a band a rearer would recognise.
  const boxes = ticket?.expectedBoxes ?? booking.quantity
  const bagPlan: { grade: CocoonGrade; bags: number; min: number; max: number }[] = [
    { grade: 'GOOD', bags: Math.max(3, Math.round(boxes * between(7, 9.5))), min: 1.8, max: 3.4 },
    { grade: 'DAMAGED', bags: intBetween(0, 2), min: 0.6, max: 2.1 },
    { grade: 'DOUBLE', bags: intBetween(0, 2), min: 0.5, max: 1.8 },
    { grade: 'THIN', bags: intBetween(0, 2), min: 0.4, max: 1.6 },
    { grade: 'FLOSS', bags: intBetween(0, 2), min: 0.3, max: 1.2 },
  ]

  // The finished round was weighed the day it was sold; everyone else's load
  // went across the floor scale this morning and is waiting to be synced.
  const startedAt =
    stage === 'COMPLETE' ? (ticket?.startedWeighingAt ?? minutesAgo(240)) : minutesAgo(90)

  const bags = bagPlan
    .flatMap(({ grade, bags: count, min, max }) =>
      Array.from({ length: count }, () => ({ grade, weightKg: round2(between(min, max)) })),
    )
    .map((bag, i) => {
      floorDetailId += 1
      const code = FLOOR_GRADE_CODE[bag.grade]
      return {
        detailId: floorDetailId,
        bagNo: i + 1,
        gradeCode: code.code,
        gradeName: code.name,
        erpGrade: bag.grade,
        weightGroup: (bag.grade === 'THIN' || bag.grade === 'FLOSS' ? 'SCRAP' : 'COCOON') as
          | 'COCOON'
          | 'SCRAP',
        weightKg: bag.weightKg,
        readSource: (rng() < 0.9 ? 'SCALE' : 'MANUAL') as 'SCALE' | 'MANUAL',
        weighedAt: startedAt,
      }
    })

  const sampleCount = intBetween(20, 30)
  const sampleWeight = round2(sampleCount * between(1.35, 2.05))

  floorWeightSeed.push({
    sessionId: floorSessionId,
    sessionNo: `FW-2569-${String(floorSessionId - 100_000).padStart(6, '0')}`,
    farmerCode: farmer.code,
    farmerName: farmer.fullName,
    branchCode: farmer.branchId,
    stationCode: 'ST-01',
    scaleNo: `SCALE-${['A', 'B', 'C'][floorSessionId % 3]}`,
    weighDate: localDate(startedAt),
    startedAt,
    finishedAt: startedAt,
    operatorName: 'อรุณี ดวงแก้ว',
    status: 'CLOSED',
    totalBags: bags.length,
    totalWeightKg: sumBy(bags, (bag) => bag.weightKg),
    bags,
    shellSample: {
      cocoonCount: sampleCount,
      cocoonWeightG: sampleWeight,
      shellWeightG: round2(sampleWeight * between(0.18, 0.24)),
      moisturePercent: round2(between(11, 17)),
      sampledAt: startedAt,
    },
  })
}

/** The farmer card shows what all of that farmer's rounds still owe. */
export function refreshFarmerDebt(farmerId: string) {
  const farmer = farmers.find((f) => f.id === farmerId)
  if (!farmer) return
  farmer.outstandingDebt = sumBy(
    debts.filter((d) => d.farmerId === farmerId),
    (d) => d.remainingBalance,
  )
}

for (const ticket of queueTickets) {
  if (!qualities.has(ticket.id)) continue
  purchases.set(ticket.id, buildPurchase(ticket))
}

/* ── Farmer totals ──────────────────────────────────────────────────────── */

/**
 * The weigh slips live in SQLite, so the invoice — and therefore the debt that
 * invoice settles — can only be worked out once the database has been
 * hydrated. `bootstrap.ts` finishes the job; here we only prime what does not
 * depend on it.
 */
for (const farmer of farmers) refreshFarmerDebt(farmer.id)

/* ── Expenses (EXP-001) ─────────────────────────────────────────────────── */

const EXPENSE_STATUSES: ExpenseStatus[] = [
  'DRAFT', 'SUBMITTED', 'SUBMITTED', 'APPROVED', 'APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED',
]

const VENDORS = [
  'การประปาส่วนภูมิภาค', 'การไฟฟ้าส่วนภูมิภาค', 'ห้างหุ้นส่วน น้ำแข็งเพชรบูรณ์',
  'ปั๊มน้ำมัน ปตท. สาขากำแพงเพชร', 'ร้านวัสดุก่อสร้างพรชัย', 'ขนส่งไทยเจริญ',
  'ร้านอาหารครัวบ้านไร่', 'บจก. อุปกรณ์การเกษตรไทย',
]

export const expenses: Expense[] = Array.from({ length: 84 }, (_, i) => {
  const category = pick(EXPENSE_CATEGORY_SEED)
  const type = category.types.length > 0 ? pick(category.types) : undefined
  const branch = pick(BRANCHES)
  const user = pick(users.filter((u) => u.role === 'ACCOUNTING' || u.role === 'ADMIN'))
  const approver = pick(users.filter((u) => u.permissions.includes('expense:approve')))
  const quantity = round2(between(1, 40))
  const unitPrice = Math.round(between(35, 2_400) * 100) / 100
  const paymentMethod: PaymentMethod = rng() < 0.55 ? 'BANK_TRANSFER' : 'CASH'
  const createdDaysAgo = intBetween(0, 120)
  const status = pick(EXPENSE_STATUSES)

  return {
    id: `E-${String(i + 1).padStart(4, '0')}`,
    expenseNo: `EX-2569-${String(i + 1).padStart(4, '0')}`,
    expenseDate: daysAgo(createdDaysAgo),
    branchId: branch.id,
    branchName: branch.name,
    categoryId: category.id,
    categoryName: category.name,
    expenseTypeId: type?.id,
    expenseTypeName: type?.name,
    description: `${category.name}ประจำงวด ${intBetween(1, 12)}/2569 — ${branch.name}`,
    vendor: pick(VENDORS),
    referenceNo: rng() < 0.6 ? `INV-${intBetween(100_000, 999_999)}` : undefined,
    quantity,
    unit: pick(['หน่วย', 'ลิตร', 'ก้อน', 'ครั้ง', 'ชิ้น']),
    unitPrice,
    amount: Math.round(quantity * unitPrice * 100) / 100,
    paymentMethod,
    paidDate: paymentMethod === 'CASH' ? daysAgo(createdDaysAgo) : undefined,
    bankName: paymentMethod === 'BANK_TRANSFER' ? pick(['BAAC', 'KTB', 'SCB', 'KBANK']) : undefined,
    accountNo:
      paymentMethod === 'BANK_TRANSFER'
        ? `${intBetween(100, 999)}-${intBetween(1, 9)}-${intBetween(10_000, 99_999)}-${intBetween(0, 9)}`
        : undefined,
    transferDate: paymentMethod === 'BANK_TRANSFER' ? daysAgo(createdDaysAgo) : undefined,
    transferRef: paymentMethod === 'BANK_TRANSFER' ? `TRF${intBetween(1_000_000, 9_999_999)}` : undefined,
    attachments: [],
    remark: rng() < 0.3 ? 'แนบใบเสร็จตัวจริงส่งบัญชีกลางแล้ว' : undefined,
    status,
    createdBy: user.id,
    createdByName: user.displayName,
    // A decided item always carries who decided it — an approval with no name
    // on it is the thing an auditor asks about first.
    ...(status === 'APPROVED' || status === 'REJECTED'
      ? {
          approvedBy: approver.id,
          approvedByName: approver.displayName,
          approvedAt: daysAgo(Math.max(0, createdDaysAgo - intBetween(0, 3))),
          rejectedReason:
            status === 'REJECTED' ? 'เอกสารแนบไม่ครบ กรุณาแนบใบเสร็จตัวจริง' : undefined,
        }
      : {}),
    createdAt: daysAgo(createdDaysAgo),
    updatedAt: daysAgo(Math.max(0, createdDaysAgo - intBetween(0, 5))),
  } satisfies Expense
})

/* ── Audit (SYS-001) ────────────────────────────────────────────────────── */

const AUDIT_ACTIONS = [
  { action: 'LOGIN', entity: 'Session' },
  { action: 'CREATE', entity: 'Expense' },
  { action: 'UPDATE', entity: 'Expense' },
  { action: 'CONFIRM_DEDUCTION', entity: 'Debt' },
  { action: 'LOCK_WEIGHING', entity: 'Weighing' },
  { action: 'CONFIRM_QUALITY', entity: 'Quality' },
  { action: 'COMPLETE_PURCHASE', entity: 'Purchase' },
  { action: 'CREATE', entity: 'Booking' },
  { action: 'CANCEL', entity: 'Queue' },
  { action: 'UPDATE_PERMISSION', entity: 'User' },
]

export const auditEntries: AuditEntry[] = Array.from({ length: 140 }, (_, i) => {
  const actor = pick(users)
  const template = pick(AUDIT_ACTIONS)
  const hasDiff = ['UPDATE', 'CONFIRM_DEDUCTION', 'UPDATE_PERMISSION'].includes(template.action)
  return {
    id: `A-${String(i + 1).padStart(5, '0')}`,
    at: daysAgo(intBetween(0, 30), intBetween(8, 18), intBetween(0, 59)),
    actorId: actor.id,
    actorName: actor.displayName,
    action: template.action,
    entity: template.entity,
    entityId: `${template.entity.slice(0, 2).toUpperCase()}-${intBetween(1000, 9999)}`,
    reference: rng() < 0.5 ? `TR-2569-${intBetween(10_000, 99_999)}` : undefined,
    before: hasDiff ? { amount: Math.round(between(500, 20_000)) } : undefined,
    after: hasDiff ? { amount: Math.round(between(500, 20_000)) } : undefined,
  } satisfies AuditEntry
}).sort((a, b) => b.at.localeCompare(a.at))

/* ── Mutable counters used by create endpoints ──────────────────────────── */

/**
 * ค่าตั้งระบบ — โหลดจากตาราง app_setting ตอนเปิดฐานข้อมูล
 * ค่าตั้งต้นอยู่ที่ settings.ts และถูก seed ลงตารางครั้งแรกครั้งเดียว
 */
export const settings: SystemSetting[] = []

/**
 * ใบสำคัญจ่าย — one per finished purchase.
 *
 * A payment is not a second version of the invoice: it exists to answer a
 * different question. The invoice says what the cocoons were worth; this says
 * what the farmer actually walked out with, by which method, and who handed it
 * over. Keeping the three figures on the row means a farmer asking
 * "ทำไมได้เท่านี้" is answered without reopening the debt ledger.
 */
export const payments: FarmerPayment[] = []

/** ชุดไฟล์ที่ส่งไประบบบัญชีแล้ว — เก็บไว้กระทบยอดกับฝ่ายบัญชี */
export const exportBatches: ExportBatch[] = []

/**
 * Builds — or refreshes — the pay-out belonging to one finished purchase.
 *
 * The amounts are always taken from the invoice, never from the stored row, so
 * a deduction confirmed after the row was created moves the pay-out with it.
 * Once the money has actually been handed over the row is frozen: what was
 * paid is a fact, and a later correction elsewhere must not rewrite it.
 */
export function upsertPayment(
  purchase: PurchaseSummary,
  ticket: QueueTicket,
  at: string,
): FarmerPayment {
  const existing = payments.find((p) => p.purchaseId === purchase.id)
  if (existing && existing.status !== 'PENDING') return existing

  const gross = round2(purchase.grossAmount)
  const deducted = round2(purchase.deductionAmount)
  const draft: FarmerPayment = {
    id: existing?.id ?? `PM-${ticket.id}`,
    paymentNo: existing?.paymentNo ?? nextPaymentNo(),
    purchaseId: purchase.id,
    transactionNo: purchase.transactionNo,
    farmerId: purchase.farmerId,
    farmerCode: purchase.farmerCode,
    farmerName: purchase.farmerName,
    branchId: ticket.branchId,
    branchName: ticket.branchName,
    batchNo: purchase.batchNo,
    grossAmount: gross,
    deductedAmount: deducted,
    netAmount: round2(gross - deducted),
    status: 'PENDING',
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  }

  if (existing) Object.assign(existing, draft)
  else payments.unshift(draft)
  return existing ?? draft
}

function nextPaymentNo(): string {
  counters.payment += 1
  return `PV-2569-${String(counters.payment).padStart(4, '0')}`
}

export const counters = {
  booking: bookings.length,
  queue: Math.max(0, ...queueTickets.map((t) => t.queueNo ?? 0)),
  /** Internal id sequence for slips that have no queue number yet. */
  slip: 0,
  expense: expenses.length,
  farmer: farmers.length,
  product: products.length,
  price: productPrices.length,
  /** ใบสำคัญจ่าย */
  payment: 0,
  /** ชุดไฟล์ที่ส่งไประบบบัญชี */
  exportBatch: 0,
}
