import type { Permission } from '@/types/auth'
import type { IconName } from '@/components/ui/Icon'

export interface NavItem {
  label: string
  to: string
  icon: IconName
  permission?: Permission
  /** Marks the item active for any nested route under this prefix. */
  matchPrefix?: string
  badgeKey?: 'queueWaiting' | 'expensePending'
}

export interface NavSection {
  label?: string
  items: NavItem[]
}

/** §4 Information Architecture, rendered as the sidebar. */
export const NAVIGATION: NavSection[] = [
  {
    items: [
      { label: 'แดชบอร์ด', to: '/dashboard', icon: 'home', permission: 'dashboard:view' },
    ],
  },
  {
    label: 'งานหลัก',
    items: [
      { label: 'ส่งเสริมเกษตรกร', to: '/farmers', icon: 'users', permission: 'farmer:view', matchPrefix: '/farmers' },
      { label: 'จองไข่ไหม', to: '/bookings', icon: 'package', permission: 'booking:view', matchPrefix: '/bookings' },
      { label: 'รับซื้อรังไหมสด', to: '/receiving/queue', icon: 'scale', permission: 'queue:view', matchPrefix: '/receiving', badgeKey: 'queueWaiting' },
      { label: 'ตัดหนี้รังไหมสด', to: '/debts', icon: 'coins', permission: 'debt:view', matchPrefix: '/debts' },
      { label: 'จ่ายเงินเกษตรกร', to: '/payments', icon: 'banknote', permission: 'debt:view', matchPrefix: '/payments' },
      { label: 'บันทึกค่าใช้จ่าย', to: '/expenses', icon: 'wallet', permission: 'expense:view', matchPrefix: '/expenses', badgeKey: 'expensePending' },
    ],
  },
  {
    label: 'รายงานและระบบ',
    items: [
      { label: 'ส่งข้อมูลบัญชี BPlus', to: '/accounting/export', icon: 'upload', permission: 'debt:export', matchPrefix: '/accounting' },
      { label: 'รายงาน', to: '/reports', icon: 'chart', permission: 'report:view', matchPrefix: '/reports' },
      { label: 'ประวัติการใช้งาน', to: '/system/audit', icon: 'history', permission: 'audit:view' },
      { label: 'สิทธิ์ผู้ใช้งาน', to: '/system/permissions', icon: 'shield', permission: 'permission:manage' },
      { label: 'ตั้งค่าระบบ', to: '/system/settings', icon: 'settings', permission: 'setting:manage' },
    ],
  },
]

/** Breadcrumb labels keyed by the first path segment. */
export const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'แดชบอร์ด',
  farmers: 'ส่งเสริมเกษตรกร',
  bookings: 'จองไข่ไหม',
  receiving: 'รับซื้อรังไหมสด',
  queue: 'คิว',
  weighing: 'ชั่งน้ำหนัก',
  quality: 'คัดคุณภาพ',
  summary: 'สรุปการรับซื้อ',
  debts: 'ตัดหนี้รังไหมสด',
  payments: 'จ่ายเงินเกษตรกร',
  accounting: 'งานบัญชี',
  export: 'ส่งข้อมูลไประบบบัญชี',
  expenses: 'บันทึกค่าใช้จ่าย',
  reports: 'รายงาน',
  system: 'ระบบ',
  audit: 'ประวัติการใช้งาน',
  permissions: 'สิทธิ์ผู้ใช้งาน',
  settings: 'ตั้งค่าระบบ',
  new: 'สร้างใหม่',
  edit: 'แก้ไข',
}
