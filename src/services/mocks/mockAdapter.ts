import { ApiError, type AuditEntry, type ListParams, type Option, type Paginated } from '@/types/common'
import type { Permission, Session, User } from '@/types/auth'
import type {
  AlertItem,
  DashboardPanel,
  DashboardParams,
  DashboardSnapshot,
  KpiValue,
  RecentDocItem,
  ScheduleItem,
  TaskItem,
  WorkTypeId,
} from '@/types/dashboard'
import type { Product, ProductPrice, ProductUnit, Warehouse } from '@/types/product'
import type { FloorWeightQuery } from '@/types/integration'
import type { ExpenseCategoryMaster } from '@/types/master'
import type {
  Booking,
  BookingItem,
  DebtDeduction,
  DebtRecord,
  ExportBatch,
  ExportKind,
  ExportResult,
  DeductionSource,
  DeliveryItem,
  Expense,
  Farmer,
  PaymentStatus,
  FreshWeighSlip,
  PurchaseSummary,
  QueueTicket,
  ReceivingQuality,
  ShellWeighSlip,
} from '@/types/domain'
import type {
  BookingItemPayload,
  BookingPayload,
  FarmerRound,
  DeductionPayload,
  DeliveryPayload,
  ExpensePayload,
  FarmerHistoryItem,
  FarmerPayload,
  PaymentPayload,
  PendingExportRow,
  QualityPayload,
  QueuePayload,
  ReportId,
  ReportResult,
  Services,
  ShellWeighPayload,
  SystemUser,
  WeighBagPayload,
} from '@/services/api/contracts'
import {
  BOOKING_STATUS,
  BRANCHES,
  DEBT_STATUS,
  EXPENSE_STATUS,
  PROJECTS,
  SILK_BREEDS,
} from '@/constants'
import { formatDateTH, formatNumber, toDateInput } from '@/utils/format'
import { getAuthToken } from '@/services/api/client'
import {
  ensureSqlite,
  sessionToFreshSlip,
  sessionToShellSlip,
} from '@/services/sqlite/bootstrap'
import {
  clearImportForQueue,
  findImportBySession,
  recordImport,
  saveDebt,
  saveDeduction,
  saveExportBatch,
  savePayment,
  saveFreshSlip,
  saveQuality,
  saveQueueTicket,
  saveShellSlip,
} from '@/services/sqlite/chunErpStore'
import * as repo from '@/services/sqlite/repositories'
import { settings } from '@/services/mocks/db'
import {
  closedSessionCount,
  findSessions,
  getSession,
  latestWeighDate,
} from '@/services/sqlite/floorWeightStore'
import {
  auditEntries,
  bankMasters,
  bookings,
  debtDeductions,
  freshSlips,
  recalcFreshSlip,
  recalcShellSlip,
  refreshFarmerDebt,
  shellSlips,
  branchMasters,
  expenseCategoryMasters,
  projectMasters,
  buildBookingItems,
  products,
  productPrices,
  productUnits,
  summariseBookingItems,
  warehouses,
  buildPurchase,
  counters,
  DEMO_PASSWORD,
  debts,
  expenses,
  exportBatches,
  farmers,
  mockNow,
  payments,
  purchases,
  qualities,
  queueTickets,
  upsertPayment,
  users,
} from './db'
import {
  debtRows,
  deductionRows,
  fileNameFor,
  paymentRows,
  purchaseRows,
  toCsv,
  type ExportRow,
} from '@/services/accounting/bplus'

/**
 * API-002 — mock adapter.
 *
 * Implements the exact `Services` contract used by the HTTP adapter, including
 * latency, permission errors and validation failures, so every UI state can be
 * exercised before the backend exists.
 */

const LATENCY_MS = Number(import.meta.env.VITE_MOCK_LATENCY ?? 320)

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function paginate<T>(items: T[], params: ListParams): Paginated<T> {
  const page = Math.max(1, params.page ?? 1)
  const pageSize = params.pageSize ?? 20
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  return {
    items: items.slice((safePage - 1) * pageSize, safePage * pageSize),
    page: safePage,
    pageSize,
    total,
    totalPages,
  }
}

function matches(haystack: (string | undefined)[], needle?: string): boolean {
  if (!needle) return true
  const q = needle.trim().toLowerCase()
  if (!q) return true
  return haystack.some((h) => h?.toLowerCase().includes(q))
}

/**
 * Date filters arrive from `<input type="date">`, which means a **local**
 * calendar day, while records store UTC instants.
 *
 * Comparing the raw ISO string against them drops everything recorded before
 * 07:00 in UTC+7 — which is exactly the start of a receiving day: a slip
 * written at 06:30 is "yesterday" in UTC and vanishes off the board. So both
 * sides are reduced to a local calendar date before comparing.
 */
function withinRange(iso: string, from?: string, to?: string): boolean {
  if (!from && !to) return true
  const day = toDateInput(iso)
  if (from && day < from) return false
  if (to && day > to) return false
  return true
}

function sortBy<T>(items: T[], key: string | undefined, dir: 'asc' | 'desc' = 'asc'): T[] {
  if (!key) return items
  const factor = dir === 'asc' ? 1 : -1
  return [...items].sort((a, b) => {
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor
    return String(av).localeCompare(String(bv), 'th') * factor
  })
}

function minutesSince(iso: string): number {
  return Math.max(0, (mockNow().getTime() - new Date(iso).getTime()) / 60_000)
}

function isToday(iso: string): boolean {
  const d = new Date(iso)
  const n = mockNow()
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}

/* ── Session state held by the mock only ────────────────────────────────── */

let currentUser: User | null = null

/**
 * Who is calling.
 *
 * A reload wipes this module's memory but not the session, so falling back to
 * the bearer token is what keeps a refreshed page authenticated — the same
 * thing a real backend does. Without it every audit row after a refresh would
 * be signed "ระบบ", and permission checks would reject a legitimate user.
 */
function actor(): User | null {
  if (currentUser) return currentUser
  const token = getAuthToken()
  const id = token?.startsWith('mock-token-') ? token.slice('mock-token-'.length) : null
  currentUser = id ? (users.find((u) => u.id === id) ?? null) : null
  return currentUser
}

/* ── Dashboard snapshot builders — one per work type ────────────────────── */

function todaysQueue(branchId: string): QueueTicket[] {
  return queueTickets.filter(
    (t) => isToday(t.arrivedAt) && (branchId === 'ALL' || t.branchId === branchId),
  )
}

function inRangeQueue(params: DashboardParams): QueueTicket[] {
  return queueTickets.filter(
    (t) =>
      withinRange(t.arrivedAt, params.dateFrom, params.dateTo) &&
      (params.branchId === 'ALL' || t.branchId === params.branchId),
  )
}

function purchaseAmountFor(tickets: QueueTicket[]): number {
  return tickets.reduce((sum, t) => sum + (purchases.get(t.id)?.grossAmount ?? 0), 0)
}

/** รวมน้ำหนัก = รังไหม + เศษ, straight off the fresh-weigh slip. */
function slipWeight(queueId: string): number {
  const slip = freshSlips.get(queueId)
  if (!slip) return 0
  return Math.round((slip.totalCocoonWeight + slip.totalScrapWeight) * 100) / 100
}

function netWeightFor(tickets: QueueTicket[]): number {
  return Math.round(tickets.reduce((sum, t) => sum + slipWeight(t.id), 0) * 100) / 100
}

function queuePanel(branchId: string): DashboardPanel {
  const live = todaysQueue(branchId)
    .filter((t) => t.queueNo != null && !['COMPLETED', 'CANCELLED'].includes(t.status))
    .sort((a, b) => (a.queueNo ?? 0) - (b.queueNo ?? 0))
    .slice(0, 8)
  return {
    id: 'queue-board',
    type: 'QUEUE_BOARD',
    title: 'คิววันนี้',
    span: 'half',
    href: '/receiving/weighing',
    items: live.map((t) => ({
      id: t.id,
      queueNo: t.queueNo ?? 0,
      farmerName: t.farmerName,
      farmerCode: t.farmerCode,
      status: t.status,
      waitingMinutes: Math.round(minutesSince(t.arrivedAt)),
      counter: t.counter,
    })),
  }
}

function schedulePanel(branchId: string): DashboardPanel {
  const upcoming = bookings
    .filter(
      (b) =>
        ['CONFIRMED', 'PREPARING'].includes(b.status) &&
        (branchId === 'ALL' || b.branchId === branchId),
    )
    .sort((a, b) => a.expectedDeliveryDate.localeCompare(b.expectedDeliveryDate))
    .slice(0, 6)

  const items: ScheduleItem[] = upcoming.map((b) => ({
    id: b.id,
    time: formatDateTH(b.expectedDeliveryDate),
    title: `ส่งมอบไข่ไหม ${b.bookingNo}`,
    subtitle: `${b.farmerName} · ${b.quantity} กล่อง · ${b.branchName}`,
    kind: 'DELIVERY',
    href: `/bookings/${b.id}`,
  }))

  return {
    id: 'schedule',
    type: 'SCHEDULE',
    title: 'ตารางส่งมอบ / นัดหมาย',
    span: 'half',
    href: '/bookings',
    items,
  }
}

function buildOverview(params: DashboardParams): DashboardSnapshot {
  const tickets = inRangeQueue(params)
  const completed = tickets.filter((t) => t.status === 'COMPLETED')
  const scopedExpenses = expenses.filter(
    (e) =>
      withinRange(e.expenseDate, params.dateFrom, params.dateTo) &&
      (params.branchId === 'ALL' || e.branchId === params.branchId),
  )
  const pendingExpenses = scopedExpenses.filter((e) => e.status === 'SUBMITTED')
  const openDebts = debts.filter(
    (d) => d.status !== 'SETTLED' && (params.branchId === 'ALL' || d.branchId === params.branchId),
  )
  // Slips issued or on the scale but not yet closed into a purchase.
  const unbilled = tickets.filter((t) => ['WAITING_WEIGH', 'CALLED', 'WEIGHING'].includes(t.status))

  const kpis: KpiValue[] = [
    {
      id: 'documents',
      label: 'เอกสารทั้งหมด',
      value: completed.length + scopedExpenses.length + bookings.length,
      format: 'number',
      unit: 'ฉบับ',
      delta: { value: 8, direction: 'up', label: 'จากช่วงก่อน' },
      href: '/reports',
    },
    {
      id: 'pending',
      label: 'รอดำเนินการ',
      value: pendingExpenses.length + unbilled.length,
      format: 'number',
      unit: 'รายการ',
      tone: 'warning',
      hint: 'ค่าใช้จ่ายรออนุมัติ + คิวที่ยังไม่ปิด',
      href: '/expenses?status=SUBMITTED',
    },
    {
      id: 'purchase-amount',
      label: 'ยอดรับซื้อ',
      value: purchaseAmountFor(completed),
      format: 'currency',
      delta: { value: 12, direction: 'up', label: 'จากช่วงก่อน' },
      href: '/reports',
    },
    {
      id: 'expense-amount',
      label: 'ค่าใช้จ่าย',
      value: scopedExpenses.reduce((s, e) => s + e.amount, 0),
      format: 'currency',
      tone: 'info',
      delta: { value: 4, direction: 'down', label: 'จากช่วงก่อน' },
      href: '/expenses',
    },
    {
      id: 'today-queue',
      label: 'คิววันนี้',
      value: todaysQueue(params.branchId).length,
      format: 'number',
      unit: 'คิว',
      href: '/receiving/weighing',
    },
    {
      id: 'outstanding-debt',
      label: 'หนี้คงค้าง',
      value: openDebts.reduce((s, d) => s + d.remainingBalance, 0),
      format: 'currency',
      tone: 'danger',
      hint: `${openDebts.length} ราย`,
      href: '/debts',
    },
  ]

  const alerts: AlertItem[] = [
    ...(unbilled.length > 0
      ? [
          {
            id: 'unbilled',
            severity: 'warning' as const,
            title: `มี ${unbilled.length} คิวที่ยังไม่ออกบิล`,
            detail: 'ออกใบคิวแล้วแต่ยังไม่ปิดรายการรับซื้อ',
            href: '/receiving/weighing',
          },
        ]
      : []),
    ...(pendingExpenses.length > 0
      ? [
          {
            id: 'expense-approval',
            severity: 'info' as const,
            title: `ค่าใช้จ่าย ${pendingExpenses.length} รายการรออนุมัติ`,
            href: '/expenses?status=SUBMITTED',
          },
        ]
      : []),
    {
      id: 'price-rule',
      severity: 'info',
      title: 'สูตรราคา/ความชื้นยังรอยืนยันจาก Backend',
      detail: 'ตัวเลขที่แสดงมาจาก mock adapter — จะเปลี่ยนเป็นค่าจริงเมื่อ API พร้อม',
    },
  ]

  return {
    workTypeId: 'EXECUTIVE',
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis,
    panels: [
      queuePanel(params.branchId),
      schedulePanel(params.branchId),
      {
        id: 'branch-breakdown',
        type: 'BREAKDOWN',
        title: 'ยอดรับซื้อแยกตามสาขา',
        span: 'half',
        format: 'currency',
        items: BRANCHES.map((branch) => {
          const branchTickets = completed.filter((t) => t.branchId === branch.id)
          const value = purchaseAmountFor(branchTickets)
          return { key: branch.id, label: branch.name, value, share: 0 }
        })
          .map((item, _i, all) => {
            const total = all.reduce((s, x) => s + x.value, 0) || 1
            return { ...item, share: item.value / total }
          })
          .sort((a, b) => b.value - a.value),
      },
      {
        id: 'alerts',
        type: 'ALERTS',
        title: 'แจ้งเตือน',
        span: 'half',
        items: alerts,
      },
    ],
  }
}

