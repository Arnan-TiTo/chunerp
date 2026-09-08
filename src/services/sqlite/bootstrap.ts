import type { FreshWeighSlip, ShellWeighSlip } from '@/types/domain'
import type { FloorWeightSession } from '@/types/integration'
import { ROLE_PERMISSIONS } from '@/constants/rbac'
import {
  auditEntries,
  bankMasters,
  bookings,
  branchMasters,
  buildPurchase,
  counters,
  debtDeductions,
  debts,
  expenseCategoryMasters,
  expenses,
  exportBatches,
  farmers,
  freshSlips,
  localDate,
  payments,
  productPrices,
  productUnits,
  products,
  projectMasters,
  purchases,
  qualities,
  queueTickets,
  recalcFreshSlip,
  recalcShellSlip,
  refreshFarmerDebt,
  settings,
  shellSlips,
  upsertPayment,
  users,
  warehouses,
} from '@/services/mocks/db'
import { DEFAULT_SETTINGS } from '@/services/mocks/settings'
import {
  chunErpConnection,
  findImportBySession,
  loadDebts,
  loadDeductions,
  readMeta,
  writeMeta,
  loadExportBatches,
  loadFreshSlips,
  loadPayments,
  loadQualities,
  loadQueueTickets,
  loadShellSlips,
  openChunErpDb,
  recordImport,
  saveDebt,
  saveDeduction,
  saveFreshSlip,
  savePayment,
  saveQuality,
  saveQueueTicket,
  saveShellSlip,
} from './chunErpStore'
import * as repo from './repositories'
import { findSessions, floorWeightConnection, openFloorWeightDb } from './floorWeightStore'
import { SEED_VERSION, type SqliteConnection } from './engine'

/**
 * Brings both databases up before the mock backend serves its first request.
 *
 * On a first run every table is seeded from the fixtures. On every later run
 * the tables are read back instead — which is the whole point: a permission an
 * administrator granted, a price they corrected, a booking they wrote all have
 * to still be there tomorrow. Nothing here re-derives a stored value from a
 * fixture, or the reload would quietly undo the user's work.
 */

let ready: Promise<void> | null = null

export function ensureSqlite(): Promise<void> {
  ready ??= boot()
  return ready
}

/* ── Mapping the external rows onto our slips ───────────────────────────── */

/**
 * One Floor Weight session becomes one ใบชั่งน้ำหนักรังไหมสด.
 *
 * The external grade codes are translated through that system's own grade
 * master (`ErpGrade`), never through a table hard-coded here — a new grade on
 * the scale must not silently land in the wrong column of our invoice.
 */
/**
 * Both databases as real SQLite files.
 *
 * Handed out for download and for the dump script, so what leaves the system is
 * the same file the system is running on — rows, indexes and all.
 */
export function databaseFiles(): { name: string; fileName: string; bytes: Uint8Array }[] {
  return [
    { name: 'chunerp', fileName: 'chunerp.sqlite', bytes: chunErpConnection().bytes() },
    { name: 'floorweight', fileName: 'floorweight.sqlite', bytes: floorWeightConnection().bytes() },
  ]
}

export function sessionToFreshSlip(
  session: FloorWeightSession,
  queueId: string,
  boxes?: number | null,
): FreshWeighSlip {
  return recalcFreshSlip(
    {
      queueId,
      slipNo: session.sessionNo,
      lines: session.bags.map((bag, i) => ({
        id: `${queueId}-FW${bag.detailId}`,
        seq: i + 1,
        grade: bag.erpGrade,
        weightKg: bag.weightKg,
      })),
      gradeTotals: [],
      totalCocoonWeight: 0,
      totalScrapWeight: 0,
      avgWeightPerBox: null,
      weighedAt: session.finishedAt ?? session.startedAt,
      weighedBy: session.operatorName,
      source: 'SCALE',
      locked: false,
    },
    boxes,
  )
}

export function sessionToShellSlip(
  session: FloorWeightSession,
  queueId: string,
  existing?: ShellWeighSlip,
): ShellWeighSlip {
  const sample = session.shellSample
  return recalcShellSlip({
    queueId,
    slipNo: `${session.sessionNo}-S`,
    sampleCocoonCount: sample?.cocoonCount ?? existing?.sampleCocoonCount ?? null,
    sampleCocoonWeightG: sample?.cocoonWeightG ?? existing?.sampleCocoonWeightG ?? null,
    shellWeightG: sample?.shellWeightG ?? existing?.shellWeightG ?? null,
    shellPercent: null,
    moisturePercent: sample?.moisturePercent ?? existing?.moisturePercent ?? null,
    weighedAt: sample?.sampledAt ?? session.finishedAt,
    weighedBy: session.operatorName,
    locked: false,
  })
}

