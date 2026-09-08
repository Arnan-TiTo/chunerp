import type { WorkTypeDefinition, WorkTypeId } from '@/types/dashboard'
import type { Permission, User } from '@/types/auth'

/**
 * ประเภทงาน / พื้นที่การทำงาน — the work-area registry.
 *
 * Each work type is a self-contained module with its own sidebar, its own
 * dashboard snapshot and its own accent colour. A user only ever sees the work
 * areas their permissions unlock ("เป็นของใครของมัน"), and switching work area
 * swaps the whole shell — nav, dashboard and accent together.
 *
 * Static *shape* only: every number rendered inside a work area comes from the
 * dashboard service, never from this file (§7.2).
 */
export const WORK_TYPES: WorkTypeDefinition[] = [
  {
    /**
     * The unscoped view: every module in one sidebar, for people who work
     * across the whole operation rather than inside one job. Gated on
     * `permission:manage`, so only administrators are offered it.
     */
    id: 'ADMIN',
    name: 'ผู้ดูแลระบบ',
    nameEn: 'System Administration',
    description: 'เห็นทุกเมนูในแถบเดียว — เกษตรกร ใบจอง คิวรับซื้อ ตัดหนี้ ค่าใช้จ่าย รายงาน และระบบ',
    accent: 'forest',
    icon: 'shield',
    primaryRoles: ['ADMIN'],
    requiredPermissions: ['dashboard:view', 'permission:manage'],
    moduleTo: '/dashboard',
    quickActions: [
      { label: 'จัดการสิทธิ์ผู้ใช้', to: '/system/permissions', permission: 'permission:manage', variant: 'primary' },
      { label: 'ตั้งค่าระบบ', to: '/system/settings', permission: 'setting:manage', variant: 'secondary' },
    ],
    nav: [
      {
        label: 'งานหลัก',
        items: [
          { label: 'ทะเบียนเกษตรกร', to: '/farmers', icon: 'users', permission: 'farmer:view', matchPrefix: '/farmers' },
          { label: 'จองไข่ไหม', to: '/bookings', icon: 'package', permission: 'booking:view', matchPrefix: '/bookings' },
          { label: 'จุดคัดแยก', to: '/receiving/sorting', icon: 'check-square', permission: 'queue:view', matchPrefix: '/receiving/sorting' },
          { label: 'จุดชั่งน้ำหนัก', to: '/receiving/weighing', icon: 'scale', permission: 'weighing:edit', matchPrefix: '/receiving/weighing' },
          { label: 'ตัดหนี้รังไหมสด', to: '/debts', icon: 'coins', permission: 'debt:view', matchPrefix: '/debts' },
          { label: 'จ่ายเงินเกษตรกร', to: '/payments', icon: 'banknote', permission: 'debt:view', matchPrefix: '/payments' },
          { label: 'บันทึกค่าใช้จ่าย', to: '/expenses', icon: 'wallet', permission: 'expense:view', matchPrefix: '/expenses' },
        ],
      },
      {
        label: 'สร้างเอกสาร',
        items: [
          { label: 'เพิ่มเกษตรกร', to: '/farmers/new', icon: 'plus', permission: 'farmer:create' },
          { label: 'สร้างใบจอง', to: '/bookings/new', icon: 'plus', permission: 'booking:create' },
          { label: 'ออกใบคิวรับซื้อ', to: '/receiving/sorting/new', icon: 'plus', permission: 'queue:create' },
          { label: 'บันทึกค่าใช้จ่าย', to: '/expenses/new', icon: 'plus', permission: 'expense:create' },
        ],
      },
      {
        label: 'รายงาน',
        items: [
          { label: 'ศูนย์รายงาน', to: '/reports', icon: 'chart', permission: 'report:view', matchPrefix: '/reports' },
          { label: 'ส่งข้อมูลบัญชี BPlus', to: '/accounting/export', icon: 'upload', permission: 'debt:export', matchPrefix: '/accounting' },
        ],
      },
    ],
  },
  {
    id: 'PROMOTION',
    name: 'ส่งเสริมเกษตรกร',
    nameEn: 'Farm Promotion',
    description: 'ทะเบียนเกษตรกร การเข้าร่วมโครงการ ใบจองไข่ไหม และกำหนดส่งมอบ',
    accent: 'sage',
    icon: 'sprout',
    primaryRoles: ['FARM_MANAGER'],
    requiredPermissions: ['dashboard:view', 'farmer:view'],
    moduleTo: '/farmers',
    quickActions: [
      { label: 'เพิ่มเกษตรกร', to: '/farmers/new', permission: 'farmer:create', variant: 'primary' },
      { label: 'สร้างใบจอง', to: '/bookings/new', permission: 'booking:create', variant: 'secondary' },
    ],
    nav: [
      {
        label: 'เกษตรกร',
        items: [
          { label: 'ทะเบียนเกษตรกร', to: '/farmers', icon: 'users', permission: 'farmer:view', matchPrefix: '/farmers' },
        ],
      },
      {
        label: 'ไข่ไหม',
        items: [
          { label: 'ใบจองทั้งหมด', to: '/bookings', icon: 'package', permission: 'booking:view', matchPrefix: '/bookings' },
          { label: 'สร้างใบจอง', to: '/bookings/new', icon: 'plus', permission: 'booking:create' },
        ],
      },
    ],
  },
  {
    id: 'RECEIVING',
    name: 'รับซื้อรังไหมสด',
    nameEn: 'Cocoon Receiving',
    description: 'จุดคัดแยกออกใบคิว จุดชั่งน้ำหนัก และสรุปการรับซื้อ',
    accent: 'indigo',
    icon: 'scale',
    primaryRoles: ['RECEIVING_STAFF'],
    requiredPermissions: ['dashboard:view', 'queue:view'],
    moduleTo: '/receiving/sorting',
    quickActions: [
      { label: 'ออกใบคิวใหม่', to: '/receiving/sorting/new', permission: 'queue:create', variant: 'primary' },
      { label: 'จุดชั่งน้ำหนัก', to: '/receiving/weighing', permission: 'weighing:edit', variant: 'secondary' },
    ],
    nav: [
      {
        label: 'หน้างาน',
        items: [
          { label: 'จุดคัดแยก', to: '/receiving/sorting', icon: 'check-square', permission: 'queue:view', matchPrefix: '/receiving/sorting' },
          { label: 'จุดชั่งน้ำหนัก', to: '/receiving/weighing', icon: 'scale', permission: 'weighing:edit', matchPrefix: '/receiving/weighing' },
        ],
      },
      {
        label: 'ข้อมูลอ้างอิง',
        items: [
          { label: 'ทะเบียนเกษตรกร', to: '/farmers', icon: 'users', permission: 'farmer:view', matchPrefix: '/farmers' },
          { label: 'ใบจองไข่ไหม', to: '/bookings', icon: 'package', permission: 'booking:view', matchPrefix: '/bookings' },
        ],
      },
    ],
  },
  {
    id: 'FINANCE',
    name: 'บัญชีและการเงิน',
    nameEn: 'Finance & Accounting',
    description: 'ตัดหนี้รังไหมสด จ่ายส่วนต่างให้เกษตรกร ส่งข้อมูลเข้าระบบบัญชี และบันทึกค่าใช้จ่าย',
    accent: 'tan',
    icon: 'wallet',
    primaryRoles: ['ACCOUNTING'],
    requiredPermissions: ['dashboard:view'],
    anyOfPermissions: ['debt:view', 'expense:view'],
    moduleTo: '/expenses',
    quickActions: [
      { label: 'บันทึกค่าใช้จ่าย', to: '/expenses/new', permission: 'expense:create', variant: 'primary' },
      { label: 'จ่ายเงินเกษตรกร', to: '/payments', permission: 'debt:view', variant: 'secondary' },
    ],
    nav: [
      {
        label: 'ตัดหนี้และจ่ายเงิน',
        items: [
          { label: 'รายการตัดหนี้', to: '/debts', icon: 'coins', permission: 'debt:view', matchPrefix: '/debts' },
          { label: 'จ่ายเงินเกษตรกร', to: '/payments', icon: 'banknote', permission: 'debt:view', matchPrefix: '/payments' },
          { label: 'ส่งข้อมูลบัญชี BPlus', to: '/accounting/export', icon: 'upload', permission: 'debt:export', matchPrefix: '/accounting' },
        ],
      },
      {
        label: 'ค่าใช้จ่าย',
        items: [
          { label: 'รายการทั้งหมด', to: '/expenses', icon: 'wallet', permission: 'expense:view', matchPrefix: '/expenses' },
          { label: 'บันทึกค่าใช้จ่าย', to: '/expenses/new', icon: 'plus', permission: 'expense:create' },
        ],
      },
    ],
  },
  {
    id: 'EXECUTIVE',
    name: 'ภาพรวมผู้บริหาร',
    nameEn: 'Executive Overview',
    description: 'สรุปเอกสาร ยอดรับซื้อ หนี้คงค้าง และรายงานทุกสาขาในมุมมองเดียว',
    accent: 'mauve',
    icon: 'chart',
    primaryRoles: ['MANAGER', 'VIEWER'],
    requiredPermissions: ['dashboard:view', 'report:view'],
    moduleTo: '/reports',
    quickActions: [
      { label: 'เปิดรายงาน', to: '/reports', permission: 'report:view', variant: 'primary' },
    ],
    nav: [
      {
        label: 'รายงาน',
        items: [
          { label: 'ศูนย์รายงาน', to: '/reports', icon: 'chart', permission: 'report:view', matchPrefix: '/reports' },
        ],
      },
      {
        label: 'ข้อมูลหลัก',
        items: [
          { label: 'เกษตรกร', to: '/farmers', icon: 'users', permission: 'farmer:view', matchPrefix: '/farmers' },
          { label: 'ใบจองไข่ไหม', to: '/bookings', icon: 'package', permission: 'booking:view', matchPrefix: '/bookings' },
          { label: 'คิวรับซื้อ', to: '/receiving/sorting', icon: 'scale', permission: 'queue:view', matchPrefix: '/receiving' },
          { label: 'ตัดหนี้', to: '/debts', icon: 'coins', permission: 'debt:view', matchPrefix: '/debts' },
          { label: 'จ่ายเงินเกษตรกร', to: '/payments', icon: 'banknote', permission: 'debt:view', matchPrefix: '/payments' },
          { label: 'ค่าใช้จ่าย', to: '/expenses', icon: 'wallet', permission: 'expense:view', matchPrefix: '/expenses' },
        ],
      },
    ],
  },
]

