import chunErpSchema from '../../../db/sqlite/chunerp.sql?raw'
import type {
  DebtDeduction,
  DebtRecord,
  ExportBatch,
  ExportKind,
  FarmerPayment,
  FreshWeighSlip,
  QueueTicket,
  ReceivingQuality,
  ShellWeighSlip,
  WeighBagLine,
} from '@/types/domain'
import type { FloorWeightSession } from '@/types/integration'
import { openDatabase, SEED_VERSION, type SqliteConnection } from './engine'

/**
 * ChunERP's own SQLite database.
 *
 * It holds only what this system owns: the two weigh slips once they have been
 * pulled from Floor Weight, the import log that says which external session
 * became which queue, and the debt ledger. Everything derived — the invoice,
 * its totals, the analysis block — is recomputed on read rather than stored, so
 * a price correction cannot leave stale money behind.
 */

export const CHUNERP_DB = 'chunerp'

let conn: SqliteConnection | null = null

export async function openChunErpDb(
  seed: (db: SqliteConnection) => void,
): Promise<SqliteConnection> {
  if (conn) return conn
  conn = await openDatabase(
    CHUNERP_DB,
    migrateChunErp,
    (database) => {
      seed(database)
      writeSeedVersion(database)
    },
    (database) => readSeedVersion(database) === SEED_VERSION,
  )
  return conn
}

/**
 * คอลัมน์ที่เพิ่มเข้ามาหลังจากฐานข้อมูลถูกสร้างไปแล้ว.
 *
 * `CREATE TABLE IF NOT EXISTS` สร้าง *ตาราง* ใหม่ให้ แต่ไม่แตะตารางที่มีอยู่
 * ฐานข้อมูลที่ผู้ใช้บันทึกไว้ก่อนหน้าจึงยังไม่มีคอลัมน์ใหม่ และล้มทันทีที่
 * มีการ SELECT — อาการคือ `no such column: exported_at`
 *
 * เติมทีละคอลัมน์แทนการล้างฐานข้อมูลใหม่ เพราะสิทธิ์ผู้ใช้ ราคาสินค้า และ
 * เอกสารที่บันทึกไว้ต้องอยู่ต่อ การล้างฐานคือสิ่งที่ทำให้สิทธิ์ที่ตั้งไว้
 * หายไปทั้งหมดมาแล้ว
 */
export const ADDED_COLUMNS: Record<string, [name: string, type: string][]> = {
  debt: [
    ['exported_at', 'TEXT'],
    ['export_batch_no', 'TEXT'],
  ],
  debt_deduction: [
    ['exported_at', 'TEXT'],
    ['export_batch_no', 'TEXT'],
  ],
  queue_ticket: [
    ['exported_at', 'TEXT'],
    ['export_batch_no', 'TEXT'],
  ],
}

/**
 * Brings a database — new or saved — up to the current schema.
 *
 * The order is not cosmetic. The schema file indexes `debt (exported_at)`, so
 * running it against a database saved before that column existed fails on the
 * CREATE INDEX and takes the whole boot down with it: that is exactly the
 * "no such column: exported_at" the login screen showed. Adding the columns
 * first leaves the schema pass with nothing to trip over, and on a brand new
 * file there is no table to add them to yet, so it is a no-op.
 */
export function migrateChunErp(target: SqliteConnection) {
  for (const [table, columns] of Object.entries(ADDED_COLUMNS)) {
    ensureColumns(table, columns, target)
  }
  target.exec(chunErpSchema)
}

/** The columns a table has right now. */
export function columnsOf(table: string, target: SqliteConnection = db()): string[] {
  return target.all<{ name: string }>(`PRAGMA table_info(${table})`).map((row) => row.name)
}

/**
 * Adds the columns that are missing, and only those. Safe to call on every
 * open: a table that already has them is left untouched.
 */
