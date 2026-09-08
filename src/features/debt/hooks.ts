import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type { DeductionPayload } from '@/services/api/contracts'
import { services } from '@/services'
import { dashboardKeys } from '@/features/dashboard/hooks'

export const debtKeys = {
  all: ['debts'] as const,
  list: (params: ListParams) => [...debtKeys.all, 'list', params] as const,
  detail: (id: string) => [...debtKeys.all, 'detail', id] as const,
  audit: (id: string) => [...debtKeys.all, 'audit', id] as const,
  sources: (id: string) => [...debtKeys.all, 'sources', id] as const,
  deductions: (id: string) => [...debtKeys.all, 'deductions', id] as const,
}

export function useDebtList(params: ListParams) {
  return useQuery({
    queryKey: debtKeys.list(params),
    queryFn: () => services.debts.list(params),
    placeholderData: (prev) => prev,
  })
}

export function useDebt(id: string | undefined) {
  return useQuery({
    queryKey: debtKeys.detail(id ?? ''),
    queryFn: () => services.debts.get(id!),
    enabled: Boolean(id),
  })
}

/**
 * Completed purchases whose รวมรายได้ can still pay this debt down. The server
 * restricts them to the debt's own รอบ — the page never has to work that out.
 */
export function useDeductionSources(id: string | undefined) {
  return useQuery({
    queryKey: debtKeys.sources(id ?? ''),
    queryFn: () => services.debts.deductionSources(id!),
    enabled: Boolean(id),
  })
}

export function useDebtDeductions(id: string | undefined) {
  return useQuery({
    queryKey: debtKeys.deductions(id ?? ''),
    queryFn: () => services.debts.deductions(id!),
    enabled: Boolean(id),
  })
}

export function useDebtAudit(id: string | undefined) {
  return useQuery({
    queryKey: debtKeys.audit(id ?? ''),
    queryFn: () => services.debts.auditTrail(id!),
    enabled: Boolean(id),
  })
}

/**
 * DEBT-003 — preview is a *server* call. The UI blocks obviously invalid input
 * for UX, but the authoritative ceiling and the resulting balances always come
 * back from the backend (§7.9).
 */
export function useDeductionPreview(id: string) {
  return useMutation({
    mutationFn: (payload: DeductionPayload) => services.debts.previewDeduction(id, payload),
  })
}

/** DEBT-004 — the idempotency key makes a retried confirm safe. */
export function useConfirmDeduction(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ payload, idempotencyKey }: { payload: DeductionPayload; idempotencyKey: string }) =>
      services.debts.confirmDeduction(id, payload, idempotencyKey),
    onSuccess: (debt) => {
      qc.setQueryData(debtKeys.detail(id), debt)
      void qc.invalidateQueries({ queryKey: debtKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
      void qc.invalidateQueries({ queryKey: ['farmers'] })
      void qc.invalidateQueries({ queryKey: ['receiving'] })
    },
  })
}
