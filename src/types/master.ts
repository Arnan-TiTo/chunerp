import type { ID } from './common'

/**
 * General master data.
 *
 * Every dropdown in the app resolves its options from one of these tables (or
 * from the product master) rather than a hard-coded constant, so the values a
 * user can pick are always editable in one place with an audit trail.
 *
 * Enumerations that describe *workflow state* — booking status, queue status,
 * payment method — are deliberately not master data: changing them would change
 * the code paths that depend on them.
 */

export interface BranchMaster {
  id: ID
  code: string
  name: string
  /** จุดรับซื้อ can differ from the office address. */
  address?: string
  phone?: string
  active: boolean
  updatedAt: string
}

export interface ProjectMaster {
  id: ID
  code: string
  name: string
  description?: string
  active: boolean
  updatedAt: string
}

export interface BankMaster {
  id: ID
  code: string
  name: string
  active: boolean
  updatedAt: string
}

export interface ExpenseTypeMaster {
  id: ID
  categoryId: string
  name: string
  active: boolean
}

export interface ExpenseCategoryMaster {
  id: ID
  code: string
  name: string
  types: ExpenseTypeMaster[]
  active: boolean
  updatedAt: string
}

/** Every general master shares this shape, so one editor screen serves them all. */
export type MasterKind = 'branch' | 'project' | 'bank' | 'expenseCategory'

export const MASTER_LABELS: Record<MasterKind, string> = {
  branch: 'สาขา / จุดรับซื้อ',
  project: 'โครงการ',
  bank: 'ธนาคาร',
  expenseCategory: 'ประเภทค่าใช้จ่าย',
}
