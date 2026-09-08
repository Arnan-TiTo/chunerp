import type { Permission, Role } from '@/types/auth'

export const ALL_PERMISSIONS: Permission[] = [
  'dashboard:view',
  'farmer:view', 'farmer:create', 'farmer:edit', 'farmer:viewSensitive',
  'booking:view', 'booking:create', 'booking:edit', 'booking:cancel', 'booking:deliver',
  'queue:view', 'queue:create', 'queue:call', 'queue:cancel',
  'weighing:edit', 'weighing:override', 'quality:edit',
  'purchase:view', 'purchase:complete',
  'debt:view', 'debt:deduct', 'debt:approve', 'debt:export', 'payment:pay',
  'expense:view', 'expense:create', 'expense:edit', 'expense:cancel', 'expense:approve',
  'product:view', 'product:manage',
  'report:view', 'report:export',
  'audit:view', 'permission:manage', 'setting:manage',
]

/**
 * §13 role → permission matrix.
 *
 * This is the *frontend* projection used for route and action guards. The
 * backend remains the final authority; hiding a menu is never treated as a
 * security control.
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ALL_PERMISSIONS,

  FARM_MANAGER: [
    'dashboard:view',
    'farmer:view', 'farmer:create', 'farmer:edit', 'farmer:viewSensitive',
    'booking:view', 'booking:create', 'booking:edit', 'booking:cancel', 'booking:deliver',
    'queue:view', 'queue:create', 'queue:call',
    'purchase:view',
    'product:view', 'product:manage',
    'report:view', 'report:export',
    'audit:view',
  ],

  RECEIVING_STAFF: [
    'dashboard:view',
    'farmer:view',
    'booking:view',
    'queue:view', 'queue:create', 'queue:call', 'queue:cancel',
    'weighing:edit', 'quality:edit',
    'purchase:view',
  ],

  ACCOUNTING: [
    'dashboard:view',
    'farmer:view',
    'purchase:view',
    'product:view',
    'debt:view', 'debt:deduct', 'debt:export', 'payment:pay',
    'expense:view', 'expense:create', 'expense:edit', 'expense:cancel',
    'report:view', 'report:export',
    'audit:view',
  ],

  MANAGER: [
    'dashboard:view',
    'farmer:view',
    'booking:view',
    'queue:view',
    'purchase:view', 'purchase:complete',
    'product:view',
    'debt:view', 'debt:approve',
    'expense:view', 'expense:approve',
    'report:view', 'report:export',
    'audit:view',
  ],

  VIEWER: [
    'dashboard:view',
    'farmer:view',
    'booking:view',
    'queue:view',
    'purchase:view',
    'debt:view',
    'expense:view',
    'report:view',
  ],
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'ผู้ดูแลระบบ',
  FARM_MANAGER: 'ผู้จัดการฟาร์ม',
  RECEIVING_STAFF: 'เจ้าหน้าที่รับซื้อ',
  ACCOUNTING: 'บัญชี / การเงิน',
  MANAGER: 'ผู้บริหาร',
  VIEWER: 'ผู้ใช้ทั่วไป (อ่านอย่างเดียว)',
}

export const PERMISSION_GROUPS: { label: string; permissions: Permission[] }[] = [
  { label: 'Dashboard', permissions: ['dashboard:view'] },
  { label: 'ส่งเสริมเกษตรกร', permissions: ['farmer:view', 'farmer:create', 'farmer:edit', 'farmer:viewSensitive'] },
  { label: 'จองไข่ไหม', permissions: ['booking:view', 'booking:create', 'booking:edit', 'booking:cancel', 'booking:deliver'] },
  { label: 'รับซื้อรังไหมสด', permissions: ['queue:view', 'queue:create', 'queue:call', 'queue:cancel', 'weighing:edit', 'weighing:override', 'quality:edit', 'purchase:view', 'purchase:complete'] },
  { label: 'ตัดหนี้ / จ่ายเงิน', permissions: ['debt:view', 'debt:deduct', 'debt:approve', 'debt:export', 'payment:pay'] },
  { label: 'ค่าใช้จ่าย', permissions: ['expense:view', 'expense:create', 'expense:edit', 'expense:cancel', 'expense:approve'] },
  { label: 'ข้อมูลหลักสินค้า', permissions: ['product:view', 'product:manage'] },
  { label: 'รายงาน', permissions: ['report:view', 'report:export'] },
  { label: 'ระบบ', permissions: ['audit:view', 'permission:manage', 'setting:manage'] },
]

export const PERMISSION_LABELS: Record<Permission, string> = {
  'dashboard:view': 'เข้าถึงแดชบอร์ด',
  'farmer:view': 'ดูข้อมูลเกษตรกร',
  'farmer:create': 'เพิ่มเกษตรกร',
  'farmer:edit': 'แก้ไขเกษตรกร',
  'farmer:viewSensitive': 'ดูข้อมูลอ่อนไหว (เลขบัตร)',
  'booking:view': 'ดูใบจอง',
  'booking:create': 'สร้างใบจอง',
  'booking:edit': 'แก้ไขใบจอง',
  'booking:cancel': 'ยกเลิกใบจอง',
  'booking:deliver': 'บันทึกส่งของ (ตั้งหนี้)',
  'queue:view': 'ดูคิว',
  'queue:create': 'ลงทะเบียนคิว',
  'queue:call': 'เรียกคิว / เริ่มชั่ง',
  'queue:cancel': 'ยกเลิกคิว',
  'weighing:edit': 'บันทึกน้ำหนัก',
  'weighing:override': 'แก้ไขน้ำหนักที่ล็อกแล้ว',
  'quality:edit': 'บันทึกคุณภาพ',
  'purchase:view': 'ดูสรุปการรับซื้อ',
  'purchase:complete': 'ปิดรายการรับซื้อ',
  'debt:view': 'ดูรายการหนี้',
  'debt:deduct': 'ตัดหนี้',
  'debt:approve': 'อนุมัติการตัดหนี้',
  'debt:export': 'ส่งออกไประบบบัญชี',
  'payment:pay': 'บันทึกจ่ายเงินเกษตรกร',
  'expense:view': 'ดูค่าใช้จ่าย',
  'expense:create': 'บันทึกค่าใช้จ่าย',
  'expense:edit': 'แก้ไขค่าใช้จ่าย',
  'expense:cancel': 'ยกเลิกค่าใช้จ่าย',
  'expense:approve': 'อนุมัติค่าใช้จ่าย',
  'product:view': 'ดูข้อมูลหลักสินค้า',
  'product:manage': 'จัดการสินค้า / หน่วย / ราคา / คลัง',
  'report:view': 'ดูรายงาน',
  'report:export': 'ส่งออกรายงาน',
  'audit:view': 'ดูประวัติการใช้งาน',
  'permission:manage': 'จัดการสิทธิ์ผู้ใช้',
  'setting:manage': 'ตั้งค่าระบบ',
}