function buildPromotion(params: DashboardParams): DashboardSnapshot {
  const scoped = farmers.filter(
    (f) => params.branchId === 'ALL' || f.branchId === params.branchId,
  )
  const active = scoped.filter((f) => f.status === 'ACTIVE')
  const newFarmers = scoped.filter((f) => withinRange(f.joinedAt, params.dateFrom, params.dateTo))
  const inPrograms = scoped.filter(
    (f) => f.programs.julUamJai || f.programs.debtRelief || f.programs.guaranteedGoodPrice,
  )

  const tasks: TaskItem[] = scoped
    .filter((f) => f.status === 'SUSPENDED' || (f.outstandingDebt > 25_000 && f.status === 'ACTIVE'))
    .slice(0, 6)
    .map((f) => ({
      id: f.id,
      title: f.fullName,
      detail:
        f.status === 'SUSPENDED'
          ? `ระงับสิทธิ์ · ${f.branchName}`
          : `หนี้คงค้างสูง · ${f.branchName}`,
      dueLabel: f.status === 'SUSPENDED' ? 'ต้องตรวจสอบ' : 'ติดตาม',
      overdue: f.status === 'SUSPENDED',
      href: `/farmers/${f.id}`,
    }))

  return {
    workTypeId: 'PROMOTION',
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis: [
      { id: 'farmers-total', label: 'เกษตรกรทั้งหมด', value: scoped.length, format: 'number', unit: 'ราย', href: '/farmers' },
      { id: 'farmers-active', label: 'ใช้งานอยู่', value: active.length, format: 'number', unit: 'ราย', tone: 'success', href: '/farmers?status=ACTIVE' },
      { id: 'farmers-new', label: 'เข้าใหม่ในช่วงนี้', value: newFarmers.length, format: 'number', unit: 'ราย', delta: { value: 15, direction: 'up', label: 'จากช่วงก่อน' } },
      { id: 'farmers-program', label: 'เข้าร่วมโครงการ', value: inPrograms.length, format: 'number', unit: 'ราย', tone: 'info', hint: 'ไหมจุลอุ่นใจ / บรรเทาหนี้ / ประกันราคา' },
      { id: 'farmers-suspended', label: 'ระงับสิทธิ์', value: scoped.filter((f) => f.status === 'SUSPENDED').length, format: 'number', unit: 'ราย', tone: 'danger', href: '/farmers?status=SUSPENDED' },
    ],
    panels: [
      {
        id: 'program-breakdown',
        type: 'BREAKDOWN',
        title: 'การเข้าร่วมโครงการ',
        span: 'half',
        format: 'number',
        unit: 'ราย',
        items: (
          [
            ['julUamJai', 'ไหมจุลอุ่นใจ'],
            ['debtRelief', 'บรรเทาหนี้'],
            ['guaranteedGoodPrice', 'ประกันราคารังดี 200 บาท/กก.'],
          ] as const
        ).map(([key, label]) => {
          const value = scoped.filter((f) => f.programs[key]).length
          return { key, label, value, share: scoped.length ? value / scoped.length : 0 }
        }),
      },
      {
        id: 'branch-farmers',
        type: 'BREAKDOWN',
        title: 'เกษตรกรแยกตามสาขา',
        span: 'half',
        format: 'number',
        unit: 'ราย',
        items: BRANCHES.map((b) => {
          const value = scoped.filter((f) => f.branchId === b.id).length
          return { key: b.id, label: b.name, value, share: scoped.length ? value / scoped.length : 0 }
        }).sort((a, b) => b.value - a.value),
      },
      {
        id: 'follow-up',
        type: 'TASKS',
        title: 'รายการที่ต้องติดตาม',
        span: 'half',
        href: '/farmers',
        items: tasks,
      },
      {
        id: 'recent-farmers',
        type: 'RECENT_DOCS',
        title: 'เกษตรกรที่อัปเดตล่าสุด',
        span: 'half',
        href: '/farmers',
        items: [...scoped]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 6)
          .map<RecentDocItem>((f) => ({
            id: f.id,
            docNo: f.code,
            title: f.fullName,
            subtitle: `${f.branchName} · ${f.district ?? ''}`,
            status: f.status === 'ACTIVE' ? 'ใช้งาน' : f.status === 'INACTIVE' ? 'ไม่ใช้งาน' : 'ระงับสิทธิ์',
            statusTone: f.status === 'ACTIVE' ? 'success' : f.status === 'INACTIVE' ? 'default' : 'danger',
            at: f.updatedAt,
            href: `/farmers/${f.id}`,
          })),
      },
    ],
  }
}

function buildBooking(params: DashboardParams): DashboardSnapshot {
  const scoped = bookings.filter(
    (b) =>
      withinRange(b.bookingDate, params.dateFrom, params.dateTo) &&
      (params.branchId === 'ALL' || b.branchId === params.branchId),
  )
  const byStatus = (s: Booking['status']) => scoped.filter((b) => b.status === s)
  const totalBoxes = scoped
    .filter((b) => b.status !== 'CANCELLED')
    .reduce((s, b) => s + b.quantity, 0)

  return {
    workTypeId: 'PROMOTION',
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis: [
      { id: 'bookings-total', label: 'ใบจองทั้งหมด', value: scoped.length, format: 'number', unit: 'ใบ', href: '/bookings' },
      { id: 'bookings-confirmed', label: 'ยืนยันแล้ว', value: byStatus('CONFIRMED').length, format: 'number', unit: 'ใบ', tone: 'info', href: '/bookings?status=CONFIRMED' },
      { id: 'bookings-preparing', label: 'กำลังเตรียม', value: byStatus('PREPARING').length, format: 'number', unit: 'ใบ', tone: 'warning', href: '/bookings?status=PREPARING' },
      { id: 'bookings-delivered', label: 'ส่งมอบแล้ว', value: byStatus('DELIVERED').length, format: 'number', unit: 'ใบ', tone: 'success', href: '/bookings?status=DELIVERED' },
      { id: 'bookings-boxes', label: 'ไข่ไหมที่จอง', value: totalBoxes, format: 'number', unit: 'กล่อง', hint: 'ไม่รวมใบที่ยกเลิก' },
    ],
    panels: [
      schedulePanel(params.branchId),
      {
        id: 'breed-breakdown',
        type: 'BREAKDOWN',
        title: 'สายพันธุ์ที่จองมากที่สุด',
        span: 'half',
        format: 'number',
        unit: 'กล่อง',
        items: SILK_BREEDS.map((breed) => {
          const value = scoped
            .filter((b) => b.breedId === breed.value && b.status !== 'CANCELLED')
            .reduce((s, b) => s + b.quantity, 0)
          return { key: String(breed.value), label: breed.label, value, share: totalBoxes ? value / totalBoxes : 0 }
        })
          .filter((i) => i.value > 0)
          .sort((a, b) => b.value - a.value),
      },
      {
        id: 'recent-bookings',
        type: 'RECENT_DOCS',
        title: 'ใบจองล่าสุด',
        span: 'full',
        href: '/bookings',
        items: [...scoped]
          .sort((a, b) => b.bookingDate.localeCompare(a.bookingDate))
          .slice(0, 8)
          .map<RecentDocItem>((b) => ({
            id: b.id,
            docNo: b.bookingNo,
            title: b.farmerName,
            subtitle: `${b.breedName} · ${b.quantity} กล่อง · ${b.branchName}`,
            status: BOOKING_STATUS[b.status].label,
            statusTone:
              b.status === 'DELIVERED' ? 'success' : b.status === 'CANCELLED' ? 'danger' : b.status === 'PREPARING' ? 'warning' : 'info',
            at: b.bookingDate,
            href: `/bookings/${b.id}`,
          })),
      },
    ],
  }
}

function buildReceiving(params: DashboardParams): DashboardSnapshot {
  const today = todaysQueue(params.branchId)
  const sorting = today.filter((t) => t.status === 'SORTING')
  const waiting = today.filter((t) => t.status === 'WAITING_WEIGH')
  const inProgress = today.filter((t) => ['CALLED', 'WEIGHING'].includes(t.status))
  const completed = today.filter((t) => t.status === 'COMPLETED')
  const alerts: AlertItem[] = today
    .filter(
      (t) => t.status === 'WAITING_WEIGH' && minutesSince(t.issuedAt ?? t.arrivedAt) > 30,
    )
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      severity: minutesSince(t.issuedAt ?? t.arrivedAt) > 45 ? 'danger' : 'warning',
      title: `คิว ${t.queueNo} รอชั่งนานกว่า ${Math.round(minutesSince(t.issuedAt ?? t.arrivedAt))} นาที`,
      detail: `${t.farmerName} · ${t.farmerCode}`,
      href: '/receiving/weighing',
    }))

  return {
    workTypeId: 'RECEIVING',
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis: [
      { id: 'queue-waiting', label: 'คิวรอชั่ง', value: waiting.length, format: 'number', unit: 'คิว', tone: waiting.length > 5 ? 'warning' : 'default', href: '/receiving/weighing' },
      { id: 'queue-sorting', label: 'กำลังคัดแยก', value: sorting.length, format: 'number', unit: 'ใบ', tone: 'info', href: '/receiving/sorting' },
      { id: 'queue-progress', label: 'กำลังชั่ง', value: inProgress.length, format: 'number', unit: 'คิว', tone: 'info', href: '/receiving/weighing' },
      { id: 'queue-done', label: 'เสร็จสิ้นวันนี้', value: completed.length, format: 'number', unit: 'คิว', tone: 'success', href: '/receiving/weighing?status=COMPLETED' },
      { id: 'net-weight', label: 'น้ำหนักสุทธิวันนี้', value: netWeightFor(completed), format: 'weight' },
      { id: 'purchase-today', label: 'ยอดรับซื้อวันนี้', value: purchaseAmountFor(completed), format: 'currency' },
    ],
    panels: [
      { ...queuePanel(params.branchId), span: 'twothird' },
      {
        id: 'queue-alerts',
        type: 'ALERTS',
        title: 'คิวที่ต้องเร่ง',
        span: 'third',
        items:
          alerts.length > 0
            ? alerts
            : [{ id: 'ok', severity: 'info', title: 'ไม่มีคิวที่รอเกินเกณฑ์', detail: 'ทุกคิวอยู่ในเวลาที่กำหนด' }],
      },
      {
        id: 'quality-breakdown',
        type: 'BREAKDOWN',
        title: 'สัดส่วนคุณภาพรังไหมวันนี้',
        span: 'half',
        format: 'number',
        unit: 'ถุง',
        items: (
          [
            ['goodCocoonQty', '1. รังดี'],
            ['afterScreenQty', '2. รังหลังจ่อ'],
            ['damagedCocoonQty', '3. รังเสีย'],
            ['doubleCocoonQty', '4. รังแฝด'],
            ['thinCocoonQty', '5. รังบาง'],
            ['flossQty', '6. ปุยไหม'],
          ] as const
        )
          .map(([key, label]) => {
            const value = today.reduce(
              (s, t) => s + ((qualities.get(t.id)?.[key] as number | undefined) ?? 0),
              0,
            )
            return { key, label, value, share: 0 }
          })
          .map((item, _i, all) => {
            const total = all.reduce((s, x) => s + x.value, 0) || 1
            return { ...item, share: item.value / total }
          }),
      },
      {
        id: 'recent-purchases',
        type: 'RECENT_DOCS',
        title: 'รายการรับซื้อล่าสุด',
        span: 'half',
        items: completed.slice(0, 6).map<RecentDocItem>((t) => {
          const purchase = purchases.get(t.id)
          return {
            id: t.id,
            docNo: purchase?.transactionNo ?? t.id,
            title: t.farmerName,
            subtitle: `คิว ${t.queueNo} · ${slipWeight(t.id)} กก.`,
            amount: purchase?.grossAmount,
            status: 'เสร็จสิ้น',
            statusTone: 'success',
            at: t.completedAt ?? t.arrivedAt,
            href: `/receiving/${t.id}/summary`,
          }
        }),
      },
    ],
  }
}

function buildDebt(params: DashboardParams): DashboardSnapshot {
  const scoped = debts.filter(
    (d) => params.branchId === 'ALL' || d.branchId === params.branchId,
  )
  const open = scoped.filter((d) => d.status === 'OPEN')
  const partial = scoped.filter((d) => d.status === 'PARTIAL')
  const settled = scoped.filter((d) => d.status === 'SETTLED')
  const inRange = scoped.filter((d) => withinRange(d.updatedAt, params.dateFrom, params.dateTo))

  return {
    workTypeId: 'FINANCE',
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis: [
      { id: 'debt-outstanding', label: 'หนี้คงค้างรวม', value: scoped.reduce((s, d) => s + d.remainingBalance, 0), format: 'currency', tone: 'danger', href: '/debts' },
      { id: 'debt-open', label: 'ยังไม่ตัด', value: open.length, format: 'number', unit: 'ราย', tone: 'warning', href: '/debts?status=OPEN' },
      { id: 'debt-partial', label: 'ตัดบางส่วน', value: partial.length, format: 'number', unit: 'ราย', tone: 'info', href: '/debts?status=PARTIAL' },
      { id: 'debt-settled', label: 'ปิดยอดแล้ว', value: settled.length, format: 'number', unit: 'ราย', tone: 'success', href: '/debts?status=SETTLED' },
      { id: 'debt-deducted', label: 'ตัดหนี้ในช่วงนี้', value: inRange.reduce((s, d) => s + d.deductedAmount, 0), format: 'currency', tone: 'success' },
      { id: 'debt-rounds', label: 'รอบที่ยังมีหนี้', value: new Set(scoped.filter((d) => d.remainingBalance > 0).map((d) => d.batchNo)).size, format: 'number', unit: 'รอบ', hint: 'ตัดหนี้แยกตามรอบ' },
    ],
    panels: [
      {
        id: 'debt-tasks',
        type: 'TASKS',
        title: 'รอตัดหนี้',
        span: 'half',
        href: '/debts?status=OPEN',
        items: open
          .sort((a, b) => b.remainingBalance - a.remainingBalance)
          .slice(0, 7)
          .map<TaskItem>((d) => ({
            id: d.id,
            title: `${d.farmerName} · ${d.sourceNo}`,
            detail: `รอบ ${d.batchNo} · ค้าง ฿${d.remainingBalance.toLocaleString('th-TH')}`,
            dueLabel: formatDateTH(d.createdAt),
            overdue: d.remainingBalance > 30_000,
            href: `/debts/${d.id}`,
          })),
      },
      {
        id: 'debt-branch',
        type: 'BREAKDOWN',
        title: 'หนี้คงค้างแยกตามสาขา',
        span: 'half',
        format: 'currency',
        items: BRANCHES.map((b) => {
          const value = scoped
            .filter((d) => d.branchId === b.id)
            .reduce((s, d) => s + d.remainingBalance, 0)
          return { key: b.id, label: b.name, value, share: 0 }
        })
          .map((item, _i, all) => {
            const total = all.reduce((s, x) => s + x.value, 0) || 1
            return { ...item, share: item.value / total }
          })
          .sort((a, b) => b.value - a.value),
      },
      {
        id: 'debt-recent',
        type: 'RECENT_DOCS',
        title: 'ความเคลื่อนไหวล่าสุด',
        span: 'full',
        href: '/debts',
        items: [...scoped]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 8)
          .map<RecentDocItem>((d) => ({
            id: d.id,
            docNo: d.sourceNo,
            title: d.farmerName,
            subtitle: `รอบ ${d.batchNo} · ตัดแล้ว ฿${d.deductedAmount.toLocaleString('th-TH')}`,
            amount: d.remainingBalance,
            status: DEBT_STATUS[d.status].label,
            statusTone:
              d.status === 'SETTLED' ? 'success' : d.status === 'PARTIAL' ? 'info' : d.status === 'HOLD' ? 'default' : 'warning',
            at: d.updatedAt,
            href: `/debts/${d.id}`,
          })),
      },
    ],
  }
}

