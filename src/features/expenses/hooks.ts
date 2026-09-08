import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type { ExpensePayload } from '@/services/api/contracts'
import { services } from '@/services'
import { dashboardKeys } from '@/features/dashboard/hooks'

export const expenseKeys = {
  all: ['expenses'] as const,
  list: (params: ListParams) => [...expenseKeys.all, 'list', params] as const,
  detail: (id: string) => [...expenseKeys.all, 'detail', id] as const,
  categories: () => [...expenseKeys.all, 'categories'] as const,
  audit: (id: string) => [...expenseKeys.all, 'audit', id] as const,
}

export function useExpenseList(params: ListParams & { categoryId?: string }) {
  return useQuery({
    queryKey: expenseKeys.list(params),
    queryFn: () => services.expenses.list(params),
    placeholderData: (prev) => prev,
  })
}

export function useExpense(id: string | undefined) {
  return useQuery({
    queryKey: expenseKeys.detail(id ?? ''),
    queryFn: () => services.expenses.get(id!),
    enabled: Boolean(id),
  })
}

/** EXP-002 — the category/type tree drives the form, so it is data, not code. */
export function useExpenseCategories() {
  return useQuery({
    queryKey: expenseKeys.categories(),
    queryFn: () => services.expenses.categories(),
    staleTime: 10 * 60_000,
  })
}

export function useExpenseAudit(id: string | undefined) {
  return useQuery({
    queryKey: expenseKeys.audit(id ?? ''),
    queryFn: () => services.expenses.auditTrail(id!),
    enabled: Boolean(id),
  })
}

export function useSaveExpense(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: ExpensePayload) =>
      id ? services.expenses.update(id, payload) : services.expenses.create(payload),
    onSuccess: (expense) => {
      // EXP-005 acceptance: list *and* detail are invalidated after a save.
      void qc.invalidateQueries({ queryKey: expenseKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
      qc.setQueryData(expenseKeys.detail(expense.id), expense)
    },
  })
}

export function useExpenseActions(id: string) {
  const qc = useQueryClient()
  const after = () => {
    void qc.invalidateQueries({ queryKey: expenseKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  }
  return {
    cancel: useMutation({
      mutationFn: (reason: string) => services.expenses.cancel(id, reason),
      onSuccess: (e) => {
        qc.setQueryData(expenseKeys.detail(id), e)
        after()
      },
    }),
    approve: useMutation({
      mutationFn: (remark: string | undefined) => services.expenses.approve(id, remark),
      onSuccess: (e) => {
        qc.setQueryData(expenseKeys.detail(id), e)
        after()
      },
    }),
    reject: useMutation({
      mutationFn: (reason: string) => services.expenses.reject(id, reason),
      onSuccess: (e) => {
        qc.setQueryData(expenseKeys.detail(id), e)
        after()
      },
    }),
    duplicate: useMutation({
      mutationFn: () => services.expenses.duplicate(id),
      onSuccess: after,
    }),
    upload: useMutation({
      mutationFn: ({ file, onProgress }: { file: File; onProgress?: (p: number) => void }) =>
        services.expenses.uploadAttachment(id, file, onProgress),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: expenseKeys.detail(id) })
      },
    }),
    removeAttachment: useMutation({
      mutationFn: (attachmentId: string) => services.expenses.removeAttachment(id, attachmentId),
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: expenseKeys.detail(id) })
      },
    }),
  }
}
