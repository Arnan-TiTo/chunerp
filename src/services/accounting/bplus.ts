import type {
  Booking,
  DebtDeduction,
  DebtRecord,
  ExportKind,
  FarmerPayment,
  PurchaseSummary,
} from '@/types/domain'
import { COMPANY_NAME } from '@/constants'

/**
 * ส่งออกไปตั้งหนี้/ตัดหนี้ ที่ระบบบัญชี BPlus.
 *
 * ─── สิ่งที่แน่นอน: วิธีทางบัญชี ─────────────────────────────────────────
 *
 * เหตุการณ์มีสองครั้ง และเป็นคนละรายการบัญชีกัน:
 *
 * 1. **ตั้งหนี้** — เจ้าหน้าที่ส่งไข่ไหม/วัสดุให้เกษตรกรเป็นเครดิต
 *      Dr  ลูกหนี้การค้า - เกษตรกร          1,570
 *          Cr  รายได้จากการขายวัสดุการเลี้ยง        1,570
 *
 * 2. **ซื้อรังไหมสด** — บริษัทซื้อ *วัตถุดิบ* เข้าโรงงาน ไม่ใช่แค่จ่ายเงิน
 *      Dr  วัตถุดิบ - รังไหมสด             28,297.28
 *          Cr  เจ้าหนี้ - เกษตรกร                28,297.28
 *
 *    ต้องแยกรายการตามชั้นคุณภาพ เพราะรังดี รังเสีย รังแฝด รังบาง และปุยไหม
 *    เข้าสู่การผลิตคนละทาง ราคาต่อกิโลกรัมต่างกัน และต้นทุนผ้าไหมที่ผลิตออกมา
 *    คิดจากน้ำหนักรายชั้น ถ้าส่งไปเป็นยอดรวมก้อนเดียว บัญชีจะรู้แค่ว่าจ่ายเงิน
 *    ไปเท่าไร แต่ไม่รู้ว่าได้วัตถุดิบอะไรเข้ามาเท่าไร
 *
 * 3. **ตัดหนี้** — หักกลบลูกหนี้เดิมกับเจ้าหนี้ที่เพิ่งเกิด
 *      Dr  เจ้าหนี้ - เกษตรกร                1,570
 *          Cr  ลูกหนี้การค้า - เกษตรกร            1,570
 *
 * 4. **จ่ายส่วนต่าง** — เงินที่เกษตรกรรับไปจริง
 *      Dr  เจ้าหนี้ - เกษตรกร               26,727.28
 *          Cr  เงินสด / ธนาคาร                 26,727.28
 *
 * ระบบนี้เป็นต้นทางของทั้งสี่ ไฟล์ที่ส่งออกจึงมีสี่ชนิดตรงตามนั้น
 *
 *   DEBT      → ตั้งลูกหนี้                 (ข้อ 1)
 *   PURCHASE  → ซื้อวัตถุดิบ + ตั้งเจ้าหนี้   (ข้อ 2 — มีรายการสินค้า)
 *   DEDUCTION → หักกลบลูกหนี้/เจ้าหนี้        (ข้อ 3)
 *   PAYMENT   → ใบสำคัญจ่าย                 (ข้อ 4)
 *
 * ─── สิ่งที่ยังไม่ทราบ: รูปแบบไฟล์ของ BPlus ──────────────────────────────
 *
 * ชื่อคอลัมน์ รหัสประเภทเอกสาร และผังบัญชี ต่างกันไปตามการติดตั้งของแต่ละ
 * บริษัท จึงรวมไว้ที่ไฟล์นี้ไฟล์เดียว เมื่อได้เทมเพลตนำเข้าจริงจากฝ่ายบัญชี
 * ให้แก้ที่ COLUMNS ด้านล่างเท่านั้น ไม่ต้องแตะส่วนอื่นของระบบ
 *
 * คอลัมน์ชุดปัจจุบันเลือกจากสิ่งที่ระบบ AR/AP ทุกตัวต้องใช้: เลขที่เอกสาร
 * วันที่ รหัสคู่ค้า จำนวนเงิน และเลขที่เอกสารอ้างอิงสำหรับการหักกลบ
 */

/** One flat row, ready to become a CSV line. */
export type ExportRow = Record<string, string | number>

interface ColumnSpec {
  /** Column heading written to the file. */
  header: string
  /** Where the value comes from. */
  key: string
  note?: string
}

/**
 * ตั้งหนี้ — ใบวางบิล/ขายเชื่อ ให้เกษตรกร.
 *
 * One line per item so the accounting side can post either a summary or a
 * detailed document; a system that only wants the total simply ignores the
 * item columns.
 */