function buildExpense(params: DashboardParams): DashboardSnapshot {
  const scoped = expenses.filter(
    (e) =>
      withinRange(e.expenseDate, params.dateFrom, params.dateTo) &&
      (params.branchId === 'ALL' || e.branchId === params.branchId),
  )
  const byStatus = (s: Expense['status']) => scoped.filter((e) => e.status === s)
  const total = scoped
    .filter((e) => !['CANCELLED', 'REJECTED'].includes(e.status))
    .reduce((s, e) => s + e.amount, 0)

  return {
    workTypeId: 'FINANCE',
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis: [
      { id: 'expense-total', label: 'ค่าใช้จ่ายรวม', value: total, format: 'currency', delta: { value: 6, direction: 'up', label: 'จากช่วงก่อน' }, href: '/expenses' },
      { id: 'expense-count', label: 'จำนวนรายการ', value: scoped.length, format: 'number', unit: 'รายการ', href: '/expenses' },
      { id: 'expense-pending', label: 'รออนุมัติ', value: byStatus('SUBMITTED').length, format: 'number', unit: 'รายการ', tone: 'warning', href: '/expenses?status=SUBMITTED' },
      { id: 'expense-draft', label: 'ร่างที่ยังไม่ส่ง', value: byStatus('DRAFT').length, format: 'number', unit: 'รายการ', tone: 'info', href: '/expenses?status=DRAFT' },
      { id: 'expense-approved', label: 'อนุมัติแล้ว', value: byStatus('APPROVED').reduce((s, e) => s + e.amount, 0), format: 'currency', tone: 'success', href: '/expenses?status=APPROVED' },
    ],
    panels: [
      {
        id: 'expense-category',
        type: 'BREAKDOWN',
        title: 'ค่าใช้จ่ายแยกตามประเภท',
        span: 'half',
        format: 'currency',
        items: expenseCategoryMasters.map((c) => {
          const value = scoped
            .filter((e) => e.categoryId === c.id && !['CANCELLED', 'REJECTED'].includes(e.status))
            .reduce((s, e) => s + e.amount, 0)
          return { key: c.id, label: c.name, value, share: total ? value / total : 0 }
        })
          .filter((i) => i.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 8),
      },
      {
        id: 'expense-pending-tasks',
        type: 'TASKS',
        title: 'รายการที่ต้องจัดการ',
        span: 'half',
        href: '/expenses',
        items: [...byStatus('DRAFT'), ...byStatus('SUBMITTED')]
          .slice(0, 7)
          .map<TaskItem>((e) => ({
            id: e.id,
            title: `${e.expenseNo} · ${e.categoryName}`,
            detail: `฿${e.amount.toLocaleString('th-TH')} · ${e.branchName}`,
            dueLabel: e.status === 'DRAFT' ? 'ยังไม่ส่ง' : 'รออนุมัติ',
            overdue: e.status === 'DRAFT',
            href: `/expenses/${e.id}`,
          })),
      },
      {
        id: 'expense-recent',
        type: 'RECENT_DOCS',
        title: 'บันทึกล่าสุด',
        span: 'full',
        href: '/expenses',
        items: [...scoped]
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 8)
          .map<RecentDocItem>((e) => ({
            id: e.id,
            docNo: e.expenseNo,
            title: e.description,
            subtitle: `${e.categoryName} · ${e.branchName} · ${e.createdByName}`,
            amount: e.amount,
            status: EXPENSE_STATUS[e.status].label,
            statusTone:
              e.status === 'APPROVED' ? 'success' : e.status === 'REJECTED' ? 'danger' : e.status === 'SUBMITTED' ? 'warning' : 'default',
            at: e.createdAt,
            href: `/expenses/${e.id}`,
          })),
      },
    ],
  }
}

/**
 * Work areas compose the per-domain builders above: 'ส่งเสริมเกษตรกร' owns both
 * farmers and bookings, 'บัญชีและการเงิน' owns both debt and expenses.
 */
function mergeSnapshots(
  workTypeId: WorkTypeId,
  params: DashboardParams,
  parts: DashboardSnapshot[],
  kpiLimit = 6,
): DashboardSnapshot {
  return {
    workTypeId,
    generatedAt: mockNow().toISOString(),
    branchId: params.branchId,
    range: { from: params.dateFrom, to: params.dateTo },
    kpis: parts.flatMap((p) => p.kpis).slice(0, kpiLimit),
    panels: parts.flatMap((p) => p.panels),
  }
}

const SNAPSHOT_BUILDERS: Record<WorkTypeId, (params: DashboardParams) => DashboardSnapshot> = {
  EXECUTIVE: buildOverview,
  // The administration view is org-wide, same source as the executive one.
  ADMIN: (params) => ({ ...buildOverview(params), workTypeId: 'ADMIN' }),
  RECEIVING: buildReceiving,
  PROMOTION: (params) =>
    mergeSnapshots('PROMOTION', params, [buildPromotion(params), buildBooking(params)]),
  FINANCE: (params) =>
    mergeSnapshots('FINANCE', params, [buildExpense(params), buildDebt(params)]),
}

/* ── Helpers shared by the write endpoints ──────────────────────────────── */

function requireTicket(queueId: string): QueueTicket {
  const ticket = queueTickets.find((t) => t.id === queueId)
  if (!ticket) throw new ApiError(404, 'ไม่พบคิวที่ระบุ')
  return ticket
}

/**
 * Persists a ticket and hands it back, so every mutation ends the same way.
 *
 * The queue is written on paper at the counter; losing it to a page refresh
 * would be worse than any of the validation this file does.
 */
function persistTicket(ticket: QueueTicket): QueueTicket {
  saveQueueTicket(ticket)
  return ticket
}

/**
 * Records an audit row in memory and in the database.
 *
 * Everything goes through here rather than pushing onto the array directly:
 * a trail that only exists until the next reload is not a trail.
 */
function pushAudit(entry: AuditEntry) {
  auditEntries.unshift(entry)
  repo.saveAuditEntry(entry)
}

/**
 * The slip header, resolved from the round the farmer is bringing.
 *
 * สายพันธุ์ · โครงการ · รุ่นฟัก · จำนวนไข่ไหมที่จองไป are read off the booking, not
 * off the payload: they describe what was actually delivered, and letting the
 * counter retype them is how a slip ends up describing a round that never
 * happened.
 */
function slipHeader(payload: QueuePayload, booking: Booking) {
  const branch = BRANCHES.find((b) => b.id === payload.branchId)
  const eggLine = booking.delivery?.items.find((item) =>
    booking.items.some((i) => i.id === item.bookingItemId && i.kind === 'EGG'),
  )
  return {
    branchId: payload.branchId,
    branchName: branch?.name ?? '-',
    breedId: booking.breedId,
    breedName: SILK_BREEDS.find((b) => b.value === booking.breedId)?.label ?? booking.breedName,
    projectId: booking.projectId,
    projectName: PROJECTS.find((p) => p.value === booking.projectId)?.label ?? booking.projectName,
    hatchDate: booking.hatchDate,
    // What went out the door, falling back to what was booked.
    expectedBoxes: eggLine?.quantity ?? booking.quantity,
    splitFromBoxes: payload.splitFromBoxes,
    remark: payload.remark,
  }
}

/**
 * The round a farmer still has open, if any.
 *
 * Rearing runs round by round: a farmer books, is delivered, rears, sells, and
 * only then books again. A round counts as open until its cocoons have been
 * bought — so this is what stops a second booking being written on top of one
 * the farmer has not finished.
 */
function openRoundFor(farmerId: string, ignoreBookingId?: string): Booking | undefined {
  return bookings.find(
    (booking) =>
      booking.farmerId === farmerId &&
      booking.id !== ignoreBookingId &&
      booking.status !== 'CANCELLED' &&
      !queueTickets.some((t) => t.bookingId === booking.id && t.status === 'COMPLETED'),
  )
}

/**
 * The round must be delivered, belong to this farmer, and not already be on
 * another open slip — one delivered round, one trip to the buying station.
 */
function requireQueueableBooking(payload: QueuePayload, currentQueueId?: string): Booking {
  const booking = bookings.find((b) => b.id === payload.bookingId)
  if (!booking) {
    throw new ApiError(422, 'ไม่พบรอบที่เลือก', undefined, {
      bookingId: ['กรุณาเลือกรอบที่รับไข่ไหมไป'],
    })
  }
  if (booking.farmerId !== payload.farmerId) {
    throw new ApiError(422, 'รอบที่เลือกเป็นของเกษตรกรรายอื่น', undefined, {
      bookingId: ['รอบนี้ไม่ใช่ของเกษตรกรรายนี้'],
    })
  }
  if (!booking.delivery) {
    throw new ApiError(422, 'รอบนี้ยังไม่ได้ส่งของ จึงยังไม่มีไข่ไหมให้เลี้ยง', undefined, {
      bookingId: ['ต้องบันทึกส่งของก่อนจึงจะออกใบคิวได้'],
    })
  }
  const claimed = queueTickets.find(
    (t) => t.bookingId === booking.id && t.status !== 'CANCELLED' && t.id !== currentQueueId,
  )
  if (claimed) {
    throw new ApiError(409, `รอบนี้มีใบคิวอยู่แล้ว (${claimed.queueNo ?? claimed.id})`)
  }
  return booking
}

function nowIso(): string {
  return mockNow().toISOString()
}

/** A blank slip 1 — the station fills it one bag at a time. */
function emptyFreshSlip(queueId: string): FreshWeighSlip {
  return {
    queueId,
    slipNo: `WS-${queueId}-1`,
    lines: [],
    gradeTotals: [],
    totalCocoonWeight: 0,
    totalScrapWeight: 0,
    avgWeightPerBox: null,
    source: 'MANUAL',
    locked: false,
  }
}

/** A blank slip 2 — the shell sample. */
function emptyShellSlip(queueId: string): ShellWeighSlip {
  return {
    queueId,
    slipNo: `WS-${queueId}-2`,
    sampleCocoonCount: null,
    sampleCocoonWeightG: null,
    shellWeightG: null,
    shellPercent: null,
    moisturePercent: null,
    locked: false,
  }
}

/** Unlocking a weighed slip is an override — §7.6 requires an audit row. */
/** Only a submitted item can be decided on, and only once. */
function requireSubmittedExpense(id: string, action: string): number {
  const index = expenses.findIndex((e) => e.id === id)
  if (index < 0) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')
  const status = expenses[index].status
  if (status !== 'SUBMITTED') {
    throw new ApiError(
      409,
      status === 'DRAFT'
        ? 'รายการนี้ยังเป็นฉบับร่าง ต้องส่งขออนุมัติก่อน'
        : `รายการนี้${EXPENSE_STATUS[status].label}แล้ว จึง${action}ไม่ได้`,
    )
  }
  return index
}

function logExpenseDecision(
  id: string,
  action: 'APPROVE_EXPENSE' | 'REJECT_EXPENSE',
  before: Expense,
  after: Expense,
  reference?: string,
) {
  pushAudit({
    id: `A-${Date.now()}`,
    at: nowIso(),
    actorId: actor()?.id ?? 'U-000',
    actorName: actor()?.displayName ?? 'ระบบ',
    action,
    entity: 'Expense',
    entityId: id,
    reference: reference ?? after.expenseNo,
    before: { status: before.status },
    after: { status: after.status },
  })
}

function logUnlock(queueId: string, reason: string, entity: string) {
  pushAudit({
    id: `A-${Date.now()}`,
    at: nowIso(),
    actorId: actor()?.id ?? 'U-000',
    actorName: actor()?.displayName ?? 'ระบบ',
    action: 'UNLOCK_WEIGHING',
    entity,
    entityId: queueId,
    reference: reason,
  })
}

const seenIdempotencyKeys = new Set<string>()

/**
 * The backend is the final authority on rights (§14).
 *
 * Route and action guards keep the UI honest, but a request that arrives
 * without the right must fail here too — otherwise "the button was hidden" is
 * the only thing standing between a clerk and releasing money.
 */