/** Appended to every work area's sidebar for users who hold the permissions. */
export const SYSTEM_NAV = {
  label: 'SYSTEM SETTING',
  items: [
    { label: 'ประวัติการใช้งาน', to: '/system/audit', icon: 'history' as const, permission: 'audit:view' as Permission },
    { label: 'สิทธิ์ผู้ใช้งาน', to: '/system/permissions', icon: 'shield' as const, permission: 'permission:manage' as Permission },
    { label: 'ข้อมูลหลัก', to: '/master', icon: 'grid' as const, permission: 'product:view' as Permission },
    { label: 'ข้อมูลหลักสินค้า', to: '/products', icon: 'archive' as const, permission: 'product:view' as Permission },
    { label: 'ตั้งค่าระบบ', to: '/system/settings', icon: 'settings' as const, permission: 'setting:manage' as Permission },
  ],
}

export const WORK_TYPE_MAP: Record<WorkTypeId, WorkTypeDefinition> = WORK_TYPES.reduce(
  (acc, wt) => {
    acc[wt.id] = wt
    return acc
  },
  {} as Record<WorkTypeId, WorkTypeDefinition>,
)

/** Work areas the given permission set unlocks, in registry order. */
export function getAvailableWorkTypes(permissions: Permission[]): WorkTypeDefinition[] {
  const owned = new Set(permissions)
  return WORK_TYPES.filter(
    (wt) =>
      wt.requiredPermissions.every((p) => owned.has(p)) &&
      (!wt.anyOfPermissions || wt.anyOfPermissions.some((p) => owned.has(p))),
  )
}

