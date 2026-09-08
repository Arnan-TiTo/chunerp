import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ExportKind } from '@/types/domain'
import { services } from '@/services'
import { debtKeys } from '@/features/debt/hooks'
import { paymentKeys } from '@/features/payments/hooks'

export const exportKeys = {
  all: ['accounting-export'] as const,
  pending: (kind: ExportKind) => [...exportKeys.all, 'pending', kind] as const,
  history: () => [...exportKeys.all, 'history'] as const,
}

export function usePendingExport(kind: ExportKind) {
  return useQuery({
    queryKey: exportKeys.pending(kind),
    queryFn: () => services.debts.pendingExport(kind),
  })
}

export function useExportHistory() {
  return useQuery({
    queryKey: exportKeys.history(),
    queryFn: () => services.debts.exportHistory(),
  })
}

/**
 * Cutting a file changes the documents it contains — every row is stamped as
 * sent — so the debt and payment lists have to be refetched, not just this one.
 */
export function useExportToAccounting() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kind, ids }: { kind: ExportKind; ids: string[] }) =>
      services.debts.exportToAccounting(kind, ids),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: exportKeys.all })
      void qc.invalidateQueries({ queryKey: debtKeys.all })
      void qc.invalidateQueries({ queryKey: paymentKeys.all })
    },
  })
}