export function ensureColumns(
  table: string,
  columns: [name: string, type: string][],
  target: SqliteConnection = db(),
) {
  const present = new Set(columnsOf(table, target))
  // A table that does not exist yet was just created by the schema pass with
  // every column already on it, so there is nothing to add.
  if (present.size === 0) return
  for (const [name, type] of columns) {
    if (!present.has(name)) target.run(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
  }
}

function db(): SqliteConnection {
  if (!conn) throw new Error('ChunERP database is not open')
  return conn
}

/** The open connection, for callers that need the file rather than the rows. */
export function chunErpConnection(): SqliteConnection {
  return db()
}

/** Which generation of fixtures this file was built from, if any. */
function readSeedVersion(target: SqliteConnection): string | null {
  return (
    target.one<{ value: string }>(`SELECT value FROM schema_meta WHERE key = 'seed_version'`)
      ?.value ?? null
  )
}

function writeSeedVersion(target: SqliteConnection) {
  target.run(
    `INSERT INTO schema_meta (key, value) VALUES ('seed_version', ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
    [SEED_VERSION],
  )
}

const bool = (value: number) => value === 1

/* ── Queue tickets ──────────────────────────────────────────────────────── */

interface QueueRow {
  id: string
  queue_no: number | null
  queue_date: string
  branch_id: string
  branch_name: string
  farmer_id: string
  farmer_code: string
  farmer_name: string
  booking_id: string | null
  booking_no: string | null
  breed_id: string | null
  breed_name: string | null
  project_id: string | null
  project_name: string | null
  hatch_date: string | null
  split_from_boxes: number | null
  expected_boxes: number | null
  status: QueueTicket['status']
  arrived_at: string
  issued_at: string | null
  called_at: string | null
  started_weighing_at: string | null
  completed_at: string | null
  counter: string | null
  remark: string | null
  exported_at: string | null
  export_batch_no: string | null
}

const opt = <T>(value: T | null): T | undefined => value ?? undefined

export function loadQueueTickets(): QueueTicket[] {
  return db()
    .all<QueueRow>(`SELECT * FROM queue_ticket`)
    .map((row) => ({
      id: row.id,
      queueNo: row.queue_no,
      queueDate: row.queue_date,
      branchId: row.branch_id,
      branchName: row.branch_name,
      farmerId: row.farmer_id,
      farmerCode: row.farmer_code,
      farmerName: row.farmer_name,
      bookingId: opt(row.booking_id),
      bookingNo: opt(row.booking_no),
      breedId: opt(row.breed_id),
      breedName: opt(row.breed_name),
      projectId: opt(row.project_id),
      projectName: opt(row.project_name),
      hatchDate: opt(row.hatch_date),
      splitFromBoxes: opt(row.split_from_boxes),
      expectedBoxes: opt(row.expected_boxes),
      status: row.status,
      arrivedAt: row.arrived_at,
      issuedAt: opt(row.issued_at),
      calledAt: opt(row.called_at),
      startedWeighingAt: opt(row.started_weighing_at),
      completedAt: opt(row.completed_at),
      counter: opt(row.counter),
      remark: opt(row.remark),
      exportedAt: opt(row.exported_at),
      exportBatchNo: opt(row.export_batch_no),
    }))
}

export function saveQueueTicket(ticket: QueueTicket, target: SqliteConnection = db()) {
  target.run(
    `INSERT OR REPLACE INTO queue_ticket
       (id, queue_no, queue_date, branch_id, branch_name, farmer_id, farmer_code, farmer_name,
        booking_id, booking_no, breed_id, breed_name, project_id, project_name, hatch_date,
        split_from_boxes, expected_boxes, status, arrived_at, issued_at, called_at,
        started_weighing_at, completed_at, counter, remark, exported_at, export_batch_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      ticket.id,
      ticket.queueNo,
      ticket.queueDate,
      ticket.branchId,
      ticket.branchName,
      ticket.farmerId,
      ticket.farmerCode,
      ticket.farmerName,
      ticket.bookingId ?? null,
      ticket.bookingNo ?? null,
      ticket.breedId ?? null,
      ticket.breedName ?? null,
      ticket.projectId ?? null,
      ticket.projectName ?? null,
      ticket.hatchDate ?? null,
      ticket.splitFromBoxes ?? null,
      ticket.expectedBoxes ?? null,
      ticket.status,
      ticket.arrivedAt,
      ticket.issuedAt ?? null,
      ticket.calledAt ?? null,
      ticket.startedWeighingAt ?? null,
      ticket.completedAt ?? null,
      ticket.counter ?? null,
      ticket.remark ?? null,
      ticket.exportedAt ?? null,
      ticket.exportBatchNo ?? null,
    ],
  )
}

/* ── Sorting result ─────────────────────────────────────────────────────── */

interface QualityRow {
  queue_id: string
  good_cocoon_qty: number
  after_screen_qty: number
  damaged_cocoon_qty: number
  double_cocoon_qty: number
  thin_cocoon_qty: number
  floss_qty: number
  drying_level: ReceivingQuality['dryingLevel'] | null
  dead_silkworm: number
  not_degummed: number
  guaranteed_good_price: number
  debt_relief: number
  jul_uam_jai: number
  moisture_percent: number | null
  remark: string | null
  saved_at: string | null
  confirmed: number
}

export function loadQualities(): ReceivingQuality[] {
  return db()
    .all<QualityRow>(`SELECT * FROM receiving_quality`)
    .map((row) => ({
      queueId: row.queue_id,
      goodCocoonQty: row.good_cocoon_qty,
      afterScreenQty: row.after_screen_qty,
      damagedCocoonQty: row.damaged_cocoon_qty,
      doubleCocoonQty: row.double_cocoon_qty,
      thinCocoonQty: row.thin_cocoon_qty,
      flossQty: row.floss_qty,
      dryingLevel: opt(row.drying_level),
      deadSilkworm: bool(row.dead_silkworm),
      notDegummed: bool(row.not_degummed),
      guaranteedGoodPrice: bool(row.guaranteed_good_price),
      debtRelief: bool(row.debt_relief),
      julUamJai: bool(row.jul_uam_jai),
      moisturePercent: opt(row.moisture_percent),
      remark: opt(row.remark),
      savedAt: opt(row.saved_at),
      confirmed: bool(row.confirmed),
    }))
}

export function saveQuality(quality: ReceivingQuality, target: SqliteConnection = db()) {
  target.run(
    `INSERT OR REPLACE INTO receiving_quality
       (queue_id, good_cocoon_qty, after_screen_qty, damaged_cocoon_qty, double_cocoon_qty,
        thin_cocoon_qty, floss_qty, drying_level, dead_silkworm, not_degummed,
        guaranteed_good_price, debt_relief, jul_uam_jai, moisture_percent, remark,
        saved_at, confirmed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      quality.queueId,
      quality.goodCocoonQty,
      quality.afterScreenQty,
      quality.damagedCocoonQty,
      quality.doubleCocoonQty,
      quality.thinCocoonQty,
      quality.flossQty,
      quality.dryingLevel ?? null,
      quality.deadSilkworm ? 1 : 0,
      quality.notDegummed ? 1 : 0,
      quality.guaranteedGoodPrice ? 1 : 0,
      quality.debtRelief ? 1 : 0,
      quality.julUamJai ? 1 : 0,
      quality.moisturePercent ?? null,
      quality.remark ?? null,
      quality.savedAt ?? null,
      quality.confirmed ? 1 : 0,
    ],
  )
}

/* ── Weigh slips ────────────────────────────────────────────────────────── */

interface FreshRow {
  queue_id: string
  slip_no: string
  source: 'MANUAL' | 'SCALE'
  locked: number
  weighed_at: string | null
  weighed_by: string | null
  floor_session_id: number | null
}

interface BagRow {
  id: string
  queue_id: string
  seq: number
  grade: WeighBagLine['grade']
  weight_kg: number
}

interface ShellRow {
  queue_id: string
  slip_no: string
  sample_cocoon_count: number | null
  sample_cocoon_weight_g: number | null
  shell_weight_g: number | null
  moisture_percent: number | null
  locked: number
  weighed_at: string | null
  weighed_by: string | null
}

/**
 * Reads every stored slip in one pass.
 *
 * Totals are left at zero: the caller runs them back through the same
 * aggregation the write path uses, so stored rows and freshly-entered rows can
 * never disagree about what a slip adds up to.
 */
export function loadFreshSlips(): { slip: FreshWeighSlip; floorSessionId: number | null }[] {
  const slips = db().all<FreshRow>(`SELECT * FROM fresh_weigh_slip`)
  const bags = db().all<BagRow>(`SELECT * FROM weigh_bag ORDER BY queue_id, seq`)

  return slips.map((row) => ({
    floorSessionId: row.floor_session_id,
    slip: {
      queueId: row.queue_id,
      slipNo: row.slip_no,
      lines: bags
        .filter((bag) => bag.queue_id === row.queue_id)
        .map((bag) => ({
          id: bag.id,
          seq: bag.seq,
          grade: bag.grade,
          weightKg: bag.weight_kg,
        })),
      gradeTotals: [],
      totalCocoonWeight: 0,
      totalScrapWeight: 0,
      avgWeightPerBox: null,
      weighedAt: row.weighed_at ?? undefined,
      weighedBy: row.weighed_by ?? undefined,
      source: row.source,
      locked: bool(row.locked),
    },
  }))
}

export function loadShellSlips(): ShellWeighSlip[] {
  return db()
    .all<ShellRow>(`SELECT * FROM shell_weigh_slip`)
    .map((row) => ({
      queueId: row.queue_id,
      slipNo: row.slip_no,
      sampleCocoonCount: row.sample_cocoon_count,
      sampleCocoonWeightG: row.sample_cocoon_weight_g,
      shellWeightG: row.shell_weight_g,
      moisturePercent: row.moisture_percent,
      // Derived on read for the same reason the fresh totals are.
      shellPercent: null,
      weighedAt: row.weighed_at ?? undefined,
      weighedBy: row.weighed_by ?? undefined,
      locked: bool(row.locked),
    }))
}

export function saveFreshSlip(
  slip: FreshWeighSlip,
  floorSessionId: number | null = null,
  target: SqliteConnection = db(),
) {
  target.run(
    `INSERT INTO fresh_weigh_slip
       (queue_id, slip_no, source, locked, weighed_at, weighed_by, floor_session_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (queue_id) DO UPDATE SET
       slip_no = excluded.slip_no,
       source = excluded.source,
       locked = excluded.locked,
       weighed_at = excluded.weighed_at,
       weighed_by = excluded.weighed_by,
       floor_session_id = COALESCE(excluded.floor_session_id, fresh_weigh_slip.floor_session_id)`,
    [
      slip.queueId,
      slip.slipNo,
      slip.source,
      slip.locked ? 1 : 0,
      slip.weighedAt ?? null,
      slip.weighedBy ?? null,
      floorSessionId,
    ],
  )

  // Bags are replaced wholesale: a slip is small, and rewriting it keeps `seq`
  // contiguous after a bag is removed without a second renumbering pass.
  target.run(`DELETE FROM weigh_bag WHERE queue_id = ?`, [slip.queueId])
  for (const line of slip.lines) {
    target.run(
      `INSERT INTO weigh_bag (id, queue_id, seq, grade, weight_kg) VALUES (?, ?, ?, ?, ?)`,
      [line.id, slip.queueId, line.seq, line.grade, line.weightKg],
    )
  }
}

export function saveShellSlip(slip: ShellWeighSlip, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO shell_weigh_slip
       (queue_id, slip_no, sample_cocoon_count, sample_cocoon_weight_g, shell_weight_g,
        moisture_percent, locked, weighed_at, weighed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (queue_id) DO UPDATE SET
       slip_no = excluded.slip_no,
       sample_cocoon_count = excluded.sample_cocoon_count,
       sample_cocoon_weight_g = excluded.sample_cocoon_weight_g,
       shell_weight_g = excluded.shell_weight_g,
       moisture_percent = excluded.moisture_percent,
       locked = excluded.locked,
       weighed_at = excluded.weighed_at,
       weighed_by = excluded.weighed_by`,
    [
      slip.queueId,
      slip.slipNo,
      slip.sampleCocoonCount,
      slip.sampleCocoonWeightG,
      slip.shellWeightG,
      slip.moisturePercent,
      slip.locked ? 1 : 0,
      slip.weighedAt ?? null,
      slip.weighedBy ?? null,
    ],
  )
}

/* ── Floor Weight import log ────────────────────────────────────────────── */

export interface ImportRow {
  session_id: number
  session_no: string
  queue_id: string
  farmer_code: string
  weigh_date: string
  bag_count: number
  total_weight_kg: number
  imported_at: string
  imported_by: string | null
}

export function loadImports(): ImportRow[] {
  return db().all<ImportRow>(`SELECT * FROM floor_weight_import`)
}

export function findImportBySession(
  sessionId: number,
  target: SqliteConnection = db(),
): ImportRow | null {
  return target.one<ImportRow>(`SELECT * FROM floor_weight_import WHERE session_id = ?`, [
    sessionId,
  ])
}

export function findImportByQueue(queueId: string): ImportRow | null {
  return db().one<ImportRow>(`SELECT * FROM floor_weight_import WHERE queue_id = ?`, [queueId])
}

export function recordImport(
  session: FloorWeightSession,
  queueId: string,
  importedAt: string,
  importedBy: string,
  target: SqliteConnection = db(),
) {
  target.run(
    `INSERT INTO floor_weight_import
       (session_id, session_no, queue_id, farmer_code, weigh_date, bag_count,
        total_weight_kg, imported_at, imported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (session_id) DO UPDATE SET
       queue_id = excluded.queue_id,
       bag_count = excluded.bag_count,
       total_weight_kg = excluded.total_weight_kg,
       imported_at = excluded.imported_at,
       imported_by = excluded.imported_by`,
    [
      session.sessionId,
      session.sessionNo,
      queueId,
      session.farmerCode,
      session.weighDate,
      session.bags.length,
      session.totalWeightKg,
      importedAt,
      importedBy,
    ],
  )
}

/** Clears a queue's link so a wrongly-pulled session can be pulled again. */
export function clearImportForQueue(queueId: string) {
  db().run(`DELETE FROM floor_weight_import WHERE queue_id = ?`, [queueId])
}

/* ── Debt ledger ────────────────────────────────────────────────────────── */

interface DebtRow {
  id: string
  source_type: 'BOOKING_DELIVERY'
  source_id: string
  source_no: string
  farmer_id: string
  farmer_name: string
  farmer_code: string
  branch_id: string
  branch_name: string
  batch_no: string
  hatch_date: string | null
  breed_name: string | null
  original_amount: number
  deducted_amount: number
  remaining_balance: number
  status: DebtRecord['status']
  remark: string | null
  exported_at: string | null
  export_batch_no: string | null
  created_at: string
  updated_at: string
}

interface DebtItemRow {
  id: string
  debt_id: string
  product_name: string
  quantity: number
  unit_name: string
  unit_price: number
  amount: number
}

interface DeductionRow {
  id: string
  debt_id: string
  purchase_id: string | null
  transaction_no: string | null
  amount: number
  at: string
  actor_name: string
  remark: string | null
  exported_at: string | null
  export_batch_no: string | null
}

export function loadDebts(): DebtRecord[] {
  const rows = db().all<DebtRow>(`SELECT * FROM debt`)
  const items = db().all<DebtItemRow>(`SELECT * FROM debt_item`)

  return rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceNo: row.source_no,
    farmerId: row.farmer_id,
    farmerName: row.farmer_name,
    farmerCode: row.farmer_code,
    branchId: row.branch_id,
    branchName: row.branch_name,
    batchNo: row.batch_no,
    hatchDate: row.hatch_date ?? undefined,
    breedName: row.breed_name ?? undefined,
    items: items
      .filter((item) => item.debt_id === row.id)
      .map((item) => ({
        id: item.id,
        productName: item.product_name,
        quantity: item.quantity,
        unitName: item.unit_name,
        unitPrice: item.unit_price,
        amount: item.amount,
      })),
    originalAmount: row.original_amount,
    deductedAmount: row.deducted_amount,
    remainingBalance: row.remaining_balance,
    status: row.status,
    remark: row.remark ?? undefined,
    exportedAt: row.exported_at ?? undefined,
    exportBatchNo: row.export_batch_no ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export function loadDeductions(): DebtDeduction[] {
  return db()
    .all<DeductionRow>(`SELECT * FROM debt_deduction ORDER BY at DESC`)
    .map((row) => ({
      id: row.id,
      debtId: row.debt_id,
      purchaseId: row.purchase_id ?? undefined,
      transactionNo: row.transaction_no ?? undefined,
      amount: row.amount,
      at: row.at,
      actorName: row.actor_name,
      remark: row.remark ?? undefined,
      exportedAt: row.exported_at ?? undefined,
      exportBatchNo: row.export_batch_no ?? undefined,
    }))
}

export function saveDebt(debt: DebtRecord, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO debt
       (id, source_type, source_id, source_no, farmer_id, farmer_name, farmer_code,
        branch_id, branch_name, batch_no, hatch_date, breed_name, original_amount,
        deducted_amount, remaining_balance, status, remark, exported_at,
        export_batch_no, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       deducted_amount = excluded.deducted_amount,
       remaining_balance = excluded.remaining_balance,
       status = excluded.status,
       remark = excluded.remark,
       exported_at = excluded.exported_at,
       export_batch_no = excluded.export_batch_no,
       updated_at = excluded.updated_at`,
    [
      debt.id,
      debt.sourceType,
      debt.sourceId,
      debt.sourceNo,
      debt.farmerId,
      debt.farmerName,
      debt.farmerCode,
      debt.branchId,
      debt.branchName,
      debt.batchNo,
      debt.hatchDate ?? null,
      debt.breedName ?? null,
      debt.originalAmount,
      debt.deductedAmount,
      debt.remainingBalance,
      debt.status,
      debt.remark ?? null,
      debt.exportedAt ?? null,
      debt.exportBatchNo ?? null,
      debt.createdAt,
      debt.updatedAt,
    ],
  )

  for (const item of debt.items) {
    target.run(
      `INSERT OR REPLACE INTO debt_item
         (id, debt_id, product_name, quantity, unit_name, unit_price, amount)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [item.id, debt.id, item.productName, item.quantity, item.unitName, item.unitPrice, item.amount],
    )
  }
}

export function saveDeduction(entry: DebtDeduction, target: SqliteConnection = db()) {
  target.run(
    `INSERT OR REPLACE INTO debt_deduction
       (id, debt_id, purchase_id, transaction_no, amount, at, actor_name, remark,
        exported_at, export_batch_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.debtId,
      entry.purchaseId ?? null,
      entry.transactionNo ?? null,
      entry.amount,
      entry.at,
      entry.actorName,
      entry.remark ?? null,
      entry.exportedAt ?? null,
      entry.exportBatchNo ?? null,
    ],
  )
}

/* ── จ่ายเงินเกษตรกร ──────────────────────────────────────────────────────── */

interface PaymentRow {
  id: string
  payment_no: string
  purchase_id: string
  transaction_no: string
  farmer_id: string
  farmer_code: string
  farmer_name: string
  branch_id: string
  branch_name: string
  batch_no: string | null
  gross_amount: number
  deducted_amount: number
  net_amount: number
  status: FarmerPayment['status']
  method: NonNullable<FarmerPayment['method']> | null
  paid_date: string | null
  bank_name: string | null
  account_no: string | null
  transfer_ref: string | null
  remark: string | null
  paid_by: string | null
  paid_by_name: string | null
  created_at: string
  updated_at: string
  exported_at: string | null
  export_batch_no: string | null
}

export function loadPayments(): FarmerPayment[] {
  return db()
    .all<PaymentRow>(`SELECT * FROM farmer_payment ORDER BY created_at DESC`)
    .map((row) => ({
      id: row.id,
      paymentNo: row.payment_no,
      purchaseId: row.purchase_id,
      transactionNo: row.transaction_no,
      farmerId: row.farmer_id,
      farmerCode: row.farmer_code,
      farmerName: row.farmer_name,
      branchId: row.branch_id,
      branchName: row.branch_name,
      batchNo: row.batch_no ?? undefined,
      grossAmount: row.gross_amount,
      deductedAmount: row.deducted_amount,
      netAmount: row.net_amount,
      status: row.status,
      method: row.method ?? undefined,
      paidDate: row.paid_date ?? undefined,
      bankName: row.bank_name ?? undefined,
      accountNo: row.account_no ?? undefined,
      transferRef: row.transfer_ref ?? undefined,
      remark: row.remark ?? undefined,
      paidBy: row.paid_by ?? undefined,
      paidByName: row.paid_by_name ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      exportedAt: row.exported_at ?? undefined,
      exportBatchNo: row.export_batch_no ?? undefined,
    }))
}

export function savePayment(payment: FarmerPayment, target: SqliteConnection = db()) {
  target.run(
    `INSERT OR REPLACE INTO farmer_payment
       (id, payment_no, purchase_id, transaction_no, farmer_id, farmer_code, farmer_name,
        branch_id, branch_name, batch_no, gross_amount, deducted_amount, net_amount,
        status, method, paid_date, bank_name, account_no, transfer_ref, remark,
        paid_by, paid_by_name, created_at, updated_at, exported_at, export_batch_no)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payment.id,
      payment.paymentNo,
      payment.purchaseId,
      payment.transactionNo,
      payment.farmerId,
      payment.farmerCode,
      payment.farmerName,
      payment.branchId,
      payment.branchName,
      payment.batchNo ?? null,
      payment.grossAmount,
      payment.deductedAmount,
      payment.netAmount,
      payment.status,
      payment.method ?? null,
      payment.paidDate ?? null,
      payment.bankName ?? null,
      payment.accountNo ?? null,
      payment.transferRef ?? null,
      payment.remark ?? null,
      payment.paidBy ?? null,
      payment.paidByName ?? null,
      payment.createdAt,
      payment.updatedAt,
      payment.exportedAt ?? null,
      payment.exportBatchNo ?? null,
    ],
  )
}

/* ── ชุดส่งออกไประบบบัญชี ─────────────────────────────────────────────────── */

interface ExportBatchRow {
  batch_no: string
  kind: ExportKind
  target: string
  file_name: string
  row_count: number
  total_amount: number
  exported_at: string
  exported_by: string
}

export function loadExportBatches(): ExportBatch[] {
  return db()
    .all<ExportBatchRow>(`SELECT * FROM export_batch ORDER BY exported_at DESC`)
    .map((row) => ({
      batchNo: row.batch_no,
      kind: row.kind,
      target: row.target,
      fileName: row.file_name,
      rowCount: row.row_count,
      totalAmount: row.total_amount,
      exportedAt: row.exported_at,
      exportedBy: row.exported_by,
    }))
}

export function saveExportBatch(batch: ExportBatch, target: SqliteConnection = db()) {
  target.run(
    `INSERT OR REPLACE INTO export_batch
       (batch_no, kind, target, file_name, row_count, total_amount, exported_at, exported_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      batch.batchNo,
      batch.kind,
      batch.target,
      batch.fileName,
      batch.rowCount,
      batch.totalAmount,
      batch.exportedAt,
      batch.exportedBy,
    ],
  )
}

export function countRows(table: string): number {
  return db().one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`)?.n ?? 0
}