/**
 * "เป็นของใครของมัน" — resolve the work area this particular user should land
 * on: their own saved choice first, then the server default, then the one that
 * matches their role, then whatever they can actually open.
 */
export function resolveDefaultWorkType(
  user: Pick<User, 'role' | 'permissions' | 'defaultWorkTypeId'>,
  savedWorkTypeId?: string | null,
): WorkTypeId | null {
  const available = getAvailableWorkTypes(user.permissions)
  if (available.length === 0) return null

  const byId = (id?: string | null) => (id ? available.find((wt) => wt.id === id) : undefined)

  return (
    byId(savedWorkTypeId)?.id ??
    byId(user.defaultWorkTypeId)?.id ??
    available.find((wt) => wt.primaryRoles.includes(user.role))?.id ??
    available[0].id
  )
}

/** Per-user storage key so two accounts on one tablet never share a choice. */
export function workTypeStorageKey(userId: string): string {
  return `chulfarm.workType.${userId}`
}

/**
 * Accent styling per work area. The shell writes `--accent` / `--accent-soft`
 * from here, so components stay module-agnostic.
 */
export const ACCENT_VARS: Record<
  WorkTypeDefinition['accent'],
  { accent: string; accentSoft: string; accentDeep: string; onAccent: string }
> = {
  /** Shade beneath the stilt houses. */
  forest: {
    accent: '#2a5340',
    accentSoft: 'rgba(42,83,64,0.10)',
    accentDeep: '#1c3d2d',
    onAccent: '#ffffff',
  },
  /** Rice-field green. */
  sage: {
    accent: '#6e8b54',
    accentSoft: 'rgba(110,139,84,0.13)',
    accentDeep: '#55703f',
    onAccent: '#ffffff',
  },
  /** The villagers' indigo, echoed in the far hills. */
  indigo: {
    accent: '#46617f',
    accentSoft: 'rgba(70,97,127,0.12)',
    accentDeep: '#33485f',
    onAccent: '#ffffff',
  },
  /** Teak roofs and the cart wheel. */
  tan: {
    accent: '#a8763f',
    accentSoft: 'rgba(235,196,155,0.32)',
    accentDeep: '#7d5629',
    onAccent: '#ffffff',
  },
  /** The mauve sashes. */
  mauve: {
    accent: '#a5717f',
    accentSoft: 'rgba(194,151,161,0.22)',
    accentDeep: '#855967',
    onAccent: '#ffffff',
  },
}

