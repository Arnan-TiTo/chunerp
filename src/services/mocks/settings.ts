import type { SystemSetting } from '@/services/api/contracts'
import { RECEIVING_CONSTANTS } from './db'

/**
 * SYS-003 — config-driven settings.
 * Items flagged `pendingConfirmation` are the §20 open questions: they are
 * exposed as configuration rather than baked into the frontend.
 */
export const DEFAULT_SETTINGS: SystemSetting[] = [
  { key: 'queue.autoRefreshSeconds', group: 'คิวรับซื้อ', label: 'รีเฟรชคิวอัตโนมัติ (วินาที)', type: 'number', value: 30 },
  { key: 'queue.waitWarningMinutes', group: 'คิวรับซื้อ', label: 'เตือนเมื่อรอเกิน (นาที)', type: 'number', value: 30 },
  { key: 'weighing.allowManualInput', group: 'การชั่ง', label: 'อนุญาตกรอกน้ำหนักด้วยมือ', type: 'boolean', value: true },
  { key: 'weighing.decimalPlaces', group: 'การชั่ง', label: 'ทศนิยมของน้ำหนัก', type: 'number', value: 2 },
  { key: 'quality.moistureMin', group: 'คุณภาพ', label: 'ความชื้นต่ำสุดที่รับได้ (%)', type: 'number', value: 8, pendingConfirmation: true },
  { key: 'quality.moistureMax', group: 'คุณภาพ', label: 'ความชื้นสูงสุดที่รับได้ (%)', type: 'number', value: 30, pendingConfirmation: true },
  { key: 'quality.cocoonUnit', group: 'คุณภาพ', label: 'หน่วยนับรังไหม', type: 'select', value: 'BAG', options: [{ value: 'BAG', label: 'ถุง' }, { value: 'KG', label: 'กิโลกรัม' }], pendingConfirmation: true },
  { key: 'program.guaranteedGoodPrice', group: 'โครงการ', label: 'ราคาประกันรังดี (บาท/กก.)', type: 'number', value: 200, pendingConfirmation: true },
  { key: 'debt.deductionCeiling', group: 'ตัดหนี้', label: 'เพดานการตัดหนี้', type: 'select', value: 'PURCHASE_GROSS', options: [{ value: 'PURCHASE_GROSS', label: 'ยอดรวมรายได้ในใบรับซื้อ' }], description: 'ยอดรวมรายได้ในใบรับซื้อรังไหมสดคือยอดที่นำไปหักหนี้ได้' },
  { key: 'debt.matchByBatch', group: 'ตัดหนี้', label: 'ตัดหนี้เฉพาะรอบเดียวกัน', type: 'boolean', value: true, description: 'รายได้ของรอบหนึ่งจะไม่ถูกนำไปหักหนี้ของอีกรอบ' },
  { key: 'purchase.price.GOOD', group: 'ราคารับซื้อ', label: 'ราคารังดี (บาท/กก.)', type: 'number', value: RECEIVING_CONSTANTS.gradePrice.GOOD },
  { key: 'purchase.price.DAMAGED', group: 'ราคารับซื้อ', label: 'ราคารังเสีย (บาท/กก.)', type: 'number', value: RECEIVING_CONSTANTS.gradePrice.DAMAGED },
  { key: 'purchase.price.DOUBLE', group: 'ราคารับซื้อ', label: 'ราคารังแฝด (บาท/กก.)', type: 'number', value: RECEIVING_CONSTANTS.gradePrice.DOUBLE },
  { key: 'purchase.price.THIN', group: 'ราคารับซื้อ', label: 'ราคารังบาง (บาท/กก.)', type: 'number', value: RECEIVING_CONSTANTS.gradePrice.THIN },
  { key: 'purchase.price.FLOSS', group: 'ราคารับซื้อ', label: 'ราคาปุยไหม (บาท/กก.)', type: 'number', value: RECEIVING_CONSTANTS.gradePrice.FLOSS },
  { key: 'purchase.bonusPerKg', group: 'ราคารับซื้อ', label: 'เงินเพิ่มพิเศษ (บาท/กก.)', type: 'number', value: RECEIVING_CONSTANTS.bonusPerKg, description: 'จ่ายภายในงวดบัญชี' },
  { key: 'analysis.eggWeightPerBoxG', group: 'วิเคราะห์เอกสาร', label: 'น้ำหนักไข่ไหมต่อกล่อง (กรัม)', type: 'number', value: RECEIVING_CONSTANTS.eggWeightPerBoxG, pendingConfirmation: true },
  { key: 'analysis.eggsPerGram', group: 'วิเคราะห์เอกสาร', label: 'จำนวนไข่ต่อกรัม', type: 'number', value: RECEIVING_CONSTANTS.eggsPerGram, pendingConfirmation: true },
  { key: 'analysis.minWeightPerCocoonG', group: 'วิเคราะห์เอกสาร', label: 'เกณฑ์ น้ำหนัก/รัง (กรัม)', type: 'number', value: RECEIVING_CONSTANTS.minWeightPerCocoonG },
  { key: 'analysis.targetShellPercent', group: 'วิเคราะห์เอกสาร', label: 'เกณฑ์ %เปลือกรัง', type: 'number', value: RECEIVING_CONSTANTS.targetShellPercent, pendingConfirmation: true },
  { key: 'analysis.maxMoisturePercent', group: 'วิเคราะห์เอกสาร', label: 'เพดาน %ความชื้น', type: 'number', value: RECEIVING_CONSTANTS.maxMoisturePercent, pendingConfirmation: true },
  { key: 'analysis.targetSurvivalPercent', group: 'วิเคราะห์เอกสาร', label: 'เป้า %เลี้ยงรอด', type: 'number', value: RECEIVING_CONSTANTS.targetSurvivalPercent, pendingConfirmation: true },
  { key: 'expense.requireAttachment', group: 'ค่าใช้จ่าย', label: 'บังคับแนบเอกสารก่อนส่งอนุมัติ', type: 'boolean', value: false },
  { key: 'expense.maxUploadMb', group: 'ค่าใช้จ่าย', label: 'ขนาดไฟล์แนบสูงสุด (MB)', type: 'number', value: 10 },
]
