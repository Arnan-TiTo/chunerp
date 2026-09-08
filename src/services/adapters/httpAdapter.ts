import { ApiError, type Attachment, type Option, type Paginated } from '@/types/common'
import type { Session, User } from '@/types/auth'
import type { DashboardSnapshot } from '@/types/dashboard'
import type { Product, ProductPrice, ProductUnit, Warehouse } from '@/types/product'
import type { BankMaster, BranchMaster, ExpenseCategoryMaster, ProjectMaster } from '@/types/master'
import type { FloorWeightSession, IntegrationStatus } from '@/types/integration'
import type { ExportBatch, ExportResult, FarmerPayment } from '@/types/domain'
import type {
  Booking,
  DebtDeduction,
  DebtRecord,
  DeductionPreview,
  DeductionSource,
  Expense,
  ExpenseCategory,
  Farmer,
  FreshWeighSlip,
  PurchaseSummary,
  QueueTicket,
  ReceivingQuality,
  ShellWeighSlip,
} from '@/types/domain'
import type {
  FarmerHistoryItem,
  FarmerRound,
  PendingExportRow,
  ReportResult,
  Services,
  SystemSetting,
  SystemUser,
} from '@/services/api/contracts'
import { http } from '@/services/api/client'

/**
 * API-001 — real HTTP adapter.
 *
 * Endpoint paths follow the resource layout in §4 / §11. Field names are the
 * frontend contract; if the backend DTO differs, the mapping belongs *here*
 * and nowhere else, so pages never change when the DTO does.
 */