/* ── Boot ───────────────────────────────────────────────────────────────── */

async function boot(): Promise<void> {
  await openFloorWeightDb()
  const conn = await openChunErpDb(seedChunErp)
  repo.bindConnection(conn)
  backfill(conn)
  hydrate()
}

/**
 * Fills any table that is empty.
 *
 * A database saved before a table existed gets the table created by the schema
 * pass, but nothing puts rows in it — which is how an upgrade left `app_user`
 * empty and locked everyone out. Seeding per table rather than per database
 * means an upgrade backfills what is new and leaves alone what the user has
 * already changed.
 */
function backfill(database: SqliteConnection) {
  const isEmpty = (table: string) =>
    (database.one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0) === 0

  const at = nowIso()

  if (isEmpty('role_permission')) repo.saveRolePermissions(ROLE_PERMISSIONS, database)
  if (isEmpty('app_user')) for (const user of users) repo.saveUser(user, at, database)

  if (isEmpty('branch')) for (const row of branchMasters) repo.saveBranch(row, database)
  if (isEmpty('project')) for (const row of projectMasters) repo.saveProject(row, database)
  if (isEmpty('bank')) for (const row of bankMasters) repo.saveBank(row, database)
  if (isEmpty('expense_category')) {
    for (const row of expenseCategoryMasters) repo.saveExpenseCategory(row, database)
  }

  if (isEmpty('product_unit')) for (const row of productUnits) repo.saveProductUnit(row, database)
  if (isEmpty('warehouse')) for (const row of warehouses) repo.saveWarehouse(row, database)
  if (isEmpty('product')) for (const row of products) repo.saveProduct(row, at, database)
  if (isEmpty('product_price')) {
    for (const row of productPrices) repo.saveProductPrice(row, undefined, database)
  }

  if (isEmpty('farmer')) for (const row of farmers) repo.saveFarmer(row, database)
  if (isEmpty('booking')) for (const row of bookings) repo.saveBooking(row, database)
  if (isEmpty('expense')) for (const row of expenses) repo.saveExpense(row, database)
  if (isEmpty('audit_entry')) for (const row of auditEntries) repo.saveAuditEntry(row, database)
  if (isEmpty('app_setting')) {
    for (const row of DEFAULT_SETTINGS) repo.saveSetting(row, at, database)
  }
  if (isEmpty('document_counter')) {
    for (const [name, value] of Object.entries(counters)) repo.saveCounter(name, value, database)
  }
}

const nowIso = () => new Date().toISOString()

/**
 * Writes the fixtures into a fresh database, once.
 *
 * The order follows the foreign keys: masters before the documents that quote
 * them, and the queue before the slips that hang off it.
 */
function seedChunErp(database: SqliteConnection) {
  repo.bindConnection(database)
  const at = nowIso()

  repo.saveRolePermissions(ROLE_PERMISSIONS, database)
  for (const user of users) repo.saveUser(user, at, database)

  for (const branch of branchMasters) repo.saveBranch(branch, database)
  for (const project of projectMasters) repo.saveProject(project, database)
  for (const bank of bankMasters) repo.saveBank(bank, database)
  for (const category of expenseCategoryMasters) repo.saveExpenseCategory(category, database)

  for (const unit of productUnits) repo.saveProductUnit(unit, database)
  for (const warehouse of warehouses) repo.saveWarehouse(warehouse, database)
  for (const product of products) repo.saveProduct(product, at, database)
  for (const price of productPrices) repo.saveProductPrice(price, undefined, database)

  for (const farmer of farmers) repo.saveFarmer(farmer, database)
  for (const booking of bookings) repo.saveBooking(booking, database)

  for (const ticket of queueTickets) saveQueueTicket(ticket, database)
  for (const quality of qualities.values()) saveQuality(quality, database)

  for (const debt of debts) saveDebt(debt, database)
  for (const entry of debtDeductions) saveDeduction(entry, database)

  for (const expense of expenses) repo.saveExpense(expense, database)
  for (const entry of auditEntries) repo.saveAuditEntry(entry, database)
  for (const setting of DEFAULT_SETTINGS) repo.saveSetting(setting, at, database)
  for (const [name, value] of Object.entries(counters)) {
    repo.saveCounter(name, value, database)
  }

  seedWeighSlips(database)
}