const DEBT_COLUMNS: ColumnSpec[] = [
  { header: 'DocNo', key: 'docNo', note: 'เลขที่เอกสารตั้งหนี้ = เลขที่ใบจอง' },
  { header: 'DocDate', key: 'docDate', note: 'วันที่ส่งของ = วันที่เกิดหนี้ · YYYY-MM-DD ค.ศ.' },
  { header: 'CustCode', key: 'custCode', note: 'รหัสเกษตรกร ต้องตรงกับรหัสลูกหนี้ใน BPlus' },
  { header: 'CustName', key: 'custName' },
  { header: 'BranchCode', key: 'branchCode' },
  { header: 'BatchNo', key: 'batchNo', note: 'รอบการเลี้ยง ใช้กระทบยอดตอนตัดหนี้' },
  { header: 'ItemCode', key: 'itemCode' },
  { header: 'ItemName', key: 'itemName' },
  { header: 'Qty', key: 'qty' },
  { header: 'Unit', key: 'unit' },
  { header: 'UnitPrice', key: 'unitPrice' },
  { header: 'Amount', key: 'amount' },
  { header: 'DocTotal', key: 'docTotal', note: 'ยอดรวมทั้งเอกสาร ซ้ำทุกบรรทัด' },
  { header: 'Remark', key: 'remark' },
]

/**
 * ตัดหนี้ — หักกลบลูกหนี้กับเจ้าหนี้รายเดียวกัน.
 *
 * Both document references travel with the row: without them accounting cannot
 * tell which receivable this pays down, and the offset lands on the wrong round.
 */
const DEDUCTION_COLUMNS: ColumnSpec[] = [
  { header: 'DocNo', key: 'docNo', note: 'เลขที่ใบหักกลบ (ออกโดยระบบนี้)' },
  { header: 'DocDate', key: 'docDate', note: 'วันที่หักกลบ · YYYY-MM-DD ค.ศ.' },
  { header: 'CustCode', key: 'custCode' },
  { header: 'CustName', key: 'custName' },
  { header: 'BranchCode', key: 'branchCode' },
  { header: 'BatchNo', key: 'batchNo' },
  { header: 'ARDocNo', key: 'arDocNo', note: 'เอกสารตั้งหนี้ที่ถูกหัก' },
  { header: 'APDocNo', key: 'apDocNo', note: 'เลขที่ใบรับซื้อรังไหมสด' },
  { header: 'Amount', key: 'amount', note: 'ยอดที่หักกลบ' },
  { header: 'Remark', key: 'remark' },
]

/**
 * จ่ายเงิน — ใบสำคัญจ่าย ส่วนต่างที่เกษตรกรได้รับจริง.
 *
 * The pay-out is the only row accounting cannot rebuild from anything else:
 * only this system knows whether the farmer took cash at the counter or a
 * transfer, and against which bank reference.
 */
const PAYMENT_COLUMNS: ColumnSpec[] = [
  { header: 'DocNo', key: 'docNo', note: 'เลขที่ใบสำคัญจ่าย (ออกโดยระบบนี้)' },
  { header: 'DocDate', key: 'docDate', note: 'วันที่จ่ายจริง · YYYY-MM-DD ค.ศ.' },
  { header: 'CustCode', key: 'custCode' },
  { header: 'CustName', key: 'custName' },
  { header: 'BranchCode', key: 'branchCode' },
  { header: 'BatchNo', key: 'batchNo' },
  { header: 'APDocNo', key: 'apDocNo', note: 'เลขที่ใบรับซื้อรังไหมสดที่จ่ายตาม' },
  { header: 'GrossAmount', key: 'grossAmount', note: 'รวมรายได้ก่อนหักหนี้' },
  { header: 'DeductAmount', key: 'deductAmount', note: 'หักหนี้รอบนี้' },
  { header: 'Amount', key: 'amount', note: 'ยอดจ่ายสุทธิ = Gross − Deduct' },
  { header: 'PayType', key: 'payType', note: 'CASH = เงินสด, TRANSFER = โอนเข้าบัญชี' },
  { header: 'BankName', key: 'bankName' },
  { header: 'AccountNo', key: 'accountNo' },
  { header: 'PayRef', key: 'payRef', note: 'เลขที่อ้างอิงการโอน' },
  { header: 'Remark', key: 'remark' },
]

/**
 * ซื้อรังไหมสด — ใบรับซื้อ ที่เป็นทั้งการรับวัตถุดิบเข้าและการตั้งเจ้าหนี้.
 *
 * One line per ชั้นคุณภาพ that actually has weight. This is the only file that
 * carries goods rather than money: the mill's raw material comes in through it,
 * so quantity is kilograms and the item is the grade, not the farmer.
 */