/** Tailwind class fragments for the hub cards and dashboard heroes. */
export const ACCENT_CLASSES: Record<
  WorkTypeDefinition['accent'],
  { chip: string; bar: string; hero: string; text: string }
> = {
  forest: {
    chip: 'bg-forest-soft text-forest',
    bar: 'bg-forest',
    hero: 'bg-gradient-to-br from-forest to-forest-dark',
    text: 'text-forest',
  },
  sage: {
    chip: 'bg-sage-soft text-sage-dark',
    bar: 'bg-sage',
    hero: 'bg-gradient-to-br from-sage to-sage-dark',
    text: 'text-sage-dark',
  },
  indigo: {
    chip: 'bg-indigo-soft text-indigo',
    bar: 'bg-indigo',
    hero: 'bg-gradient-to-br from-indigo to-indigo-dark',
    text: 'text-indigo',
  },
  tan: {
    chip: 'bg-tan-soft text-tan',
    bar: 'bg-tan',
    hero: 'bg-gradient-to-br from-tan to-tan-dark',
    text: 'text-tan',
  },
  mauve: {
    chip: 'bg-mauve-soft text-mauve-dark',
    bar: 'bg-mauve',
    hero: 'bg-gradient-to-br from-mauve to-mauve-dark',
    text: 'text-mauve-dark',
  },
}
