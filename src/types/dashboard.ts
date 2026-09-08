import type { Permission, Role } from './auth'
import type { QueueStatus } from './domain'

/**
 * ประเภทงาน — "work type".
 *
 * The dashboard is not one fixed page. Each work type is a self-contained
 * operational view with its own KPIs, panels and quick actions, and each user
 * only ever sees the work types their permissions allow ("เป็นของใครของมัน").
 * Switching work type re-queries the dashboard snapshot; nothing is derived on
 * the client.
 */
export type WorkTypeId =
  | 'ADMIN'
  | 'PROMOTION'
  | 'RECEIVING'
  | 'FINANCE'
  | 'EXECUTIVE'

export type WorkTypeAccent = 'forest' | 'sage' | 'indigo' | 'tan' | 'mauve'

/** One sidebar group inside a work area. */
export interface WorkTypeNavItem {
  label: string
  to: string
  icon: string
  permission?: Permission
  matchPrefix?: string
}

export interface WorkTypeNavGroup {
  label: string
  items: WorkTypeNavItem[]
}

export interface WorkTypeQuickAction {
  label: string
  to: string
  permission?: Permission
  variant?: 'primary' | 'secondary'
}

export interface WorkTypeDefinition {
  id: WorkTypeId
  /** Thai label shown in the switcher. */
  name: string
  nameEn: string
  description: string
  accent: WorkTypeAccent
  /** Roles for which this work type is the natural landing view. */
  primaryRoles: Role[]
  icon: string
  /** The viewer needs *all* of these to see the work area at all. */
  requiredPermissions: Permission[]
  /** …plus at least one of these, when present. */
  anyOfPermissions?: Permission[]
  /** The work area's own sidebar. */
  nav: WorkTypeNavGroup[]
  quickActions: WorkTypeQuickAction[]
  /** Deep link to the module this work type belongs to. */
  moduleTo: string
}

/* ── Snapshot returned by the dashboard service ─────────────────────────── */

export type KpiFormat = 'number' | 'currency' | 'weight' | 'percent'
export type KpiTone = 'default' | 'success' | 'warning' | 'danger' | 'info'

export interface KpiValue {
  id: string
  label: string
  value: number
  unit?: string
  format: KpiFormat
  tone?: KpiTone
  hint?: string
  delta?: {
    value: number
    direction: 'up' | 'down' | 'flat'
    label: string
  }
  /** Widget → filtered list (§7.2 "Action" column). */
  href?: string
}

export interface QueuePanelItem {
  id: string
  queueNo: number
  farmerName: string
  farmerCode: string
  status: QueueStatus
  waitingMinutes: number
  counter?: string
}

export interface ScheduleItem {
  id: string
  time: string
  title: string
  subtitle?: string
  kind: 'QUEUE' | 'DELIVERY' | 'PICKUP' | 'MEETING'
  href?: string
}

export interface AlertItem {
  id: string
  severity: 'info' | 'warning' | 'danger'
  title: string
  detail?: string
  href?: string
}

export interface TrendPoint {
  label: string
  value: number
}

export interface BreakdownItem {
  key: string
  label: string
  value: number
  unit?: string
  share: number
}

export interface RecentDocItem {
  id: string
  docNo: string
  title: string
  subtitle?: string
  amount?: number
  status: string
  statusTone: KpiTone
  at: string
  href?: string
}

export interface TaskItem {
  id: string
  title: string
  detail?: string
  dueLabel?: string
  overdue?: boolean
  href?: string
}

export type DashboardPanel =
  | { id: string; type: 'QUEUE_BOARD'; title: string; span: PanelSpan; items: QueuePanelItem[]; href?: string }
  | { id: string; type: 'SCHEDULE'; title: string; span: PanelSpan; items: ScheduleItem[]; href?: string }
  | { id: string; type: 'ALERTS'; title: string; span: PanelSpan; items: AlertItem[]; href?: string }
  | { id: string; type: 'TREND'; title: string; span: PanelSpan; unit: string; format: KpiFormat; points: TrendPoint[]; href?: string }
  | { id: string; type: 'BREAKDOWN'; title: string; span: PanelSpan; unit?: string; format: KpiFormat; items: BreakdownItem[]; href?: string }
  | { id: string; type: 'RECENT_DOCS'; title: string; span: PanelSpan; items: RecentDocItem[]; href?: string }
  | { id: string; type: 'TASKS'; title: string; span: PanelSpan; items: TaskItem[]; href?: string }

export type PanelSpan = 'half' | 'full' | 'third' | 'twothird'

export interface DashboardSnapshot {
  workTypeId: WorkTypeId
  generatedAt: string
  branchId: string
  range: { from: string; to: string }
  kpis: KpiValue[]
  panels: DashboardPanel[]
}

export interface DashboardParams {
  workTypeId: WorkTypeId
  branchId: string
  dateFrom: string
  dateTo: string
}