/**
 * A demo has to start with history, so tickets that are already COMPLETED get
 * their session pulled in as if the station had done it. Tickets still on the
 * scale are left empty on purpose — that is the state where the operator gets
 * to see the integration actually run.
 */
function seedWeighSlips(database: SqliteConnection) {
  for (const ticket of queueTickets) {
    if (ticket.status !== 'COMPLETED') continue

    // Ask for the ticket's own weigh date rather than the farmer's latest: a
    // farmer with several rounds would otherwise only ever match the newest.
    const weighDate = localDate(ticket.startedWeighingAt ?? ticket.queueDate)
    const session = findSessions({ farmerCode: ticket.farmerCode, weighDate }).find(
      (candidate) => findImportBySession(candidate.sessionId, database) == null,
    )
    if (!session) continue

    const fresh = { ...sessionToFreshSlip(session, ticket.id, ticket.expectedBoxes), locked: true }
    const shell = { ...sessionToShellSlip(session, ticket.id), locked: true }

    saveFreshSlip(fresh, session.sessionId, database)
    saveShellSlip(shell, database)
    recordImport(
      session,
      ticket.id,
      ticket.completedAt ?? session.finishedAt ?? session.startedAt,
      session.operatorName ?? 'ระบบ',
      database,
    )
  }
}

/* ── Hydrate ────────────────────────────────────────────────────────────── */

/** Replaces an exported array in place, so every module keeps its reference. */
function replace<T>(target: T[], rows: T[]) {
  target.splice(0, target.length, ...rows)
}

/**
 * Reads every table back into the working set.
 *
 * The order matters: masters first, then the documents that quote them, then
 * the figures derived from those documents. Anything derived — an effective
 * price, a farmer's outstanding debt, an invoice — is recomputed here rather
 * than restored, so a corrected price cannot leave stale money behind.
 */
function hydrate() {
  replace(users, repo.loadUsers())

  replace(branchMasters, repo.loadBranches())
  replace(projectMasters, repo.loadProjects())
  replace(bankMasters, repo.loadBanks())
  replace(expenseCategoryMasters, repo.loadExpenseCategories())

  replace(productUnits, repo.loadProductUnits())
  replace(warehouses, repo.loadWarehouses())
  replace(products, repo.loadProducts(productUnits, warehouses))
  replace(productPrices, repo.loadProductPrices(products, localDate(nowIso())))

  // Which price is in effect is a property of today, not of the row.
  for (const product of products) {
    product.currentPrice =
      productPrices.find((p) => p.productId === product.id && p.current)?.price ?? null
  }

  replace(farmers, repo.loadFarmers())
  replace(bookings, repo.loadBookings(farmers, products, projectMasters))
  replace(expenses, repo.loadExpenses(expenseCategoryMasters))
  replace(auditEntries, repo.loadAuditEntries())

  // The queue comes first: the slips and the invoice are keyed off it.
  replace(queueTickets, loadQueueTickets())

  qualities.clear()
  for (const quality of loadQualities()) qualities.set(quality.queueId, quality)

  const boxesOf = (queueId: string) =>
    queueTickets.find((t) => t.id === queueId)?.expectedBoxes ?? null

  freshSlips.clear()
  for (const { slip } of loadFreshSlips()) {
    freshSlips.set(slip.queueId, recalcFreshSlip(slip, boxesOf(slip.queueId)))
  }

  shellSlips.clear()
  for (const slip of loadShellSlips()) {
    shellSlips.set(slip.queueId, recalcShellSlip(slip))
  }

  replace(debts, loadDebts())
  replace(debtDeductions, loadDeductions())
  replace(payments, loadPayments())
  replace(exportBatches, loadExportBatches())

  Object.assign(counters, repo.loadCounters())
  // A database written before these counters existed has no row for them, so
  // take the next number from the documents themselves rather than restarting
  // at one and colliding with a number already in use.
  counters.payment = Math.max(counters.payment, ...payments.map((p) => tailNo(p.paymentNo)))
  counters.exportBatch = Math.max(
    counters.exportBatch,
    ...exportBatches.map((b) => tailNo(b.batchNo)),
  )
  replace(settings, repo.loadSettings())

  purchases.clear()
  for (const ticket of queueTickets) {
    if (!qualities.has(ticket.id)) continue
    purchases.set(ticket.id, buildPurchase(ticket))
  }

  settleFinishedRounds()
  // ทุกการรับซื้อที่ปิดแล้วต้องมีรายการรอจ่าย และยอดของเกษตรกรคำนวณใหม่เสมอ
  ensurePayments()
  refreshFarmerTotals()
}

