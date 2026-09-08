import type { Branch } from './common'

/** §13 RBAC — roles as defined in the master spec. */
export type Role =
  | 'ADMIN'
  | 'FARM_MANAGER'
  | 'RECEIVING_STAFF'
  | 'ACCOUNTING'
  | 'MANAGER'
  | 'VIEWER'

/**
 * Fine-grained permissions. Route guards and action guards both read from this
 * list. Menu hiding is cosmetic only — the backend stays the final authority
 * (§13).
 */
export type Permission =
  // dashboard
  | 'dashboard:view'
  // farmers
  | 'farmer:view'
  | 'farmer:create'
  | 'farmer:edit'
  | 'farmer:viewSensitive'
  // bookings
  | 'booking:view'
  | 'booking:create'
  | 'booking:edit'
  | 'booking:cancel'
  /** บันทึกส่งของ — hands the goods over and raises the debt. */
  | 'booking:deliver'
  // receiving / queue
  | 'queue:view'
  | 'queue:create'
  | 'queue:call'
  | 'queue:cancel'
  | 'weighing:edit'
  | 'weighing:override'
  | 'quality:edit'
  | 'purchase:view'
  | 'purchase:complete'
  // debt
  | 'debt:view'
  | 'debt:deduct'
  | 'debt:approve'
  /** ส่งออกรายการตั้งหนี้/ตัดหนี้/จ่ายเงิน ไปยังระบบบัญชี */
  | 'debt:export'
  /** บันทึกการจ่ายเงินให้เกษตรกร */
  | 'payment:pay'
  // expenses
  | 'expense:view'
  | 'expense:create'
  | 'expense:edit'
  | 'expense:cancel'
  | 'expense:approve'
  // product master
  | 'product:view'
  | 'product:manage'
  // reports & system
  | 'report:view'
  | 'report:export'
  | 'audit:view'
  | 'permission:manage'
  | 'setting:manage'

export interface User {
  id: string
  username: string
  displayName: string
  email: string
  role: Role
  permissions: Permission[]
  branchId: string
  branches: Branch[]
  avatarUrl?: string
  /** Work type the user last selected on the dashboard (server-side default). */
  defaultWorkTypeId?: string
}

export interface Session {
  token: string
  refreshToken: string
  expiresAt: string
  user: User
}

export interface LoginPayload {
  username: string
  password: string
  rememberMe?: boolean
}