export const httpServices: Services = {
  auth: {
    login: (payload) => http.post<Session>('/auth/login', payload),
    logout: () => http.post<void>('/auth/logout'),
    me: () => http.get<User>('/auth/me'),
  },

  dashboard: {
    getSnapshot: ({ workTypeId, branchId, dateFrom, dateTo }) =>
      http.get<DashboardSnapshot>('/dashboard', {
        query: { workType: workTypeId, branchId, dateFrom, dateTo },
      }),
    setDefaultWorkType: (workTypeId) =>
      http.put<void>('/users/me/preferences/work-type', { workTypeId }),
  },

  farmers: {
    list: (params) => http.get<Paginated<Farmer>>('/farmers', { query: { ...params } }),
    get: (id) => http.get<Farmer>(`/farmers/${id}`),
    create: (payload) => http.post<Farmer>('/farmers', payload),
    update: (id, payload) => http.put<Farmer>(`/farmers/${id}`, payload),
    search: (query) => http.get<Option[]>('/farmers/search', { query: { q: query } }),
    history: (id) => http.get<FarmerHistoryItem[]>(`/farmers/${id}/history`),
  },

  bookings: {
    list: (params) => http.get<Paginated<Booking>>('/bookings', { query: { ...params } }),
    get: (id) => http.get<Booking>(`/bookings/${id}`),
    create: (payload) => http.post<Booking>('/bookings', payload),
    update: (id, payload) => http.put<Booking>(`/bookings/${id}`, payload),
    cancel: (id, reason) => http.post<Booking>(`/bookings/${id}/cancel`, { reason }),
    recordDelivery: (id, payload) => http.post<Booking>(`/bookings/${id}/deliver`, payload),
    rounds: (farmerId, includeBookingId) =>
      http.get<FarmerRound[]>('/bookings/rounds', { query: { farmerId, includeBookingId } }),
    batchOptions: (breedId) =>
      http.get<Option[]>('/bookings/batches', { query: { breedId } }),
  },

  products: {
    list: (params) => http.get<Paginated<Product>>('/products', { query: { ...params } }),
    get: (id) => http.get<Product>(`/products/${id}`),
    sellable: (query) => http.get<Product[]>('/products/sellable', { query: { q: query } }),
    create: (payload) => http.post<Product>('/products', payload),
    update: (id, payload) => http.put<Product>(`/products/${id}`, payload),

    units: () => http.get<ProductUnit[]>('/products/units'),
    saveUnit: (id, payload) =>
      id
        ? http.put<ProductUnit>(`/products/units/${id}`, payload)
        : http.post<ProductUnit>('/products/units', payload),

    prices: (params) =>
      http.get<Paginated<ProductPrice>>('/products/prices', { query: { ...params } }),
    savePrice: (payload) => http.post<ProductPrice>('/products/prices', payload),

    warehouses: () => http.get<Warehouse[]>('/warehouses'),
    saveWarehouse: (id, payload) =>
      id
        ? http.put<Warehouse>(`/warehouses/${id}`, payload)
        : http.post<Warehouse>('/warehouses', payload),
  },

  receiving: {
    getQueue: (params) => http.get<Paginated<QueueTicket>>('/receiving/queue', { query: { ...params } }),
    getTicket: (queueId) => http.get<QueueTicket>(`/receiving/queue/${queueId}`),
    createQueue: (payload) => http.post<QueueTicket>('/receiving/queue', payload),
    updateQueue: (queueId, payload) =>
      http.put<QueueTicket>(`/receiving/queue/${queueId}`, payload),
    issueSlip: (queueId) => http.post<QueueTicket>(`/receiving/queue/${queueId}/issue`),
    callQueue: (queueId) => http.post<QueueTicket>(`/receiving/queue/${queueId}/call`),
    recallQueue: (queueId) => http.post<QueueTicket>(`/receiving/queue/${queueId}/recall`),
    startWeighing: (queueId) => http.post<QueueTicket>(`/receiving/queue/${queueId}/start-weighing`),
    cancelQueue: (queueId, reason) =>
      http.post<QueueTicket>(`/receiving/queue/${queueId}/cancel`, { reason }),

    getFreshWeighSlip: (queueId) => http.get<FreshWeighSlip>(`/receiving/${queueId}/weighing/fresh`),
    addWeighBag: (queueId, payload) =>
      http.post<FreshWeighSlip>(`/receiving/${queueId}/weighing/fresh/bags`, payload),
    removeWeighBag: (queueId, lineId) =>
      http.delete<FreshWeighSlip>(`/receiving/${queueId}/weighing/fresh/bags/${lineId}`),
    lockFreshWeighSlip: (queueId) =>
      http.post<FreshWeighSlip>(`/receiving/${queueId}/weighing/fresh/lock`),
    unlockFreshWeighSlip: (queueId, reason) =>
      http.post<FreshWeighSlip>(`/receiving/${queueId}/weighing/fresh/unlock`, { reason }),

    getShellWeighSlip: (queueId) => http.get<ShellWeighSlip>(`/receiving/${queueId}/weighing/shell`),
    saveShellWeighSlip: (queueId, payload) =>
      http.put<ShellWeighSlip>(`/receiving/${queueId}/weighing/shell`, payload),
    lockShellWeighSlip: (queueId) =>
      http.post<ShellWeighSlip>(`/receiving/${queueId}/weighing/shell/lock`),
    unlockShellWeighSlip: (queueId, reason) =>
      http.post<ShellWeighSlip>(`/receiving/${queueId}/weighing/shell/unlock`, { reason }),

    getQuality: (queueId) => http.get<ReceivingQuality>(`/receiving/${queueId}/quality`),
    saveQuality: (queueId, payload) =>
      http.put<ReceivingQuality>(`/receiving/${queueId}/quality`, payload),
    confirmQuality: (queueId) =>
      http.post<ReceivingQuality>(`/receiving/${queueId}/quality/confirm`),

    getPurchaseSummary: (queueId) => http.get<PurchaseSummary>(`/receiving/${queueId}/summary`),
    completePurchase: (queueId) => http.post<PurchaseSummary>(`/receiving/${queueId}/complete`),
  },

  /**
   * The scale system sits behind our own backend rather than being called from
   * the browser: it is on the plant network and speaks MSSQL, not HTTP.
   */
  integration: {
    floorWeightStatus: () =>
      http.get<IntegrationStatus>('/integration/floor-weight/status'),
    floorWeightLatestDate: (farmerCode) =>
      http
        .get<{ weighDate: string | null }>('/integration/floor-weight/latest-date', {
          query: { farmerCode },
        })
        .then((r) => r.weighDate),
    floorWeightSessions: (query) =>
      http.get<FloorWeightSession[]>('/integration/floor-weight/sessions', {
        query: { ...query },
      }),
    importFloorWeight: (queueId, sessionId) =>
      http.post<{ fresh: FreshWeighSlip; shell: ShellWeighSlip }>(
        `/receiving/${queueId}/weighing/import`,
        { sessionId },
      ),
  },

  debts: {
    list: (params) => http.get<Paginated<DebtRecord>>('/debts', { query: { ...params } }),
    get: (id) => http.get<DebtRecord>(`/debts/${id}`),
    deductionSources: (id) => http.get<DeductionSource[]>(`/debts/${id}/deduction/sources`),
    previewDeduction: (id, payload) =>
      http.post<DeductionPreview>(`/debts/${id}/deduction/preview`, payload),
    confirmDeduction: (id, payload, idempotencyKey) =>
      http.post<DebtRecord>(`/debts/${id}/deduction/confirm`, payload, { idempotencyKey }),
    deductions: (id) => http.get<DebtDeduction[]>(`/debts/${id}/deductions`),
    auditTrail: (id) => http.get(`/debts/${id}/audit`),
    pendingExport: (kind) =>
      http.get<PendingExportRow[]>('/debts/export/pending', { query: { kind } }),
    exportToAccounting: (kind, ids) =>
      http.post<ExportResult>('/debts/export', { kind, ids }),
    exportHistory: () => http.get<ExportBatch[]>('/debts/export/history'),
  },

  payments: {
    list: (params) => http.get<Paginated<FarmerPayment>>('/payments', { query: { ...params } }),
    get: (id) => http.get<FarmerPayment>(`/payments/${id}`),
    forPurchase: (purchaseId) =>
      http.get<FarmerPayment | null>(`/purchases/${purchaseId}/payment`),
    pay: (id, payload, idempotencyKey) =>
      http.post<FarmerPayment>(`/payments/${id}/pay`, payload, { idempotencyKey }),
    cancel: (id, reason) => http.post<FarmerPayment>(`/payments/${id}/cancel`, { reason }),
  },

  expenses: {
    list: (params) => http.get<Paginated<Expense>>('/expenses', { query: { ...params } }),
    get: (id) => http.get<Expense>(`/expenses/${id}`),
    create: (payload) => http.post<Expense>('/expenses', payload),
    update: (id, payload) => http.put<Expense>(`/expenses/${id}`, payload),
    cancel: (id, reason) => http.post<Expense>(`/expenses/${id}/cancel`, { reason }),
    approve: (id, remark) => http.post<Expense>(`/expenses/${id}/approve`, { remark }),
    reject: (id, reason) => http.post<Expense>(`/expenses/${id}/reject`, { reason }),
    duplicate: (id) => http.post<Expense>(`/expenses/${id}/duplicate`),
    categories: () => http.get<ExpenseCategory[]>('/expenses/categories'),

    /**
     * XHR rather than fetch — `fetch` still cannot report upload progress, and
     * EXP-005 requires a per-file progress bar.
     */
    uploadAttachment: (id, file, onProgress) =>
      new Promise<Attachment>((resolve, reject) => {
        const form = new FormData()
        form.append('file', file)
        const xhr = new XMLHttpRequest()
        const base = import.meta.env.VITE_API_BASE_URL ?? '/api'
        xhr.open('POST', `${base}/expenses/${id}/attachments`)
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100))
        })
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText) as Attachment)
          } else {
            reject(new ApiError(xhr.status, xhr.statusText || 'อัปโหลดไม่สำเร็จ'))
          }
        })
        xhr.addEventListener('error', () => reject(new TypeError('upload failed')))
        xhr.send(form)
      }),
    removeAttachment: (id, attachmentId) =>
      http.delete<void>(`/expenses/${id}/attachments/${attachmentId}`),
    auditTrail: (id) => http.get(`/expenses/${id}/audit`),
  },

  master: {
    branches: (includeInactive) =>
      http.get<BranchMaster[]>('/master/branches', { query: { includeInactive } }),
    saveBranch: (id, payload) =>
      id
        ? http.put<BranchMaster>('/master/branches/' + id, payload)
        : http.post<BranchMaster>('/master/branches', payload),

    projects: (includeInactive) =>
      http.get<ProjectMaster[]>('/master/projects', { query: { includeInactive } }),
    saveProject: (id, payload) =>
      id
        ? http.put<ProjectMaster>('/master/projects/' + id, payload)
        : http.post<ProjectMaster>('/master/projects', payload),

    banks: (includeInactive) =>
      http.get<BankMaster[]>('/master/banks', { query: { includeInactive } }),
    saveBank: (id, payload) =>
      id
        ? http.put<BankMaster>('/master/banks/' + id, payload)
        : http.post<BankMaster>('/master/banks', payload),

    expenseCategories: (includeInactive) =>
      http.get<ExpenseCategoryMaster[]>('/master/expense-categories', { query: { includeInactive } }),
    saveExpenseCategory: (id, payload) =>
      id
        ? http.put<ExpenseCategoryMaster>('/master/expense-categories/' + id, payload)
        : http.post<ExpenseCategoryMaster>('/master/expense-categories', payload),
  },

  reports: {
    definitions: () => http.get('/reports'),
    run: (reportId, params) =>
      http.get<ReportResult>(`/reports/${reportId}`, { query: { ...params } }),
  },

  system: {
    audit: (params) => http.get('/system/audit', { query: { ...params } }),
    users: () => http.get<SystemUser[]>('/system/users'),
    updateUserPermissions: (userId, permissions) =>
      http.put<SystemUser>(`/system/users/${userId}/permissions`, { permissions }),
    settings: () => http.get<SystemSetting[]>('/system/settings'),
    updateSetting: (key, value) => http.put<SystemSetting>(`/system/settings/${key}`, { value }),
  },
}