/** The running number at the end of a document number, or 0. */
const tailNo = (docNo: string) => Number(docNo.slice(docNo.lastIndexOf('-') + 1)) || 0

/** ทำเครื่องหมายว่าปิดยอดให้รอบตัวอย่างไปแล้ว */
const FIXTURE_SETTLED = 'fixture_settled'

/**
 * ปิดยอดหนี้ให้ *รอบตัวอย่าง* ครั้งเดียว ตอนสร้างฐานข้อมูลใหม่.
 *
 * The fixture cannot do this itself: the invoice is derived from weigh slips
 * that only exist once this database is open, so the finished round's debt is
 * cleared here instead — once.
 *
 * "Once" is the whole point. This used to run on every boot against every
 * COMPLETED ticket, which meant a purchase the counter closed today had its
 * debt quietly deducted on the next page load — with an audit row naming an
 * accountant who never touched it. ตัดหนี้ is a decision a person makes on the
 * ตัดหนี้ screen, with a preview and a confirmation; boot does not get to make
 * it for them.
 */
function settleFinishedRounds() {
  if (readMeta(FIXTURE_SETTLED) === SEED_VERSION) return

  for (const ticket of queueTickets) {
    if (ticket.status !== 'COMPLETED') continue

    const purchase = purchases.get(ticket.id)
    const debt = debts.find((d) => d.sourceId === ticket.bookingId)
    if (!purchase || !debt || purchase.grossAmount <= 0) continue
    if (debtDeductions.some((d) => d.debtId === debt.id)) continue

    const amount = Math.round(Math.min(debt.remainingBalance, purchase.grossAmount) * 100) / 100
    if (amount <= 0) continue

    const at = ticket.completedAt ?? ticket.queueDate
    const deduction = {
      id: `DD-${debt.id}`,
      debtId: debt.id,
      purchaseId: purchase.id,
      transactionNo: purchase.transactionNo,
      amount,
      at,
      actorName: 'สมหญิง บัญชีศรี',
      remark: 'ตัดหนี้จากใบรับซื้อรังไหมสด',
    }
    debtDeductions.push(deduction)
    saveDeduction(deduction)

    debt.deductedAmount = amount
    debt.remainingBalance = Math.round((debt.originalAmount - amount) * 100) / 100
    debt.status = debt.remainingBalance <= 0 ? 'SETTLED' : 'PARTIAL'
    debt.updatedAt = at
    saveDebt(debt)

    // The invoice carries its own ตัดหนี้ / คงเหลือจ่าย, so rebuild it.
    purchases.set(ticket.id, buildPurchase(ticket))
  }

  writeMeta(FIXTURE_SETTLED, SEED_VERSION)
}

/**
 * ยอดหนี้คงค้างและยอดซื้อสะสมของเกษตรกรคำนวณใหม่ทุกครั้งที่เปิดระบบ
 * เพราะทั้งคู่เป็นผลลัพธ์ของเอกสาร ไม่ใช่ตัวเลขที่เก็บไว้เอง
 */
function refreshFarmerTotals() {
  for (const farmer of farmers) {
    refreshFarmerDebt(farmer.id)
    farmer.totalPurchaseAmount =
      Math.round(
        [...purchases.values()]
          .filter((p) => p.farmerId === farmer.id && p.status === 'COMPLETED')
          .reduce((sum, p) => sum + p.grossAmount, 0) * 100,
      ) / 100
  }
}

/**
 * Every finished purchase owes the farmer money, so every finished purchase
 * has a pay-out row.
 *
 * The row is left PENDING even for the fixture's own round: the cocoons were
 * bought and the debt was taken off, and handing over the difference is the
 * step that is left. Marking it paid here would invent a bank transfer nobody
 * made — and would hide the one action this screen exists for.
 */
function ensurePayments() {
  const at = new Date().toISOString()

  for (const ticket of queueTickets) {
    if (ticket.status !== 'COMPLETED') continue
    const purchase = purchases.get(ticket.id)
    if (!purchase) continue

    savePayment(upsertPayment(purchase, ticket, at))
  }
  repo.saveCounter('payment', counters.payment)
}