const PURCHASE_COLUMNS: ColumnSpec[] = [
  { header: 'DocNo', key: 'docNo', note: 'เลขที่ใบรับซื้อรังไหมสด' },
  { header: 'DocDate', key: 'docDate', note: 'วันที่รับซื้อ · YYYY-MM-DD ค.ศ.' },
  { header: 'VendCode', key: 'vendCode', note: 'รหัสเกษตรกร = รหัสเจ้าหนี้ใน BPlus' },
  { header: 'VendName', key: 'vendName' },
  { header: 'BranchCode', key: 'branchCode', note: 'จุดรับซื้อ' },
  { header: 'BatchNo', key: 'batchNo', note: 'รอบการเลี้ยง ใช้กระทบยอดกับใบตั้งหนี้' },
  { header: 'ItemCode', key: 'itemCode', note: 'รหัสสินค้าตามชั้นคุณภาพ' },
  { header: 'ItemName', key: 'itemName', note: 'ชื่อรายการตามใบรับซื้อ (มีสายพันธุ์กำกับ)' },
  { header: 'Qty', key: 'qty', note: 'น้ำหนัก (กิโลกรัม)' },
  { header: 'Unit', key: 'unit' },
  { header: 'UnitPrice', key: 'unitPrice', note: 'ราคารับซื้อ บาท/กก.' },
  { header: 'Amount', key: 'amount' },
  { header: 'DocTotal', key: 'docTotal', note: 'รวมรายได้ทั้งใบ ซ้ำทุกบรรทัด' },
  { header: 'Remark', key: 'remark', note: 'สายพันธุ์ · รุ่นฟัก' },
]

export const COLUMNS: Record<ExportKind, ColumnSpec[]> = {
  DEBT: DEBT_COLUMNS,
  PURCHASE: PURCHASE_COLUMNS,
  DEDUCTION: DEDUCTION_COLUMNS,
  PAYMENT: PAYMENT_COLUMNS,
}

/** The documented meaning of each column, for the accounting hand-over. */
export function columnGuide(kind: ExportKind) {
  return COLUMNS[kind].map((c) => ({ header: c.header, note: c.note }))
}

const money = (n: number) => (Math.round(n * 100) / 100).toFixed(2)
/** Accounting reads calendar days, not instants. */
const day = (iso: string | undefined) => (iso ? iso.slice(0, 10) : '')

export function debtRows(debt: DebtRecord, booking?: Booking): ExportRow[] {
  const items = booking?.delivery?.items ?? []
  const docTotal = money(debt.originalAmount)

  if (items.length === 0) {
    // A debt with no delivery lines still has to reach accounting as a total.
    return [
      {
        docNo: debt.sourceNo,
        docDate: day(debt.createdAt),
        custCode: debt.farmerCode,
        custName: debt.farmerName,
        branchCode: debt.branchId,
        batchNo: debt.batchNo,
        itemCode: '',
        itemName: 'ตั้งหนี้ตามใบส่งของ',
        qty: '1',
        unit: '',
        unitPrice: docTotal,
        amount: docTotal,
        docTotal,
        remark: `${COMPANY_NAME} · รอบ ${debt.batchNo}`,
      },
    ]
  }

  return items.map((item) => ({
    docNo: debt.sourceNo,
    docDate: day(booking?.delivery?.deliveredAt ?? debt.createdAt),
    custCode: debt.farmerCode,
    custName: debt.farmerName,
    branchCode: debt.branchId,
    batchNo: debt.batchNo,
    itemCode: item.bookingItemId,
    itemName: item.productName,
    qty: String(item.quantity),
    unit: item.unitName,
    unitPrice: money(item.unitPrice),
    amount: money(item.amount),
    docTotal,
    remark: `รอบ ${debt.batchNo}`,
  }))
}

/**
 * The invoice as goods received.
 *
 * A grade with no weight is left out rather than sent as a zero line: a stock
 * movement of nothing is not a stock movement, and it would only make the
 * accounting side reconcile lines that never happened.
 */
