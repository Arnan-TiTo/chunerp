/** Shared primitives used across every feature contract. */

export type ID = string

export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface ListParams {
  page?: number
  pageSize?: number
  search?: string
  sortBy?: string
  sortDir?: 'asc' | 'desc'
  branchId?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

export interface Option<V = string> {
  value: V
  label: string
  description?: string
  disabled?: boolean
}

export interface Branch {
  id: string
  code: string
  name: string
}

export interface Attachment {
  id: string
  fileName: string
  mimeType: string
  size: number
  url: string
  uploadedAt: string
  uploadedBy: string
}

export interface AuditEntry {
  id: string
  at: string
  actorId: string
  actorName: string
  action: string
  entity: string
  entityId: string
  reference?: string
  before?: Record<string, unknown>
  after?: Record<string, unknown>
}

export interface Money {
  amount: number
  currency: 'THB'
}

/**
 * Every API failure is normalised to this shape by the adapter layer so that
 * pages never have to branch on transport-specific error objects.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: Record<string, string[]>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}
