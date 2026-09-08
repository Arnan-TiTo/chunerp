import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type { PaymentPayload } from '@/services/api/contracts'
import { services } from '@/services'
import { dashboardKeys } from '@/features/dashboard/hooks'
import { debtKeys } from '@/features/debt/hooks'

export const paymentKeys = {
  all: ['payments'] as const,
  list: (params: ListParams) => [...paymentKeys.all, 'list', params] as const,
  detail: (id: string) => [...paymentKeys.all, 'detail', id] as const,
  forPurchase: (purchaseId: string) => [...paymentKeys.all, 'purchase', purchaseId] as const,
}

export function usePaymentList(params: ListParams) {
  return useQuery({
    queryKey: paymentKeys.list(params),
    queryFn: () => services.payments.list(params),
    placeholderData: (prev) => prev,
  })
}

/**
 * The pay-out belonging to one invoice.
 *
 * Returns null while the purchase is still open — there is nothing to pay
 * until the counter closes the document.
 */
export function usePaymentForPurchase(purchaseId: string | undefined) {
  return useQuery({
    queryKey: paymentKeys.forPurchase(purchaseId ?? ''),
    queryFn: () => services.payments.forPurchase(purchaseId!),
    enabled: Boolean(purchaseId),
  })
}

/** PAY-002 — the idempotency key is what stops a double-click paying twice. */
export function usePayFarmer(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      payload,
      idempotencyKey,
    }: {
      payload: PaymentPayload
      idempotencyKey: string
    }) => services.payments.pay(id, payload, idempotencyKey),
    onSuccess: (payment) => {
      qc.setQueryData(paymentKeys.detail(id), payment)
      void qc.invalidateQueries({ queryKey: paymentKeys.all })
      void qc.invalidateQueries({ queryKey: debtKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}