export function purchaseRows(purchase: PurchaseSummary): ExportRow[] {
  const docTotal = money(purchase.grossAmount)
  const breed = purchase.breedName ? `${purchase.breedName}` : ''
  const hatch = purchase.hatchDate ? ` · รุ่นฟัก ${day(purchase.hatchDate)}` : ''

  return purchase.lines
    .map((line) => ({ line, weight: line.cocoonWeight ?? line.scrapWeight ?? 0 }))
    .filter(({ weight }) => weight > 0)
    .map(({ line, weight }) => ({
      docNo: purchase.transactionNo,
      docDate: day(purchase.completedAt ?? purchase.purchaseDate),
      vendCode: purchase.farmerCode,
      vendName: purchase.farmerName,
      branchCode: purchase.branchId,
      batchNo: purchase.batchNo ?? '',
      itemCode: `COCOON-${line.grade}`,
      itemName: line.label,
      qty: weight.toFixed(2),
      unit: 'กิโลกรัม',
      unitPrice: money(line.unitPrice ?? 0),
      amount: money(line.amount ?? 0),
      docTotal,
      remark: `${breed}${hatch}`.trim(),
    }))
}

export function deductionRows(deduction: DebtDeduction, debt: DebtRecord): ExportRow[] {
  return [
    {
      docNo: deduction.id,
      docDate: day(deduction.at),
      custCode: debt.farmerCode,
      custName: debt.farmerName,
      branchCode: debt.branchId,
      batchNo: debt.batchNo,
      arDocNo: debt.sourceNo,
      apDocNo: deduction.transactionNo ?? '',
      amount: money(deduction.amount),
      remark: deduction.remark ?? `หักกลบหนี้ รอบ ${debt.batchNo}`,
    },
  ]
}

export function paymentRows(payment: FarmerPayment): ExportRow[] {
  return [
    {
      docNo: payment.paymentNo,
      docDate: day(payment.paidDate ?? payment.updatedAt),
      custCode: payment.farmerCode,
      custName: payment.farmerName,
      branchCode: payment.branchId,
      batchNo: payment.batchNo ?? '',
      apDocNo: payment.transactionNo,
      grossAmount: money(payment.grossAmount),
      deductAmount: money(payment.deductedAmount),
      amount: money(payment.netAmount),
      payType: payment.method === 'CASH' ? 'CASH' : 'TRANSFER',
      bankName: payment.bankName ?? '',
      accountNo: payment.accountNo ?? '',
      payRef: payment.transferRef ?? '',
      remark: payment.remark ?? `จ่ายส่วนต่างค่ารังไหมสด รอบ ${payment.batchNo ?? '-'}`,
    },
  ]
}

/**
 * CSV with a UTF-8 BOM.
 *
 * Excel on a Thai Windows install reads a BOM-less UTF-8 file as TIS-620 and
 * turns every farmer's name into mojibake, so the BOM is not optional here.
 */
export function toCsv(kind: ExportKind, rows: ExportRow[]): string {
  const columns = COLUMNS[kind]
  const escape = (value: string | number) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }

  const lines = [
    columns.map((c) => c.header).join(','),
    ...rows.map((row) => columns.map((c) => escape(row[c.key] ?? '')).join(',')),
  ]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

const FILE_PREFIX: Record<ExportKind, string> = {
  DEBT: 'BPLUS_AR',
  PURCHASE: 'BPLUS_PURCHASE',
  DEDUCTION: 'BPLUS_OFFSET',
  PAYMENT: 'BPLUS_PAYMENT',
}

export function fileNameFor(kind: ExportKind, batchNo: string): string {
  return `${FILE_PREFIX[kind]}_${batchNo}.csv`
}

/** หัวข้อที่ผู้ใช้เห็นบนหน้าจอ ตรงกับเหตุการณ์ทางบัญชีหนึ่งเหตุการณ์ */
export const KIND_LABEL: Record<ExportKind, string> = {
  DEBT: 'ตั้งหนี้ (ลูกหนี้เกษตรกร)',
  PURCHASE: 'ซื้อรังไหมสด (วัตถุดิบ)',
  DEDUCTION: 'ตัดหนี้ (หักกลบ)',
  PAYMENT: 'จ่ายเงินเกษตรกร',
}

/** คำอธิบายการลงบัญชีของแต่ละชนิด ใช้บอกฝ่ายบัญชีว่าไฟล์นี้คือรายการอะไร */
export const KIND_ENTRY: Record<ExportKind, string> = {
  DEBT: 'Dr ลูกหนี้การค้า-เกษตรกร / Cr รายได้ขายวัสดุการเลี้ยง',
  PURCHASE: 'Dr วัตถุดิบ-รังไหมสด / Cr เจ้าหนี้-เกษตรกร',
  DEDUCTION: 'Dr เจ้าหนี้-เกษตรกร / Cr ลูกหนี้การค้า-เกษตรกร',
  PAYMENT: 'Dr เจ้าหนี้-เกษตรกร / Cr เงินสด-ธนาคาร',
}