function requirePermission(permission: Permission, message: string) {
  if (!actor()?.permissions.includes(permission)) {
    throw new ApiError(403, message)
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Keeps the pay-out in step with the invoice it belongs to.
 *
 * Called wherever an invoice's money can move — the purchase closing, a
 * deduction landing — so นายทะเบียน never has to remember to refresh it.
 */
function syncPayment(queueId: string) {
  const ticket = queueTickets.find((t) => t.id === queueId)
  const purchase = purchases.get(queueId)
  if (!ticket || !purchase || ticket.status !== 'COMPLETED') return
  const payment = upsertPayment(purchase, ticket, nowIso())
  repo.saveCounter('payment', counters.payment)
  savePayment(payment)
}

function requirePayment(id: string) {
  const payment = payments.find((p) => p.id === id)
  if (!payment) throw new ApiError(404, 'ไม่พบรายการจ่ายเงิน')
  return payment
}

/* ── ส่งออกไประบบบัญชี ──────────────────────────────────────────────────── */

/**
 * What is waiting to be sent, per kind.
 *
 * A row qualifies once the event it represents has actually happened — a debt
 * once it is raised, an offset once it is confirmed, a pay-out once the money
 * is out the door. Anything already stamped drops off the list, which is what
 * stops accounting posting the same document twice.
 */
function pendingRows(kind: ExportKind): PendingExportRow[] {
  if (kind === 'DEBT') {
    return debts
      .filter((d) => !d.exportedAt)
      .map((d) => ({
        id: d.id,
        docNo: d.sourceNo,
        docDate: d.createdAt,
        farmerCode: d.farmerCode,
        farmerName: d.farmerName,
        batchNo: d.batchNo,
        amount: d.originalAmount,
      }))
      .sort((a, b) => a.docDate.localeCompare(b.docDate))
  }

  // ซื้อวัตถุดิบ: a closed purchase is a goods receipt whether or not the
  // farmer has been paid yet, so it is ready for accounting immediately.
  if (kind === 'PURCHASE') {
    return [...purchases.values()]
      .filter((p) => p.status === 'COMPLETED' && !p.exportedAt && p.grossAmount > 0)
      .map((p) => ({
        id: p.queueId,
        docNo: p.transactionNo,
        docDate: p.completedAt ?? p.purchaseDate,
        farmerCode: p.farmerCode,
        farmerName: p.farmerName,
        batchNo: p.batchNo ?? '-',
        amount: p.grossAmount,
        reference: `${formatNumber(p.totalCocoonWeight + p.totalScrapWeight, 2)} กก.`,
      }))
      .sort((a, b) => a.docDate.localeCompare(b.docDate))
  }

  if (kind === 'DEDUCTION') {
    return debtDeductions
      .filter((x) => !x.exportedAt)
      .flatMap((x) => {
        const debt = debts.find((d) => d.id === x.debtId)
        if (!debt) return []
        return [
          {
            id: x.id,
            docNo: x.id,
            docDate: x.at,
            farmerCode: debt.farmerCode,
            farmerName: debt.farmerName,
            batchNo: debt.batchNo,
            amount: x.amount,
            reference: x.transactionNo,
          },
        ]
      })
      .sort((a, b) => a.docDate.localeCompare(b.docDate))
  }

  // A payment reaches accounting only after the money has been handed over —
  // a PENDING row is an intention, and intentions are not journal entries.
  return payments
    .filter((x) => x.status === 'PAID' && !x.exportedAt)
    .map((x) => ({
      id: x.id,
      docNo: x.paymentNo,
      docDate: x.paidDate ?? x.updatedAt,
      farmerCode: x.farmerCode,
      farmerName: x.farmerName,
      batchNo: x.batchNo ?? '-',
      amount: x.netAmount,
      reference: x.transactionNo,
    }))
    .sort((a, b) => a.docDate.localeCompare(b.docDate))
}

function requireDebt(id: string) {
  const debt = debts.find((d) => d.id === id)
  if (!debt) throw new ApiError(404, 'ไม่พบรายการหนี้')
  return debt
}

/**
 * Purchases that may pay this debt down.
 *
 * Scoped to the debt's own รอบ: the farmer's income from one batch never
 * settles another batch's debt, which is the rule the accounting office works
 * to. What is left of each invoice is its รวมรายได้ minus what it already paid.
 */
function sourcesForDebt(debtId: string): DeductionSource[] {
  const debt = requireDebt(debtId)
  return [...purchases.values()]
    .filter(
      (pu) =>
        pu.status === 'COMPLETED' &&
        pu.farmerId === debt.farmerId &&
        pu.batchNo === debt.batchNo &&
        pu.grossAmount > 0,
    )
    .map((pu) => {
      const appliedAmount = round2(
        debtDeductions
          .filter((d) => d.purchaseId === pu.id)
          .reduce((sum, d) => sum + d.amount, 0),
      )
      return {
        purchaseId: pu.id,
        transactionNo: pu.transactionNo,
        purchaseDate: pu.purchaseDate,
        batchNo: pu.batchNo,
        grossAmount: pu.grossAmount,
        appliedAmount,
        availableAmount: round2(pu.grossAmount - appliedAmount),
      }
    })
    .filter((s) => s.availableAmount > 0)
    .sort((x, y) => y.purchaseDate.localeCompare(x.purchaseDate))
}

function requireSource(debtId: string, purchaseId: string): DeductionSource {
  const source = sourcesForDebt(debtId).find((s) => s.purchaseId === purchaseId)
  if (!source) {
    throw new ApiError(422, 'ใบรับซื้อที่เลือกใช้ตัดหนี้รอบนี้ไม่ได้', undefined, {
      purchaseId: ['ต้องเป็นใบรับซื้อของเกษตรกรรายนี้ ในรอบเดียวกัน และยังมียอดคงเหลือ'],
    })
  }
  return source
}

/**
 * Validates a document's lines against the product master and stamps the
 * effective price onto each one. Rejecting an unpriced product here is what
 * keeps "the price is in the price list" true rather than aspirational.
 */
function resolveBookingItems(lines: BookingItemPayload[], idPrefix: string): BookingItem[] {
  if (!lines || lines.length === 0) {
    throw new ApiError(422, 'ต้องมีรายการอย่างน้อย 1 รายการ', undefined, {
      items: ['ต้องมีรายการอย่างน้อย 1 รายการ'],
    })
  }
  for (const line of lines) {
    const product = products.find((p) => p.id === line.productId)
    if (!product || !product.active) {
      throw new ApiError(422, 'มีรายการที่ไม่พบในข้อมูลหลักสินค้า')
    }
    if (product.currentPrice == null) {
      throw new ApiError(422, `สินค้า ${product.name} ยังไม่มีราคาที่ใช้งานอยู่ กรุณาตั้งราคาที่ productPrice ก่อน`)
    }
    if (line.quantity <= 0) {
      throw new ApiError(422, `จำนวนของ ${product.name} ต้องมากกว่า 0`)
    }
  }
  return buildBookingItems(lines, idPrefix)
}

/** The price row in effect today for a product. */
function effectivePrice(productId: string): ProductPrice | undefined {
  return productPrices.find((p) => p.productId === productId && p.current)
}

/* ── General master helpers ─────────────────────────────────────────────── */

interface CodedRow {
  id: string
  code: string
  updatedAt: string
}

function assertUniqueCode(rows: CodedRow[], id: string | null, code: string): void {
  const wanted = code.trim().toLowerCase()
  if (rows.some((r) => r.id !== id && r.code.trim().toLowerCase() === wanted)) {
    throw new ApiError(422, 'รหัสนี้ถูกใช้แล้ว', undefined, { code: ['รหัสนี้ถูกใช้แล้ว'] })
  }
}

/**
 * Create-or-update for the flat master tables. They share a shape, so one
 * helper keeps their validation and audit behaviour identical.
 */
function upsertMaster<T extends CodedRow>(
  rows: T[],
  id: string | null,
  payload: Omit<T, 'id' | 'updatedAt'>,
  idPrefix: string,
  entity: string,
  persist: (row: T) => void,
): T {
  assertUniqueCode(rows, id, payload.code)

  let saved: T
  if (id) {
    const index = rows.findIndex((r) => r.id === id)
    if (index < 0) throw new ApiError(404, `ไม่พบ${entity}`)
    saved = { ...rows[index], ...payload, updatedAt: nowIso() }
    rows[index] = saved
  } else {
    saved = { id: `${idPrefix}-${Date.now()}`, ...payload, updatedAt: nowIso() } as T
    rows.push(saved)
  }

  persist(saved)
  pushAudit({
    id: `A-${Date.now()}`,
    at: nowIso(),
    actorId: actor()?.id ?? 'U-000',
    actorName: actor()?.displayName ?? 'ระบบ',
    action: id ? 'UPDATE_MASTER' : 'CREATE_MASTER',
    entity,
    entityId: saved.id,
    reference: saved.code,
  })
  return saved
}

/* ── The adapter ────────────────────────────────────────────────────────── */

export const mockServices: Services = {
  auth: {
    async login({ username, password }) {
      await delay(null, 650)
      const user = users.find((u) => u.username === username.trim().toLowerCase())
      if (!user || password !== DEMO_PASSWORD) {
        throw new ApiError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      }
      currentUser = user
      const session: Session = {
        token: `mock-token-${user.id}`,
        refreshToken: `mock-refresh-${user.id}`,
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
        user,
      }
      return session
    },
    async logout() {
      currentUser = null
      await delay(null, 150)
    },
    async me() {
      const user = actor()
      if (!user) throw new ApiError(401, 'Unauthorized')
      return delay(user, 120)
    },
  },

  dashboard: {
    async getSnapshot(params) {
      const build = SNAPSHOT_BUILDERS[params.workTypeId]
      if (!build) throw new ApiError(404, 'ไม่พบประเภทงานที่เลือก')
      return delay(build(params))
    },
    async setDefaultWorkType(workTypeId) {
      const user = actor()
      if (user) {
        user.defaultWorkTypeId = workTypeId
        repo.saveDefaultWorkType(user.id, workTypeId, nowIso())
      }
      await delay(null, 100)
    },
  },

  farmers: {
    async list(params) {
      let items = farmers.filter(
        (f) =>
          matches([f.fullName, f.code, f.phone, f.district], params.search) &&
          (!params.branchId || params.branchId === 'ALL' || f.branchId === params.branchId) &&
          (!params.status || f.status === params.status),
      )
      items = sortBy(items, params.sortBy ?? 'fullName', params.sortDir)
      return delay(paginate(items, params))
    },
    async get(id) {
      const farmer = farmers.find((f) => f.id === id)
      if (!farmer) throw new ApiError(404, 'ไม่พบข้อมูลเกษตรกร')
      return delay(farmer)
    },
    async create(payload: FarmerPayload) {
      const branch = BRANCHES.find((b) => b.id === payload.branchId)
      if (farmers.some((f) => f.code === payload.code)) {
        throw new ApiError(422, 'รหัสเกษตรกรนี้ถูกใช้แล้ว', 'DUPLICATE_CODE', {
          code: ['รหัสเกษตรกรนี้ถูกใช้แล้ว'],
        })
      }
      counters.farmer += 1
      repo.saveCounter('farmer', counters.farmer)
      const farmer: Farmer = {
        id: `F-${String(counters.farmer).padStart(4, '0')}`,
        ...payload,
        fullName: `${payload.firstName} ${payload.lastName}`,
        branchName: branch?.name ?? '-',
        joinedAt: nowIso(),
        outstandingDebt: 0,
        totalPurchaseAmount: 0,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      farmers.unshift(farmer)
      repo.saveFarmer(farmer)
      return delay(farmer, 500)
    },
    async update(id, payload) {
      const index = farmers.findIndex((f) => f.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบข้อมูลเกษตรกร')
      const branch = BRANCHES.find((b) => b.id === payload.branchId)
      farmers[index] = {
        ...farmers[index],
        ...payload,
        fullName: `${payload.firstName} ${payload.lastName}`,
        branchName: branch?.name ?? farmers[index].branchName,
        updatedAt: nowIso(),
      }
      repo.saveFarmer(farmers[index])
      return delay(farmers[index], 500)
    },
    async search(query) {
      const items = farmers
        .filter((f) => f.status === 'ACTIVE' && matches([f.fullName, f.code], query))
        .slice(0, 20)
        .map<Option>((f) => ({
          value: f.id,
          label: f.fullName,
          description: `${f.code} · ${f.branchName}`,
        }))
      return delay(items, 260)
    },
    async history(id) {
      const items: FarmerHistoryItem[] = [
        ...bookings
          .filter((b) => b.farmerId === id)
          .map<FarmerHistoryItem>((b) => ({
            id: b.id,
            kind: 'BOOKING',
            at: b.bookingDate,
            title: `ใบจอง ${b.bookingNo}`,
            detail: `${b.breedName} · ${b.quantity} กล่อง`,
            status: BOOKING_STATUS[b.status].label,
            href: `/bookings/${b.id}`,
          })),
        ...queueTickets
          .filter((t) => t.farmerId === id && t.status === 'COMPLETED')
          .map<FarmerHistoryItem>((t) => ({
            id: t.id,
            kind: 'RECEIVING',
            at: t.completedAt ?? t.arrivedAt,
            title: `รับซื้อรังไหม คิว ${t.queueNo}`,
            detail: `${slipWeight(t.id)} กก.`,
            amount: purchases.get(t.id)?.grossAmount,
            status: 'เสร็จสิ้น',
            href: `/receiving/${t.id}/summary`,
          })),
        ...debts
          .filter((d) => d.farmerId === id)
          .map<FarmerHistoryItem>((d) => ({
            id: d.id,
            kind: 'DEBT',
            at: d.updatedAt,
            title: `หนี้จากใบจอง ${d.sourceNo}`,
            detail: `รอบ ${d.batchNo} · คงเหลือ ฿${d.remainingBalance.toLocaleString('th-TH')}`,
            amount: d.deductedAmount,
            status: DEBT_STATUS[d.status].label,
            href: `/debts/${d.id}`,
          })),
      ].sort((a, b) => b.at.localeCompare(a.at))
      return delay(items)
    },
  },

  bookings: {
    async list(params) {
      let items = bookings.filter(
        (b) =>
          matches([b.bookingNo, b.farmerName, b.farmerCode, b.batchNo], params.search) &&
          (!params.branchId || params.branchId === 'ALL' || b.branchId === params.branchId) &&
          (!params.status || b.status === params.status) &&
          withinRange(b.bookingDate, params.dateFrom, params.dateTo),
      )
      items = sortBy(items, params.sortBy ?? 'bookingDate', params.sortDir ?? 'desc')
      return delay(paginate(items, params))
    },
    async get(id) {
      const booking = bookings.find((b) => b.id === id)
      if (!booking) throw new ApiError(404, 'ไม่พบใบจอง')
      return delay(booking)
    },
    async create(payload: BookingPayload) {
      const openRound = openRoundFor(payload.farmerId)
      if (openRound) {
        throw new ApiError(
          409,
          `เกษตรกรรายนี้ยังมีรอบ ${openRound.batchNo} (${openRound.bookingNo}) ที่ยังไม่ปิด — ต้องขายรังไหมของรอบนั้นก่อนจึงจะจองรอบใหม่ได้`,
          undefined,
          { farmerId: ['ยังมีรอบที่ยังไม่ปิด'] },
        )
      }

      const farmer = farmers.find((f) => f.id === payload.farmerId)
      if (!farmer) throw new ApiError(422, 'ไม่พบเกษตรกรที่เลือก', undefined, { farmerId: ['กรุณาเลือกเกษตรกร'] })
      const branch = BRANCHES.find((b) => b.id === payload.branchId)
      counters.booking += 1
      repo.saveCounter('booking', counters.booking)
      const id = `B-${String(counters.booking).padStart(4, '0')}`

      // Unit and price are resolved here, never taken from the client.
      const items = resolveBookingItems(payload.items, id)
      const summary = summariseBookingItems(items)

      const booking: Booking = {
        id,
        bookingNo: `BK-2569-${String(counters.booking).padStart(4, '0')}`,
        ...payload,
        items,
        ...summary,
        farmerName: farmer.fullName,
        farmerCode: farmer.code,
        branchName: branch?.name ?? '-',
        projectName: PROJECTS.find((p) => p.value === payload.projectId)?.label,
        attachments: [],
        status: 'DRAFT',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      bookings.unshift(booking)
      repo.saveBooking(booking)
      return delay(booking, 500)
    },
    async update(id, payload) {
      const index = bookings.findIndex((b) => b.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบใบจอง')
      if (bookings[index].status === 'CANCELLED') {
        throw new ApiError(409, 'ใบจองที่ยกเลิกแล้วไม่สามารถแก้ไขได้')
      }
      const farmer = farmers.find((f) => f.id === payload.farmerId)
      const items = resolveBookingItems(payload.items, id)
      const summary = summariseBookingItems(items)

      bookings[index] = {
        ...bookings[index],
        ...payload,
        items,
        ...summary,
        farmerName: farmer?.fullName ?? bookings[index].farmerName,
        farmerCode: farmer?.code ?? bookings[index].farmerCode,
        projectName: PROJECTS.find((p) => p.value === payload.projectId)?.label,
        updatedAt: nowIso(),
      }
      repo.saveBooking(bookings[index])
      return delay(bookings[index], 500)
    },
    async cancel(id, reason) {
      const index = bookings.findIndex((b) => b.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบใบจอง')
      bookings[index] = {
        ...bookings[index],
        status: 'CANCELLED',
        remark: [bookings[index].remark, `ยกเลิก: ${reason}`].filter(Boolean).join(' | '),
        updatedAt: nowIso(),
      }
      repo.saveBooking(bookings[index])
      return delay(bookings[index], 400)
    },
    /**
     * บันทึกส่งของ — the promotion officer hands the goods over.
     *
     * This is where the money starts: the booking was only a request, so the
     * debt is opened here, from the quantities actually delivered and the price
     * the product master holds today. The payload carries quantities and
     * nothing else, which is what stops a delivery from re-pricing a document.
     */
    async recordDelivery(id, payload: DeliveryPayload) {
      requirePermission('booking:deliver', 'ต้องมีสิทธิ์บันทึกส่งของจึงจะทำรายการนี้ได้')

      const index = bookings.findIndex((b) => b.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบใบจอง')
      const booking = bookings[index]

      if (booking.status === 'CANCELLED') {
        throw new ApiError(409, 'ใบจองถูกยกเลิกแล้ว')
      }
      if (booking.delivery) {
        throw new ApiError(409, 'ใบจองนี้บันทึกส่งของและตั้งหนี้ไปแล้ว')
      }
      if (booking.status === 'DRAFT') {
        throw new ApiError(409, 'ใบจองยังเป็นฉบับร่าง ต้องยืนยันใบจองก่อนส่งของ')
      }

      const items: DeliveryItem[] = payload.items.flatMap((line) => {
        const item = booking.items.find((i) => i.id === line.bookingItemId)
        if (!item) {
          throw new ApiError(422, 'มีรายการที่ไม่อยู่ในใบจองนี้', undefined, {
            items: ['รายการที่ส่งต้องอยู่ในใบจอง'],
          })
        }
        if (line.quantity < 0) {
          throw new ApiError(422, 'จำนวนที่ส่งต้องไม่ติดลบ', undefined, {
            items: ['จำนวนที่ส่งต้องไม่ติดลบ'],
          })
        }
        if (line.quantity === 0) return []

        // Price comes from the master, never the payload (§20).
        const product = products.find((prod) => prod.id === item.productId)
        const unitPrice = product?.currentPrice ?? item.unitPrice
        return [
          {
            bookingItemId: item.id,
            productName: item.productName,
            quantity: line.quantity,
            unitName: item.unitName,
            unitPrice,
            amount: round2(line.quantity * unitPrice),
          },
        ]
      })

      if (items.length === 0) {
        throw new ApiError(422, 'ต้องส่งอย่างน้อย 1 รายการ', undefined, {
          items: ['ต้องส่งอย่างน้อย 1 รายการ'],
        })
      }

      const totalAmount = round2(items.reduce((sum, item) => sum + item.amount, 0))
      const debtId = `D-${Date.now()}`
      const deliveredAt = payload.deliveredAt || nowIso()
      const farmer = farmers.find((f) => f.id === booking.farmerId)

      const debt: DebtRecord = {
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
        status: farmer?.status === 'SUSPENDED' ? 'HOLD' : 'OPEN',
        remark: payload.remark,
        createdAt: deliveredAt,
        updatedAt: deliveredAt,
      }

      debts.unshift(debt)
      saveDebt(debt)
      refreshFarmerDebt(booking.farmerId)

      bookings[index] = {
        ...booking,
        status: 'DELIVERED',
        delivery: {
          deliveredAt,
          deliveredBy: actor()?.id ?? 'U-000',
          deliveredByName: actor()?.displayName ?? 'ระบบ',
          receivedBy: payload.receivedBy,
          items,
          totalAmount,
          debtId,
          remark: payload.remark,
        },
        updatedAt: nowIso(),
      }
      repo.saveBooking(bookings[index])

      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'RECORD_DELIVERY',
        entity: 'Booking',
        entityId: id,
        reference: `ตั้งหนี้ ${debt.id} · ฿${totalAmount.toLocaleString('th-TH')}`,
        before: { status: booking.status },
        after: { status: 'DELIVERED' },
      })

      return delay(bookings[index], 600)
    },
    async rounds(farmerId, includeBookingId) {
      const owned = sortBy(
        bookings.filter((b) => b.farmerId === farmerId && b.status !== 'CANCELLED'),
        'expectedDeliveryDate',
        'desc',
      )

      const rounds = owned.map<FarmerRound>((booking) => {
        const ticket = queueTickets.find(
          (t) => t.bookingId === booking.id && t.status !== 'CANCELLED',
        )

        // The slip being edited keeps its own round, or reopening a draft would
        // lose the selection it was written with.
        if (booking.id === includeBookingId) {
          return { booking, eligible: true, queueId: ticket?.id, queueNo: ticket?.queueNo }
        }
        if (!booking.delivery) {
          return { booking, eligible: false, blockedReason: 'NOT_DELIVERED' }
        }
        if (ticket) {
          return {
            booking,
            eligible: false,
            blockedReason: ticket.status === 'COMPLETED' ? 'ALREADY_PURCHASED' : 'ALREADY_QUEUED',
            queueId: ticket.id,
            queueNo: ticket.queueNo,
          }
        }
        return { booking, eligible: true }
      })

      return delay(rounds, 320)
    },
    async batchOptions(breedId) {
      if (!breedId) return delay([], 120)
      const options: Option[] = Array.from({ length: 6 }, (_, i) => ({
        value: `R${i + 1}/2569`,
        label: `รุ่น R${i + 1}/2569`,
        description: `สายพันธุ์ ${SILK_BREEDS.find((b) => b.value === breedId)?.label ?? breedId}`,
      }))
      return delay(options, 220)
    },
  },

  receiving: {
    async getQueue(params) {
      let items = queueTickets.filter(
        (t) =>
          matches([t.farmerName, t.farmerCode, t.bookingNo, String(t.queueNo)], params.search) &&
          (!params.branchId || params.branchId === 'ALL' || t.branchId === params.branchId) &&
          (!params.status || t.status === params.status) &&
          withinRange(t.arrivedAt, params.dateFrom, params.dateTo),
      )
      items = sortBy(items, params.sortBy ?? 'queueNo', params.sortDir ?? 'asc')
      return delay(paginate(items, { ...params, pageSize: params.pageSize ?? 50 }))
    },
    async getTicket(queueId) {
      return delay(requireTicket(queueId))
    },
    /** จุดคัดแยก — opens a slip. No queue number until it is issued. */
    async createQueue(payload: QueuePayload) {
      const farmer = farmers.find((f) => f.id === payload.farmerId)
      if (!farmer) throw new ApiError(422, 'ไม่พบเกษตรกร', undefined, { farmerId: ['กรุณาเลือกเกษตรกร'] })
      const booking = requireQueueableBooking(payload)
      counters.slip += 1
      repo.saveCounter('slip', counters.slip)
      const ticket: QueueTicket = {
        id: `Q-N-${String(counters.slip).padStart(4, '0')}`,
        queueNo: null,
        queueDate: nowIso(),
        status: 'SORTING',
        arrivedAt: nowIso(),
        farmerId: farmer.id,
        farmerCode: farmer.code,
        farmerName: farmer.fullName,
        bookingId: booking.id,
        bookingNo: booking.bookingNo,
        ...slipHeader(payload, booking),
      }
      queueTickets.push(ticket)
      return delay(persistTicket(ticket), 450)
    },
    async updateQueue(queueId, payload: QueuePayload) {
      const ticket = requireTicket(queueId)
      if (ticket.queueNo != null) {
        throw new ApiError(409, 'ใบคิวถูกออกแล้ว ไม่สามารถแก้ไขหัวเอกสารได้')
      }
      const farmer = farmers.find((f) => f.id === payload.farmerId)
      if (!farmer) throw new ApiError(422, 'ไม่พบเกษตรกร', undefined, { farmerId: ['กรุณาเลือกเกษตรกร'] })
      const booking = requireQueueableBooking(payload, queueId)
      Object.assign(ticket, {
        farmerId: farmer.id,
        farmerCode: farmer.code,
        farmerName: farmer.fullName,
        bookingId: booking.id,
        bookingNo: booking.bookingNo,
        ...slipHeader(payload, booking),
      })
      return delay(persistTicket(ticket), 400)
    },
    /**
     * ออกใบคิว — the sorting station's hand-off. The quality section must be
     * complete first, because the printed slip carries those numbers.
     */
    async issueSlip(queueId) {
      const ticket = requireTicket(queueId)
      if (ticket.status !== 'SORTING') {
        throw new ApiError(409, 'ใบคิวนี้ถูกออกไปแล้ว')
      }
      const quality = qualities.get(queueId)
      if (!quality) {
        throw new ApiError(422, 'ต้องบันทึกผลคัดแยกรังไหมก่อนออกใบคิว')
      }
      const totalQty =
        quality.goodCocoonQty +
        quality.afterScreenQty +
        quality.damagedCocoonQty +
        quality.doubleCocoonQty +
        quality.thinCocoonQty +
        quality.flossQty
      if (totalQty <= 0) {
        throw new ApiError(422, 'ต้องระบุจำนวนรังอย่างน้อย 1 ประเภทก่อนออกใบคิว')
      }

      counters.queue += 1
      repo.saveCounter('queue', counters.queue)
      ticket.queueNo = counters.queue
      ticket.status = 'WAITING_WEIGH'
      ticket.issuedAt = nowIso()
      // Issuing the slip locks the sorting result; it is now a printed document.
      quality.confirmed = true
      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'ISSUE_QUEUE_SLIP',
        entity: 'Queue',
        entityId: queueId,
        reference: `คิว ${ticket.queueNo}`,
      })
      return delay(persistTicket(ticket), 500)
    },
    async callQueue(queueId) {
      const ticket = requireTicket(queueId)
      if (!['WAITING_WEIGH', 'CALLED'].includes(ticket.status)) {
        throw new ApiError(409, 'คิวนี้ไม่อยู่ในสถานะที่เรียกชั่งได้')
      }
      ticket.status = 'CALLED'
      ticket.calledAt = nowIso()
      ticket.counter = ticket.counter ?? 'จุดชั่งที่ 1'
      return delay(persistTicket(ticket), 350)
    },
    async recallQueue(queueId) {
      const ticket = requireTicket(queueId)
      ticket.calledAt = nowIso()
      return delay(persistTicket(ticket), 300)
    },
    async startWeighing(queueId) {
      const ticket = requireTicket(queueId)
      if (!['CALLED', 'WAITING_WEIGH'].includes(ticket.status)) {
        throw new ApiError(409, 'ต้องออกใบคิวและเรียกคิวก่อนจึงจะเริ่มชั่งได้')
      }
      ticket.status = 'WEIGHING'
      ticket.startedWeighingAt = nowIso()
      if (!freshSlips.has(queueId)) {
        const slip = emptyFreshSlip(queueId)
        freshSlips.set(queueId, slip)
        saveFreshSlip(slip)
      }
      if (!shellSlips.has(queueId)) {
        const slip = emptyShellSlip(queueId)
        shellSlips.set(queueId, slip)
        saveShellSlip(slip)
      }
      return delay(persistTicket(ticket), 350)
    },
    async cancelQueue(queueId, reason) {
      const ticket = requireTicket(queueId)
      if (ticket.status === 'COMPLETED') {
        throw new ApiError(409, 'คิวที่ปิดรายการแล้วไม่สามารถยกเลิกได้')
      }
      ticket.status = 'CANCELLED'
      ticket.remark = [ticket.remark, `ยกเลิก: ${reason}`].filter(Boolean).join(' | ')
      clearImportForQueue(queueId)
      return delay(persistTicket(ticket), 350)
    },

    async getFreshWeighSlip(queueId) {
      requireTicket(queueId)
      const slip = freshSlips.get(queueId) ?? emptyFreshSlip(queueId)
      freshSlips.set(queueId, slip)
      return delay(slip)
    },
    async addWeighBag(queueId, payload: WeighBagPayload) {
      const ticket = requireTicket(queueId)
      const current = freshSlips.get(queueId) ?? emptyFreshSlip(queueId)
      if (current.locked) {
        throw new ApiError(409, 'ใบชั่งถูกล็อกแล้ว ต้องมีสิทธิ์ override จึงจะแก้ไขได้')
      }
      if (!(payload.weightKg > 0)) {
        throw new ApiError(422, 'น้ำหนักถุงต้องมากกว่า 0', undefined, {
          weightKg: ['น้ำหนักถุงต้องมากกว่า 0'],
        })
      }
      const next = recalcFreshSlip(
        {
          ...current,
          lines: [
            ...current.lines,
            {
              id: `${queueId}-B${current.lines.length + 1}-${Date.now()}`,
              seq: current.lines.length + 1,
              grade: payload.grade,
              weightKg: Math.round(payload.weightKg * 100) / 100,
            },
          ],
          source: payload.source,
          weighedAt: nowIso(),
          weighedBy: actor()?.displayName ?? 'ระบบ',
        },
        ticket.expectedBoxes,
      )
      freshSlips.set(queueId, next)
      saveFreshSlip(next)
      return delay(next, 300)
    },
    async removeWeighBag(queueId, lineId) {
      const ticket = requireTicket(queueId)
      const current = freshSlips.get(queueId)
      if (!current) throw new ApiError(404, 'ไม่พบใบชั่งน้ำหนัก')
      if (current.locked) throw new ApiError(409, 'ใบชั่งถูกล็อกแล้ว')
      const next = recalcFreshSlip(
        { ...current, lines: current.lines.filter((l) => l.id !== lineId) },
        ticket.expectedBoxes,
      )
      freshSlips.set(queueId, next)
      saveFreshSlip(next)
      return delay(next, 280)
    },
    async lockFreshWeighSlip(queueId) {
      requireTicket(queueId)
      const slip = freshSlips.get(queueId)
      if (!slip || slip.lines.length === 0) {
        throw new ApiError(422, 'ต้องชั่งอย่างน้อย 1 ถุงก่อนจึงจะล็อกใบชั่งได้')
      }
      slip.locked = true
      saveFreshSlip(slip)
      return delay(slip, 400)
    },
    async unlockFreshWeighSlip(queueId, reason) {
      const slip = freshSlips.get(queueId)
      if (!slip) throw new ApiError(404, 'ไม่พบใบชั่งน้ำหนัก')
      slip.locked = false
      saveFreshSlip(slip)
      logUnlock(queueId, reason, 'FreshWeighSlip')
      return delay(slip, 400)
    },

    async getShellWeighSlip(queueId) {
      requireTicket(queueId)
      const slip = shellSlips.get(queueId) ?? emptyShellSlip(queueId)
      shellSlips.set(queueId, slip)
      return delay(slip)
    },
    async saveShellWeighSlip(queueId, payload: ShellWeighPayload) {
      requireTicket(queueId)
      const current = shellSlips.get(queueId) ?? emptyShellSlip(queueId)
      if (current.locked) throw new ApiError(409, 'ใบชั่งเปลือกรังถูกล็อกแล้ว')
      if (
        payload.shellWeightG != null &&
        payload.sampleCocoonWeightG != null &&
        payload.shellWeightG > payload.sampleCocoonWeightG
      ) {
        throw new ApiError(422, 'น้ำหนักเปลือกรังต้องไม่เกินน้ำหนักรังรวม', undefined, {
          shellWeightG: ['ต้องไม่เกิน นน.รังรวม'],
        })
      }
      // %เปลือกรัง is a backend result — the station only sends what it read.
      const next = recalcShellSlip({
        ...current,
        ...payload,
        weighedAt: nowIso(),
        weighedBy: actor()?.displayName ?? 'ระบบ',
      })
      shellSlips.set(queueId, next)
      saveShellSlip(next)
      return delay(next, 400)
    },
    async lockShellWeighSlip(queueId) {
      requireTicket(queueId)
      const slip = shellSlips.get(queueId)
      if (!slip || slip.shellPercent == null) {
        throw new ApiError(422, 'ต้องบันทึกตัวอย่างรังและน้ำหนักเปลือกรังก่อนจึงจะล็อกได้')
      }
      slip.locked = true
      saveShellSlip(slip)
      return delay(slip, 400)
    },
    async unlockShellWeighSlip(queueId, reason) {
      const slip = shellSlips.get(queueId)
      if (!slip) throw new ApiError(404, 'ไม่พบใบชั่งเปลือกรัง')
      slip.locked = false
      saveShellSlip(slip)
      logUnlock(queueId, reason, 'ShellWeighSlip')
      return delay(slip, 400)
    },

    async getQuality(queueId) {
      requireTicket(queueId)
      const quality: ReceivingQuality = qualities.get(queueId) ?? {
        queueId,
        goodCocoonQty: 0,
        afterScreenQty: 0,
        damagedCocoonQty: 0,
        doubleCocoonQty: 0,
        thinCocoonQty: 0,
        flossQty: 0,
        confirmed: false,
      }
      return delay(quality)
    },
    async saveQuality(queueId, payload: QualityPayload) {
      requireTicket(queueId)
      const current = qualities.get(queueId)
      if (current?.confirmed) {
        throw new ApiError(409, 'ข้อมูลคุณภาพถูกยืนยันแล้ว')
      }
      if (payload.moisturePercent != null && (payload.moisturePercent < 0 || payload.moisturePercent > 100)) {
        throw new ApiError(422, 'ความชื้นต้องอยู่ระหว่าง 0–100%', undefined, {
          moisturePercent: ['ความชื้นต้องอยู่ระหว่าง 0–100%'],
        })
      }
      const next: ReceivingQuality = {
        ...payload,
        queueId,
        savedAt: nowIso(),
        confirmed: false,
      }
      qualities.set(queueId, next)
      saveQuality(next)
      return delay(next, 420)
    },
    async confirmQuality(queueId) {
      const ticket = requireTicket(queueId)
      const quality = qualities.get(queueId)
      if (!quality) throw new ApiError(422, 'ต้องบันทึกข้อมูลคุณภาพก่อน')
      const totalQty =
        quality.goodCocoonQty +
        quality.afterScreenQty +
        quality.damagedCocoonQty +
        quality.doubleCocoonQty +
        quality.thinCocoonQty +
        quality.flossQty
      if (totalQty <= 0) {
        throw new ApiError(422, 'ต้องระบุจำนวนรังอย่างน้อย 1 ประเภท')
      }
      quality.confirmed = true
      saveQuality(quality)
      purchases.set(queueId, buildPurchase(ticket))
      return delay(quality, 450)
    },

    async getPurchaseSummary(queueId) {
      const ticket = requireTicket(queueId)
      const summary: PurchaseSummary = purchases.get(queueId) ?? buildPurchase(ticket)
      purchases.set(queueId, summary)
      return delay(summary)
    },
    async completePurchase(queueId) {
      const ticket = requireTicket(queueId)
      const quality = qualities.get(queueId)
      if (!quality?.confirmed) {
        throw new ApiError(409, 'ต้องยืนยันข้อมูลคุณภาพก่อนปิดรายการ')
      }
      ticket.status = 'COMPLETED'
      ticket.completedAt = nowIso()
      const summary = { ...buildPurchase(ticket), status: 'COMPLETED' as const, completedAt: nowIso() }
      purchases.set(queueId, summary)
      saveQueueTicket(ticket)
      // ปิดการรับซื้อ = เกิดรายการค้างจ่ายให้เกษตรกรทันที
      syncPayment(queueId)
      return delay(summary, 550)
    },
  },

  /**
   * INT-001 — the Floor Weight Cocoon link.
   *
   * Reads only. The external system owns the weighing; ChunERP owns the
   * decision of which weighing belongs to which queue, and records that in its
   * own import log.
   */
  integration: {
    async floorWeightStatus() {
      await ensureSqlite()
      return delay(
        {
          connected: true,
          source: 'Floor Weight Cocoon',
          database: 'floorweight (SQLite) — ของจริงเป็น MSSQL',
          sessionCount: closedSessionCount(),
          lastCheckedAt: nowIso(),
        },
        200,
      )
    },
    async floorWeightLatestDate(farmerCode) {
      await ensureSqlite()
      return delay(latestWeighDate(farmerCode), 200)
    },
    async floorWeightSessions(query: FloorWeightQuery) {
      await ensureSqlite()
      if (!query.farmerCode) {
        throw new ApiError(422, 'ต้องระบุรหัสเกษตรกรเพื่อดึงข้อมูลการชั่ง', undefined, {
          farmerCode: ['ต้องระบุรหัสเกษตรกร'],
        })
      }
      // The import log lives on our side, so it is stitched on after the read.
      const sessions = findSessions(query).map((session) => {
        const imported = findImportBySession(session.sessionId)
        return {
          ...session,
          importedQueueId: imported?.queue_id,
          importedAt: imported?.imported_at,
        }
      })
      return delay(sessions, 520)
    },
    async importFloorWeight(queueId, sessionId) {
      await ensureSqlite()
      const ticket = requireTicket(queueId)
      const session = getSession(sessionId)
      if (!session) throw new ApiError(404, 'ไม่พบใบชั่งในระบบชั่งน้ำหนัก')
      if (session.status !== 'CLOSED') {
        throw new ApiError(409, 'ใบชั่งนี้ยังไม่ปิด ไม่สามารถดึงเข้าระบบได้')
      }
      if (session.farmerCode !== ticket.farmerCode) {
        throw new ApiError(422, 'ใบชั่งนี้เป็นของเกษตรกรรายอื่น')
      }

      // A session belongs to one queue only; pulling it twice would double the
      // weight on the second invoice.
      const claimed = findImportBySession(sessionId)
      if (claimed && claimed.queue_id !== queueId) {
        throw new ApiError(409, `ใบชั่งนี้ถูกดึงไปที่คิวอื่นแล้ว (${claimed.queue_id})`)
      }

      const current = freshSlips.get(queueId)
      if (current?.locked) {
        throw new ApiError(409, 'ใบชั่งถูกล็อกแล้ว ต้องปลดล็อกก่อนจึงจะดึงข้อมูลใหม่ได้')
      }

      const fresh = sessionToFreshSlip(session, queueId, ticket.expectedBoxes)
      const shell = sessionToShellSlip(session, queueId, shellSlips.get(queueId))

      freshSlips.set(queueId, fresh)
      shellSlips.set(queueId, shell)
      saveFreshSlip(fresh, session.sessionId)
      saveShellSlip(shell)
      recordImport(session, queueId, nowIso(), actor()?.displayName ?? 'ระบบ')

      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'IMPORT_FLOOR_WEIGHT',
        entity: 'FreshWeighSlip',
        entityId: queueId,
        reference: `${session.sessionNo} · ${session.bags.length} ถุง · ${session.totalWeightKg} กก.`,
      })

      return delay({ fresh, shell }, 640)
    },
  },

  debts: {
    async list(params) {
      let items = debts.filter(
        (d) =>
          matches([d.farmerName, d.farmerCode, d.sourceNo, d.batchNo], params.search) &&
          (!params.branchId || params.branchId === 'ALL' || d.branchId === params.branchId) &&
          (!params.status || d.status === params.status) &&
          (!params.farmerId || d.farmerId === params.farmerId) &&
          (!params.batchNo || d.batchNo === params.batchNo) &&
          withinRange(d.createdAt, params.dateFrom, params.dateTo),
      )
      items = sortBy(items, params.sortBy ?? 'createdAt', params.sortDir ?? 'desc')
      return delay(paginate(items, params))
    },
    async get(id) {
      const debt = debts.find((d) => d.id === id)
      if (!debt) throw new ApiError(404, 'ไม่พบรายการหนี้')
      return delay(debt)
    },
    async deductionSources(id) {
      const debt = requireDebt(id)
      return delay(sourcesForDebt(debt.id), 280)
    },
    async previewDeduction(id, payload: DeductionPayload) {
      const debt = requireDebt(id)
      const source = requireSource(debt.id, payload.purchaseId)
      // The ceiling is the invoice's own รวมรายได้ that is still unapplied,
      // never more than what this round still owes (§7.9).
      const ceiling = Math.min(debt.remainingBalance, source.availableAmount)
      if (payload.currentDeduction <= 0) {
        throw new ApiError(422, 'จำนวนที่ตัดต้องมากกว่า 0', undefined, {
          currentDeduction: ['จำนวนที่ตัดต้องมากกว่า 0'],
        })
      }
      if (payload.currentDeduction > ceiling) {
        throw new ApiError(422, 'จำนวนที่ตัดเกินสิทธิ์ที่อนุญาต', undefined, {
          currentDeduction: [`ตัดได้สูงสุด ฿${ceiling.toLocaleString('th-TH')}`],
        })
      }

      const warnings: string[] = []
      if (payload.currentDeduction === ceiling) {
        warnings.push('ตัดเต็มยอดรายได้ที่ใบรับซื้อนี้เหลืออยู่')
      }
      if (debt.remainingBalance - payload.currentDeduction <= 0) {
        warnings.push('การตัดครั้งนี้จะปิดยอดหนี้ของรอบนี้ทั้งหมด')
      }

      return delay(
        {
          debtId: id,
          currentDeduction: payload.currentDeduction,
          remainingBalance: round2(debt.remainingBalance - payload.currentDeduction),
          sourceRemaining: round2(source.availableAmount - payload.currentDeduction),
          netPayable: round2(source.availableAmount - payload.currentDeduction),
          warnings,
        },
        350,
      )
    },
    async confirmDeduction(id, payload, idempotencyKey) {
      if (seenIdempotencyKeys.has(idempotencyKey)) {
        throw new ApiError(409, 'รายการนี้ถูกบันทึกไปแล้ว')
      }
      const index = debts.findIndex((d) => d.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบรายการหนี้')
      const debt = debts[index]
      if (debt.status === 'HOLD') {
        throw new ApiError(409, 'รายการหนี้นี้ถูกพักไว้ ไม่สามารถตัดได้')
      }
      const source = requireSource(debt.id, payload.purchaseId)
      const ceiling = Math.min(debt.remainingBalance, source.availableAmount)
      if (payload.currentDeduction <= 0 || payload.currentDeduction > ceiling) {
        throw new ApiError(422, 'จำนวนที่ตัดเกินสิทธิ์ที่อนุญาต')
      }
      seenIdempotencyKeys.add(idempotencyKey)

      const deduction: DebtDeduction = {
        id: `DD-${Date.now()}`,
        debtId: debt.id,
        purchaseId: source.purchaseId,
        transactionNo: source.transactionNo,
        amount: payload.currentDeduction,
        at: nowIso(),
        actorName: actor()?.displayName ?? 'ระบบ',
        remark: payload.remark,
      }
      debtDeductions.unshift(deduction)
      saveDeduction(deduction)

      const remaining = round2(debt.remainingBalance - payload.currentDeduction)
      debts[index] = {
        ...debt,
        deductedAmount: round2(debt.deductedAmount + payload.currentDeduction),
        remainingBalance: remaining,
        status: remaining <= 0 ? 'SETTLED' : 'PARTIAL',
        remark: payload.remark ?? debt.remark,
        updatedAt: nowIso(),
      }
      saveDebt(debts[index])
      refreshFarmerDebt(debt.farmerId)

      // The invoice carries its own ตัดหนี้ / คงเหลือจ่าย, so rebuild it —
      // and the pay-out that hangs off it moves by the same amount.
      const ticket = queueTickets.find((t) => `PU-${t.id}` === source.purchaseId)
      if (ticket) {
        purchases.set(ticket.id, buildPurchase(ticket))
        syncPayment(ticket.id)
      }

      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'CONFIRM_DEDUCTION',
        entity: 'Debt',
        entityId: id,
        reference: `${source.transactionNo} · รอบ ${debt.batchNo}`,
        before: { remainingBalance: debt.remainingBalance },
        after: { remainingBalance: remaining },
      })
      return delay(debts[index], 600)
    },
    async deductions(id) {
      const items = debtDeductions
        .filter((d) => d.debtId === id)
        .sort((x, y) => y.at.localeCompare(x.at))
      return delay(items, 250)
    },
    async auditTrail(id) {
      const items = auditEntries.filter((a) => a.entityId === id || a.entity === 'Debt').slice(0, 20)
      return delay(items)
    },

    async pendingExport(kind) {
      requirePermission('debt:export', 'คุณไม่มีสิทธิ์ส่งออกข้อมูลไประบบบัญชี')
      return delay(pendingRows(kind), 280)
    },

    async exportToAccounting(kind, ids) {
      requirePermission('debt:export', 'คุณไม่มีสิทธิ์ส่งออกข้อมูลไประบบบัญชี')
      if (ids.length === 0) {
        throw new ApiError(422, 'ยังไม่ได้เลือกรายการที่จะส่งออก')
      }

      const at = nowIso()
      counters.exportBatch += 1
      repo.saveCounter('exportBatch', counters.exportBatch)
      const batchNo = `BX-2569-${String(counters.exportBatch).padStart(4, '0')}`

      const rows: ExportRow[] = []
      let total = 0

      // Every row is checked before any row is stamped: a half-written batch
      // would leave accounting with a file that does not match our ledger.
      if (kind === 'DEBT') {
        const picked = ids.map((id) => {
          const debt = debts.find((d) => d.id === id)
          if (!debt) throw new ApiError(404, `ไม่พบรายการหนี้ ${id}`)
          if (debt.exportedAt) {
            throw new ApiError(409, `${debt.sourceNo} ส่งออกไปแล้วในชุด ${debt.exportBatchNo}`)
          }
          return debt
        })
        for (const debt of picked) {
          const booking = bookings.find((b) => b.id === debt.sourceId)
          rows.push(...debtRows(debt, booking))
          total = round2(total + debt.originalAmount)
          debt.exportedAt = at
          debt.exportBatchNo = batchNo
          debt.updatedAt = at
          saveDebt(debt)
        }
      } else if (kind === 'PURCHASE') {
        const picked = ids.map((id) => {
          const ticket = queueTickets.find((t) => t.id === id)
          const purchase = purchases.get(id)
          if (!ticket || !purchase) throw new ApiError(404, `ไม่พบใบรับซื้อ ${id}`)
          if (purchase.status !== 'COMPLETED') {
            throw new ApiError(409, `${purchase.transactionNo} ยังไม่ได้ปิดรายการรับซื้อ`)
          }
          if (ticket.exportedAt) {
            throw new ApiError(
              409,
              `${purchase.transactionNo} ส่งออกไปแล้วในชุด ${ticket.exportBatchNo}`,
            )
          }
          return { ticket, purchase }
        })
        for (const { ticket, purchase } of picked) {
          rows.push(...purchaseRows(purchase))
          total = round2(total + purchase.grossAmount)
          ticket.exportedAt = at
          ticket.exportBatchNo = batchNo
          saveQueueTicket(ticket)
          purchases.set(ticket.id, buildPurchase(ticket))
        }
      } else if (kind === 'DEDUCTION') {
        const picked = ids.map((id) => {
          const entry = debtDeductions.find((x) => x.id === id)
          if (!entry) throw new ApiError(404, `ไม่พบรายการตัดหนี้ ${id}`)
          if (entry.exportedAt) {
            throw new ApiError(409, `รายการตัดหนี้ ${id} ส่งออกไปแล้วในชุด ${entry.exportBatchNo}`)
          }
          const debt = debts.find((d) => d.id === entry.debtId)
          if (!debt) throw new ApiError(404, `ไม่พบรายการหนี้ของ ${id}`)
          return { entry, debt }
        })
        for (const { entry, debt } of picked) {
          rows.push(...deductionRows(entry, debt))
          total = round2(total + entry.amount)
          entry.exportedAt = at
          entry.exportBatchNo = batchNo
          saveDeduction(entry)
        }
      } else {
        const picked = ids.map((id) => {
          const payment = requirePayment(id)
          if (payment.status !== 'PAID') {
            throw new ApiError(409, `${payment.paymentNo} ยังไม่ได้จ่ายเงิน จึงยังส่งออกไม่ได้`)
          }
          if (payment.exportedAt) {
            throw new ApiError(
              409,
              `${payment.paymentNo} ส่งออกไปแล้วในชุด ${payment.exportBatchNo}`,
            )
          }
          return payment
        })
        for (const payment of picked) {
          rows.push(...paymentRows(payment))
          total = round2(total + payment.netAmount)
          payment.exportedAt = at
          payment.exportBatchNo = batchNo
          payment.updatedAt = at
          savePayment(payment)
        }
      }

      const batch: ExportBatch = {
        batchNo,
        kind,
        target: 'BPLUS',
        fileName: fileNameFor(kind, batchNo),
        rowCount: ids.length,
        totalAmount: total,
        exportedAt: at,
        exportedBy: actor()?.displayName ?? 'ระบบ',
      }
      exportBatches.unshift(batch)
      saveExportBatch(batch)

      pushAudit({
        id: `A-${Date.now()}`,
        at,
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'EXPORT_ACCOUNTING',
        entity: 'ExportBatch',
        entityId: batchNo,
        reference: `${batch.fileName} · ${ids.length} รายการ`,
        after: { kind, rowCount: ids.length, totalAmount: total },
      })

      const result: ExportResult = { batch, content: toCsv(kind, rows) }
      return delay(result, 650)
    },

    async exportHistory() {
      requirePermission('debt:export', 'คุณไม่มีสิทธิ์ดูประวัติการส่งออก')
      return delay([...exportBatches], 250)
    },
  },

  /**
   * PAY-001 — จ่ายส่วนต่างให้เกษตรกร.
   *
   * The row is created by the purchase, not by this service: what the farmer is
   * owed is decided by the invoice and the debt ledger. All that happens here
   * is the handover — method, date, reference — and the record of who did it.
   */
  payments: {
    async list(params) {
      let items = payments.filter(
        (x) =>
          matches([x.paymentNo, x.transactionNo, x.farmerName, x.farmerCode], params.search) &&
          (!params.branchId || params.branchId === 'ALL' || x.branchId === params.branchId) &&
          (!params.status || x.status === (params.status as PaymentStatus)) &&
          (!params.farmerId || x.farmerId === params.farmerId) &&
          withinRange(x.paidDate ?? x.createdAt, params.dateFrom, params.dateTo),
      )
      items = sortBy(items, params.sortBy ?? 'createdAt', params.sortDir ?? 'desc')
      return delay(paginate(items, params))
    },
    async get(id) {
      return delay(requirePayment(id))
    },
    async forPurchase(purchaseId) {
      return delay(payments.find((x) => x.purchaseId === purchaseId) ?? null, 200)
    },
    async pay(id, payload: PaymentPayload, idempotencyKey) {
      requirePermission('payment:pay', 'คุณไม่มีสิทธิ์บันทึกการจ่ายเงินให้เกษตรกร')
      if (seenIdempotencyKeys.has(idempotencyKey)) {
        throw new ApiError(409, 'รายการนี้ถูกบันทึกไปแล้ว')
      }
      const payment = requirePayment(id)
      if (payment.status === 'PAID') {
        throw new ApiError(409, `${payment.paymentNo} จ่ายเงินไปแล้วเมื่อ ${payment.paidDate}`)
      }
      if (payment.status === 'CANCELLED') {
        throw new ApiError(409, 'รายการนี้ถูกยกเลิกแล้ว')
      }

      // หักหนี้ก่อนจ่าย: paying while this invoice could still settle the round
      // hands the farmer money the company is about to ask back for.
      const purchase = purchases.get(payment.purchaseId.replace(/^PU-/, ''))
      const stillDeductible = purchase?.debtPreview?.eligibleDeduction ?? 0
      if (stillDeductible > 0) {
        throw new ApiError(
          409,
          `ยังมีหนี้รอบนี้ที่ตัดได้อีก ฿${stillDeductible.toLocaleString('th-TH')} — ต้องตัดหนี้ก่อนจ่ายเงิน`,
        )
      }
      if (payment.netAmount <= 0) {
        throw new ApiError(409, 'ยอดจ่ายสุทธิเป็นศูนย์ ไม่ต้องจ่ายเงินให้เกษตรกร')
      }
      if (payload.method === 'BANK_TRANSFER' && !payload.bankName) {
        throw new ApiError(422, 'การโอนเงินต้องระบุธนาคาร', undefined, {
          bankName: ['ต้องระบุธนาคารที่โอนเข้า'],
        })
      }
      seenIdempotencyKeys.add(idempotencyKey)

      Object.assign(payment, {
        status: 'PAID' as const,
        method: payload.method,
        paidDate: payload.paidDate,
        bankName: payload.bankName,
        accountNo: payload.accountNo,
        transferRef: payload.transferRef,
        remark: payload.remark,
        paidBy: actor()?.id,
        paidByName: actor()?.displayName ?? 'ระบบ',
        updatedAt: nowIso(),
      })
      savePayment(payment)

      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'PAY_FARMER',
        entity: 'FarmerPayment',
        entityId: payment.id,
        reference: `${payment.paymentNo} · ${payment.farmerName}`,
        after: { netAmount: payment.netAmount, method: payload.method },
      })
      return delay(payment, 600)
    },
    async cancel(id, reason) {
      requirePermission('payment:pay', 'คุณไม่มีสิทธิ์ยกเลิกรายการจ่ายเงิน')
      const payment = requirePayment(id)
      if (payment.status === 'PAID') {
        throw new ApiError(409, 'จ่ายเงินไปแล้ว ต้องทำใบลดหนี้ที่ระบบบัญชีแทน')
      }
      payment.status = 'CANCELLED'
      payment.remark = reason
      payment.updatedAt = nowIso()
      savePayment(payment)
      return delay(payment, 400)
    },
  },

  expenses: {
    async list(params) {
      let items = expenses.filter(
        (e) =>
          matches([e.expenseNo, e.description, e.vendor, e.referenceNo], params.search) &&
          (!params.branchId || params.branchId === 'ALL' || e.branchId === params.branchId) &&
          (!params.status || e.status === params.status) &&
          (!params.categoryId || e.categoryId === params.categoryId) &&
          (!params.createdBy || e.createdBy === params.createdBy) &&
          withinRange(e.expenseDate, params.dateFrom, params.dateTo),
      )
      items = sortBy(items, params.sortBy ?? 'expenseDate', params.sortDir ?? 'desc')
      return delay(paginate(items, params))
    },
    async get(id) {
      const expense = expenses.find((e) => e.id === id)
      if (!expense) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')
      return delay(expense)
    },
    async create(payload: ExpensePayload) {
      const branch = BRANCHES.find((b) => b.id === payload.branchId)
      const category = expenseCategoryMasters.find((c) => c.id === payload.categoryId)
      const type = category?.types.find((t) => t.id === payload.expenseTypeId)
      counters.expense += 1
      repo.saveCounter('expense', counters.expense)
      const expense: Expense = {
        id: `E-${String(counters.expense).padStart(4, '0')}`,
        expenseNo: `EX-2569-${String(counters.expense).padStart(4, '0')}`,
        ...payload,
        branchName: branch?.name ?? '-',
        categoryName: category?.name ?? '-',
        expenseTypeName: type?.name,
        // §8.4 — Amount is always Quantity × Unit Price, computed server-side.
        amount: Math.round(payload.quantity * payload.unitPrice * 100) / 100,
        attachments: [],
        createdBy: actor()?.id ?? 'U-001',
        createdByName: actor()?.displayName ?? 'ระบบ',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      expenses.unshift(expense)
      repo.saveExpense(expense)
      return delay(expense, 550)
    },
    async update(id, payload) {
      const index = expenses.findIndex((e) => e.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')
      const current = expenses[index]
      if (['APPROVED', 'CANCELLED'].includes(current.status)) {
        throw new ApiError(409, 'รายการที่อนุมัติหรือยกเลิกแล้วไม่สามารถแก้ไขได้')
      }
      const branch = BRANCHES.find((b) => b.id === payload.branchId)
      const category = expenseCategoryMasters.find((c) => c.id === payload.categoryId)
      const type = category?.types.find((t) => t.id === payload.expenseTypeId)
      expenses[index] = {
        ...current,
        ...payload,
        branchName: branch?.name ?? current.branchName,
        categoryName: category?.name ?? current.categoryName,
        expenseTypeName: type?.name,
        amount: Math.round(payload.quantity * payload.unitPrice * 100) / 100,
        updatedAt: nowIso(),
      }
      repo.saveExpense(expenses[index])
      return delay(expenses[index], 550)
    },
    async cancel(id, reason) {
      const index = expenses.findIndex((e) => e.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')
      if (expenses[index].status === 'APPROVED') {
        throw new ApiError(409, 'รายการที่อนุมัติแล้วไม่สามารถยกเลิกได้')
      }
      expenses[index] = {
        ...expenses[index],
        status: 'CANCELLED',
        remark: [expenses[index].remark, `ยกเลิก: ${reason}`].filter(Boolean).join(' | '),
        updatedAt: nowIso(),
      }
      repo.saveExpense(expenses[index])
      return delay(expenses[index], 400)
    },
    async approve(id, remark) {
      requirePermission('expense:approve', 'ต้องมีสิทธิ์อนุมัติค่าใช้จ่ายจึงจะทำรายการนี้ได้')
      const index = requireSubmittedExpense(id, 'อนุมัติ')
      const before = expenses[index]
      expenses[index] = {
        ...before,
        status: 'APPROVED',
        approvedBy: actor()?.id,
        approvedByName: actor()?.displayName,
        approvedAt: nowIso(),
        rejectedReason: undefined,
        remark: remark ? [before.remark, `อนุมัติ: ${remark}`].filter(Boolean).join(' | ') : before.remark,
        updatedAt: nowIso(),
      }
      repo.saveExpense(expenses[index])
      logExpenseDecision(id, 'APPROVE_EXPENSE', before, expenses[index], remark)
      return delay(expenses[index], 500)
    },
    async reject(id, reason) {
      requirePermission('expense:approve', 'ต้องมีสิทธิ์อนุมัติค่าใช้จ่ายจึงจะทำรายการนี้ได้')
      if (!reason?.trim()) {
        throw new ApiError(422, 'ต้องระบุเหตุผลที่ไม่อนุมัติ', undefined, {
          reason: ['ต้องระบุเหตุผลที่ไม่อนุมัติ'],
        })
      }
      const index = requireSubmittedExpense(id, 'ไม่อนุมัติ')
      const before = expenses[index]
      expenses[index] = {
        ...before,
        status: 'REJECTED',
        // The submitter has to be able to fix it, so the reason is a field of
        // its own rather than something buried in the remark.
        rejectedReason: reason.trim(),
        approvedBy: actor()?.id,
        approvedByName: actor()?.displayName,
        approvedAt: nowIso(),
        updatedAt: nowIso(),
      }
      repo.saveExpense(expenses[index])
      logExpenseDecision(id, 'REJECT_EXPENSE', before, expenses[index], reason.trim())
      return delay(expenses[index], 500)
    },
    async duplicate(id) {
      const source = expenses.find((e) => e.id === id)
      if (!source) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')
      counters.expense += 1
      repo.saveCounter('expense', counters.expense)
      const copy: Expense = {
        ...source,
        id: `E-${String(counters.expense).padStart(4, '0')}`,
        expenseNo: `EX-2569-${String(counters.expense).padStart(4, '0')}`,
        status: 'DRAFT',
        attachments: [],
        createdAt: nowIso(),
        updatedAt: nowIso(),
      }
      expenses.unshift(copy)
      repo.saveExpense(copy)
      return delay(copy, 450)
    },
    async categories() {
      const list = expenseCategoryMasters
        .filter((c) => c.active)
        .map((c) => ({
          id: c.id,
          name: c.name,
          types: c.types.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name })),
        }))
      return delay(list, 180)
    },
    async uploadAttachment(id, file, onProgress) {
      const expense = expenses.find((e) => e.id === id)
      if (!expense) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')

      for (let p = 0; p <= 100; p += 20) {
        await delay(null, 90)
        onProgress?.(p)
      }
      // Deterministic failure so the per-file error path stays testable.
      if (file.name.toLowerCase().includes('fail')) {
        throw new ApiError(422, `อัปโหลด ${file.name} ไม่สำเร็จ`)
      }
      const attachment = {
        id: `AT-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
        url: URL.createObjectURL(file),
        uploadedAt: nowIso(),
        uploadedBy: actor()?.displayName ?? 'ระบบ',
      }
      expense.attachments = [...expense.attachments, attachment]
      repo.saveExpense(expense)
      return attachment
    },
    async removeAttachment(id, attachmentId) {
      const expense = expenses.find((e) => e.id === id)
      if (!expense) throw new ApiError(404, 'ไม่พบรายการค่าใช้จ่าย')
      expense.attachments = expense.attachments.filter((a) => a.id !== attachmentId)
      repo.saveExpense(expense)
      await delay(null, 250)
    },
    async auditTrail(id) {
      return delay(auditEntries.filter((a) => a.entity === 'Expense' || a.entityId === id).slice(0, 15))
    },
  },

  products: {
    async list(params) {
      let items = products.filter(
        (p) =>
          matches([p.code, p.name, p.unitName, p.warehouseName], params.search) &&
          (!params.kind || p.kind === params.kind) &&
          (!params.status || String(p.active) === params.status),
      )
      items = sortBy(items, params.sortBy ?? 'code', params.sortDir ?? 'asc')
      return delay(paginate(items, params))
    },
    async get(id) {
      const product = products.find((p) => p.id === id)
      if (!product) throw new ApiError(404, 'ไม่พบสินค้า')
      return delay(product)
    },
    /** Only what a document may legitimately charge for. */
    async sellable(query) {
      const items = products
        .filter((p) => p.active && p.currentPrice != null && matches([p.code, p.name], query))
        .slice(0, 50)
      return delay(items, 220)
    },
    async create(payload) {
      if (products.some((p) => p.code.toLowerCase() === payload.code.trim().toLowerCase())) {
        throw new ApiError(422, 'รหัสสินค้านี้ถูกใช้แล้ว', undefined, {
          code: ['รหัสสินค้านี้ถูกใช้แล้ว'],
        })
      }
      const unit = productUnits.find((u) => u.id === payload.unitId)
      if (!unit) throw new ApiError(422, 'ไม่พบหน่วยนับ', undefined, { unitId: ['กรุณาเลือกหน่วยนับ'] })
      const warehouse = warehouses.find((w) => w.id === payload.warehouseId)
      counters.product += 1
      repo.saveCounter('product', counters.product)
      const product: Product = {
        id: `P-${String(counters.product).padStart(4, '0')}`,
        ...payload,
        unitName: unit.name,
        warehouseName: warehouse?.name,
        // A new product has no price until one is added to the price list.
        currentPrice: null,
        updatedAt: nowIso(),
      }
      products.push(product)
      repo.saveProduct(product, nowIso())
      return delay(product, 450)
    },
    async update(id, payload) {
      const index = products.findIndex((p) => p.id === id)
      if (index < 0) throw new ApiError(404, 'ไม่พบสินค้า')
      if (
        products.some(
          (p) => p.id !== id && p.code.toLowerCase() === payload.code.trim().toLowerCase(),
        )
      ) {
        throw new ApiError(422, 'รหัสสินค้านี้ถูกใช้แล้ว', undefined, {
          code: ['รหัสสินค้านี้ถูกใช้แล้ว'],
        })
      }
      const unit = productUnits.find((u) => u.id === payload.unitId)
      const warehouse = warehouses.find((w) => w.id === payload.warehouseId)
      products[index] = {
        ...products[index],
        ...payload,
        unitName: unit?.name ?? products[index].unitName,
        warehouseName: warehouse?.name,
        updatedAt: nowIso(),
      }
      repo.saveProduct(products[index], nowIso())
      return delay(products[index], 450)
    },

    async units() {
      return delay(productUnits, 200)
    },
    async saveUnit(id, payload) {
      if (id) {
        const index = productUnits.findIndex((u) => u.id === id)
        if (index < 0) throw new ApiError(404, 'ไม่พบหน่วยนับ')
        productUnits[index] = { ...productUnits[index], ...payload }
        repo.saveProductUnit(productUnits[index])
        return delay(productUnits[index], 350)
      }
      if (productUnits.some((u) => u.code.toLowerCase() === payload.code.trim().toLowerCase())) {
        throw new ApiError(422, 'รหัสหน่วยนับนี้ถูกใช้แล้ว', undefined, {
          code: ['รหัสหน่วยนับนี้ถูกใช้แล้ว'],
        })
      }
      const unit: ProductUnit = { id: `UN-${Date.now()}`, ...payload }
      productUnits.push(unit)
      repo.saveProductUnit(unit)
      return delay(unit, 350)
    },

    async prices(params) {
      let items = productPrices.filter(
        (p) =>
          matches([p.productCode, p.productName], params.search) &&
          (!params.productId || p.productId === params.productId),
      )
      items = sortBy(items, params.sortBy ?? 'effectiveFrom', params.sortDir ?? 'desc')
      return delay(paginate(items, params))
    },
    /**
     * Adding a price closes the row it supersedes rather than overwriting it,
     * so what a farmer was charged last month stays reconstructable.
     */
    async savePrice(payload) {
      const product = products.find((p) => p.id === payload.productId)
      if (!product) throw new ApiError(404, 'ไม่พบสินค้า')
      if (payload.price < 0) {
        throw new ApiError(422, 'ราคาต้องไม่ติดลบ', undefined, { price: ['ราคาต้องไม่ติดลบ'] })
      }

      const previous = effectivePrice(product.id)
      if (previous) {
        previous.current = false
        previous.effectiveTo = payload.effectiveFrom
        previous.updatedAt = nowIso()
      }

      counters.price += 1
      repo.saveCounter('price', counters.price)
      const price: ProductPrice = {
        id: `PP-${String(counters.price).padStart(4, '0')}`,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        unitName: product.unitName,
        price: payload.price,
        effectiveFrom: payload.effectiveFrom,
        effectiveTo: payload.effectiveTo,
        current: true,
        note: payload.note,
        updatedAt: nowIso(),
      }
      productPrices.unshift(price)
      product.currentPrice = payload.price
      product.updatedAt = nowIso()

      for (const row of productPrices.filter((r) => r.productId === product.id)) {
        repo.saveProductPrice(row, actor()?.id)
      }
      repo.saveProduct(product, nowIso())

      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-000',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'UPDATE_PRODUCT_PRICE',
        entity: 'ProductPrice',
        entityId: product.id,
        reference: product.code,
        before: previous ? { price: previous.price } : undefined,
        after: { price: payload.price },
      })
      return delay(price, 450)
    },

    async warehouses() {
      return delay(warehouses, 200)
    },
    async saveWarehouse(id, payload) {
      const branch = BRANCHES.find((b) => b.id === payload.branchId)
      if (!branch) throw new ApiError(422, 'ไม่พบสาขา', undefined, { branchId: ['กรุณาเลือกสาขา'] })
      if (id) {
        const index = warehouses.findIndex((w) => w.id === id)
        if (index < 0) throw new ApiError(404, 'ไม่พบคลัง')
        warehouses[index] = { ...warehouses[index], ...payload, branchName: branch.name }
        repo.saveWarehouse(warehouses[index])
        return delay(warehouses[index], 350)
      }
      if (warehouses.some((w) => w.code.toLowerCase() === payload.code.trim().toLowerCase())) {
        throw new ApiError(422, 'รหัสคลังนี้ถูกใช้แล้ว', undefined, {
          code: ['รหัสคลังนี้ถูกใช้แล้ว'],
        })
      }
      const warehouse: Warehouse = {
        id: `WH-${Date.now()}`,
        ...payload,
        branchName: branch.name,
      }
      warehouses.push(warehouse)
      repo.saveWarehouse(warehouse)
      return delay(warehouse, 350)
    },
  },

  master: {
    async branches(includeInactive) {
      return delay(branchMasters.filter((b) => includeInactive || b.active), 180)
    },
    async saveBranch(id, payload) {
      return delay(
        upsertMaster(branchMasters, id, payload, 'BR', 'สาขา', repo.saveBranch),
        350,
      )
    },

    async projects(includeInactive) {
      return delay(projectMasters.filter((p) => includeInactive || p.active), 180)
    },
    async saveProject(id, payload) {
      return delay(
        upsertMaster(projectMasters, id, payload, 'PJ', 'โครงการ', repo.saveProject),
        350,
      )
    },

    async banks(includeInactive) {
      return delay(bankMasters.filter((b) => includeInactive || b.active), 180)
    },
    async saveBank(id, payload) {
      return delay(upsertMaster(bankMasters, id, payload, 'BK', 'ธนาคาร', repo.saveBank), 350)
    },

    async expenseCategories(includeInactive) {
      const list = expenseCategoryMasters
        .filter((c) => includeInactive || c.active)
        .map((c) => ({ ...c, types: c.types.filter((t) => includeInactive || t.active) }))
      return delay(list, 200)
    },
    async saveExpenseCategory(id, payload) {
      const types = payload.types.map((t, i) => ({
        id: t.id ?? `T-${Date.now()}-${i}`,
        categoryId: id ?? '',
        name: t.name,
        active: t.active,
      }))

      if (id) {
        const index = expenseCategoryMasters.findIndex((c) => c.id === id)
        if (index < 0) throw new ApiError(404, 'ไม่พบประเภทค่าใช้จ่าย')
        expenseCategoryMasters[index] = {
          ...expenseCategoryMasters[index],
          code: payload.code,
          name: payload.name,
          active: payload.active,
          types: types.map((t) => ({ ...t, categoryId: id })),
          updatedAt: nowIso(),
        }
        repo.saveExpenseCategory(expenseCategoryMasters[index])
        return delay(expenseCategoryMasters[index], 400)
      }

      assertUniqueCode(expenseCategoryMasters, null, payload.code)
      const newId = `CAT-${Date.now()}`
      const category: ExpenseCategoryMaster = {
        id: newId,
        code: payload.code,
        name: payload.name,
        active: payload.active,
        types: types.map((t) => ({ ...t, categoryId: newId })),
        updatedAt: nowIso(),
      }
      expenseCategoryMasters.push(category)
      repo.saveExpenseCategory(category)
      return delay(category, 400)
    },
  },

  reports: {
    async definitions() {
      return delay(
        [
          { id: 'PURCHASE_SUMMARY' as ReportId, title: 'สรุปการรับซื้อรังไหมสด', description: 'ยอดรับซื้อ น้ำหนัก และคุณภาพ แยกตามวันและสาขา' },
          { id: 'FARMER_ACTIVITY' as ReportId, title: 'กิจกรรมเกษตรกร', description: 'จำนวนครั้งที่ส่งรัง ยอดสะสม และหนี้คงค้างรายราย' },
          { id: 'EXPENSE_BY_CATEGORY' as ReportId, title: 'ค่าใช้จ่ายแยกตามประเภท', description: 'สรุปค่าใช้จ่ายตามหมวด สาขา และสถานะ' },
          { id: 'DEBT_OUTSTANDING' as ReportId, title: 'หนี้คงค้างรังไหมสด', description: 'ยอดค้าง สิทธิ์ตัดหนี้ และยอดที่ตัดไปแล้ว' },
        ],
        200,
      )
    },
    async run(reportId, params) {
      const inBranch = (branchId: string) =>
        !params.branchId || params.branchId === 'ALL' || branchId === params.branchId

      let result: ReportResult
      switch (reportId) {
        case 'PURCHASE_SUMMARY': {
          const rows = queueTickets
            .filter(
              (t) =>
                t.status === 'COMPLETED' &&
                inBranch(t.branchId) &&
                withinRange(t.arrivedAt, params.dateFrom, params.dateTo),
            )
            .map((t) => ({
              date: t.completedAt ?? t.arrivedAt,
              transactionNo: purchases.get(t.id)?.transactionNo ?? '-',
              farmerName: t.farmerName,
              branchName: t.branchName,
              netWeight: slipWeight(t.id),
              amount: purchases.get(t.id)?.grossAmount ?? 0,
            }))
          result = {
            reportId,
            title: 'สรุปการรับซื้อรังไหมสด',
            generatedAt: nowIso(),
            columns: [
              { key: 'date', label: 'วันที่', format: 'date' },
              { key: 'transactionNo', label: 'เลขที่รายการ' },
              { key: 'farmerName', label: 'เกษตรกร' },
              { key: 'branchName', label: 'สาขา' },
              { key: 'netWeight', label: 'น้ำหนักสุทธิ', align: 'right', format: 'weight' },
              { key: 'amount', label: 'ยอดรับซื้อ', align: 'right', format: 'currency' },
            ],
            rows,
            totals: {
              netWeight: Math.round(rows.reduce((s, r) => s + r.netWeight, 0) * 100) / 100,
              amount: Math.round(rows.reduce((s, r) => s + r.amount, 0) * 100) / 100,
            },
          }
          break
        }
        case 'FARMER_ACTIVITY': {
          const rows = farmers
            .filter((f) => inBranch(f.branchId))
            .map((f) => ({
              code: f.code,
              fullName: f.fullName,
              branchName: f.branchName,
              deliveries: queueTickets.filter((t) => t.farmerId === f.id && t.status === 'COMPLETED').length,
              totalPurchaseAmount: f.totalPurchaseAmount,
              outstandingDebt: f.outstandingDebt,
            }))
          result = {
            reportId,
            title: 'กิจกรรมเกษตรกร',
            generatedAt: nowIso(),
            columns: [
              { key: 'code', label: 'รหัส' },
              { key: 'fullName', label: 'ชื่อ-สกุล' },
              { key: 'branchName', label: 'สาขา' },
              { key: 'deliveries', label: 'ครั้งที่ส่ง', align: 'right', format: 'number' },
              { key: 'totalPurchaseAmount', label: 'ยอดสะสม', align: 'right', format: 'currency' },
              { key: 'outstandingDebt', label: 'หนี้คงค้าง', align: 'right', format: 'currency' },
            ],
            rows,
            totals: {
              totalPurchaseAmount: rows.reduce((s, r) => s + r.totalPurchaseAmount, 0),
              outstandingDebt: rows.reduce((s, r) => s + r.outstandingDebt, 0),
            },
          }
          break
        }
        case 'EXPENSE_BY_CATEGORY': {
          const scoped = expenses.filter(
            (e) =>
              inBranch(e.branchId) &&
              withinRange(e.expenseDate, params.dateFrom, params.dateTo) &&
              (!params.categoryId || e.categoryId === params.categoryId) &&
              !['CANCELLED', 'REJECTED'].includes(e.status),
          )
          const rows = expenseCategoryMasters.map((c) => {
            const items = scoped.filter((e) => e.categoryId === c.id)
            return {
              categoryName: c.name,
              count: items.length,
              amount: Math.round(items.reduce((s, e) => s + e.amount, 0) * 100) / 100,
            }
          }).filter((r) => r.count > 0)
          result = {
            reportId,
            title: 'ค่าใช้จ่ายแยกตามประเภท',
            generatedAt: nowIso(),
            columns: [
              { key: 'categoryName', label: 'ประเภท' },
              { key: 'count', label: 'จำนวนรายการ', align: 'right', format: 'number' },
              { key: 'amount', label: 'ยอดรวม', align: 'right', format: 'currency' },
            ],
            rows,
            totals: { amount: rows.reduce((s, r) => s + r.amount, 0) },
          }
          break
        }
        default: {
          const rows = debts
            .filter((d) => inBranch(d.branchId) && (!params.status || d.status === params.status))
            .map((d) => ({
              sourceNo: d.sourceNo,
              batchNo: d.batchNo,
              farmerName: d.farmerName,
              branchName: d.branchName,
              originalAmount: d.originalAmount,
              deductedAmount: d.deductedAmount,
              remainingBalance: d.remainingBalance,
            }))
          result = {
            reportId: 'DEBT_OUTSTANDING',
            title: 'หนี้คงค้างรังไหมสด',
            generatedAt: nowIso(),
            columns: [
              { key: 'sourceNo', label: 'ใบจอง' },
              { key: 'batchNo', label: 'รอบ' },
              { key: 'farmerName', label: 'เกษตรกร' },
              { key: 'branchName', label: 'สาขา' },
              { key: 'originalAmount', label: 'หนี้ตั้งต้น', align: 'right', format: 'currency' },
              { key: 'deductedAmount', label: 'ตัดแล้ว', align: 'right', format: 'currency' },
              { key: 'remainingBalance', label: 'คงเหลือ', align: 'right', format: 'currency' },
            ],
            rows,
            totals: {
              originalAmount: rows.reduce((s, r) => s + r.originalAmount, 0),
              deductedAmount: rows.reduce((s, r) => s + r.deductedAmount, 0),
              remainingBalance: rows.reduce((s, r) => s + r.remainingBalance, 0),
            },
          }
        }
      }
      return delay(result, 480)
    },
  },

  system: {
    async audit(params) {
      let items = auditEntries.filter(
        (a) =>
          matches([a.actorName, a.action, a.entity, a.entityId, a.reference], params.search) &&
          withinRange(a.at, params.dateFrom, params.dateTo),
      )
      items = sortBy(items, params.sortBy ?? 'at', params.sortDir ?? 'desc')
      return delay(paginate(items, params))
    },
    async users() {
      const items: SystemUser[] = users.map((u) => ({
        id: u.id,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        branchName: BRANCHES.find((b) => b.id === u.branchId)?.name ?? '-',
        active: true,
        permissions: u.permissions,
      }))
      return delay(items, 300)
    },
    async updateUserPermissions(userId, permissions) {
      const user = users.find((u) => u.id === userId)
      if (!user) throw new ApiError(404, 'ไม่พบผู้ใช้')
      user.permissions = permissions
      repo.saveUserPermissions(userId, permissions)
      pushAudit({
        id: `A-${Date.now()}`,
        at: nowIso(),
        actorId: actor()?.id ?? 'U-001',
        actorName: actor()?.displayName ?? 'ระบบ',
        action: 'UPDATE_PERMISSION',
        entity: 'User',
        entityId: userId,
        after: { permissionCount: permissions.length },
      })
      return delay(
        {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role,
          branchName: BRANCHES.find((b) => b.id === user.branchId)?.name ?? '-',
          active: true,
          permissions,
        },
        450,
      )
    },
    async settings() {
      return delay(settings, 250)
    },
    async updateSetting(key, value) {
      const setting = settings.find((s) => s.key === key)
      if (!setting) throw new ApiError(404, 'ไม่พบการตั้งค่า')
      setting.value = value
      repo.saveSetting(setting, nowIso())
      return delay(setting, 350)
    },
  },
}


