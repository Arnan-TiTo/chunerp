import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type {
  QualityPayload,
  QueuePayload,
  ShellWeighPayload,
  WeighBagPayload,
} from '@/services/api/contracts'
import { services } from '@/services'
import { dashboardKeys } from '@/features/dashboard/hooks'

export const receivingKeys = {
  all: ['receiving'] as const,
  queue: (params: ListParams) => [...receivingKeys.all, 'queue', params] as const,
  ticket: (id: string) => [...receivingKeys.all, 'ticket', id] as const,
  freshWeigh: (id: string) => [...receivingKeys.all, 'weighing', 'fresh', id] as const,
  shellWeigh: (id: string) => [...receivingKeys.all, 'weighing', 'shell', id] as const,
  quality: (id: string) => [...receivingKeys.all, 'quality', id] as const,
  summary: (id: string) => [...receivingKeys.all, 'summary', id] as const,
}

/** QUEUE-001 — auto-refreshes so the board stays live on the counter tablet. */
export function useQueue(params: ListParams, refetchIntervalMs = 30_000) {
  return useQuery({
    queryKey: receivingKeys.queue(params),
    queryFn: () => services.receiving.getQueue(params),
    placeholderData: (prev) => prev,
    refetchInterval: refetchIntervalMs,
    staleTime: 10_000,
  })
}

export function useTicket(queueId: string | undefined) {
  return useQuery({
    queryKey: receivingKeys.ticket(queueId ?? ''),
    queryFn: () => services.receiving.getTicket(queueId!),
    enabled: Boolean(queueId),
  })
}

/** ใบชั่งน้ำหนักรังไหมสด — bag lines plus the backend's subtotals. */
export function useFreshWeighSlip(queueId: string | undefined) {
  return useQuery({
    queryKey: receivingKeys.freshWeigh(queueId ?? ''),
    queryFn: () => services.receiving.getFreshWeighSlip(queueId!),
    enabled: Boolean(queueId),
  })
}

/** ใบชั่งน้ำหนักเปลือกรัง — the shell sample. */
export function useShellWeighSlip(queueId: string | undefined) {
  return useQuery({
    queryKey: receivingKeys.shellWeigh(queueId ?? ''),
    queryFn: () => services.receiving.getShellWeighSlip(queueId!),
    enabled: Boolean(queueId),
  })
}

export function useQuality(queueId: string | undefined) {
  return useQuery({
    queryKey: receivingKeys.quality(queueId ?? ''),
    queryFn: () => services.receiving.getQuality(queueId!),
    enabled: Boolean(queueId),
  })
}

export function usePurchaseSummary(queueId: string | undefined) {
  return useQuery({
    queryKey: receivingKeys.summary(queueId ?? ''),
    queryFn: () => services.receiving.getPurchaseSummary(queueId!),
    enabled: Boolean(queueId),
  })
}

/**
 * QUEUE-002 — pessimistic strategy on purpose. A queue action changes what the
 * counter staff see next; showing an optimistic state that the server then
 * rejects would be worse than a short spinner.
 */
export function useQueueActions() {
  const qc = useQueryClient()
  const invalidate = (queueId: string) => {
    void qc.invalidateQueries({ queryKey: receivingKeys.all })
    void qc.invalidateQueries({ queryKey: receivingKeys.ticket(queueId) })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  }

  return {
    call: useMutation({
      mutationFn: (queueId: string) => services.receiving.callQueue(queueId),
      onSuccess: (t) => invalidate(t.id),
    }),
    recall: useMutation({
      mutationFn: (queueId: string) => services.receiving.recallQueue(queueId),
      onSuccess: (t) => invalidate(t.id),
    }),
    start: useMutation({
      mutationFn: (queueId: string) => services.receiving.startWeighing(queueId),
      onSuccess: (t) => invalidate(t.id),
    }),
    cancel: useMutation({
      mutationFn: ({ queueId, reason }: { queueId: string; reason: string }) =>
        services.receiving.cancelQueue(queueId, reason),
      onSuccess: (t) => invalidate(t.id),
    }),
    create: useMutation({
      mutationFn: (payload: QueuePayload) => services.receiving.createQueue(payload),
      onSuccess: (t) => invalidate(t.id),
    }),
    update: useMutation({
      mutationFn: ({ queueId, payload }: { queueId: string; payload: QueuePayload }) =>
        services.receiving.updateQueue(queueId, payload),
      onSuccess: (t) => invalidate(t.id),
    }),
    /** ออกใบคิว — assigns the queue number and hands over to the weigh station. */
    issue: useMutation({
      mutationFn: (queueId: string) => services.receiving.issueSlip(queueId),
      onSuccess: (t) => invalidate(t.id),
    }),
  }
}

/**
 * Bags are weighed one at a time, so every action returns the whole slip with
 * its subtotals recomputed server-side — the page never adds anything up.
 */
export function useFreshWeighActions(queueId: string) {
  const qc = useQueryClient()
  const after = () => {
    void qc.invalidateQueries({ queryKey: receivingKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  }
  const store = (slip: Parameters<typeof qc.setQueryData>[1]) => {
    qc.setQueryData(receivingKeys.freshWeigh(queueId), slip)
    after()
  }
  return {
    addBag: useMutation({
      mutationFn: (payload: WeighBagPayload) => services.receiving.addWeighBag(queueId, payload),
      onSuccess: store,
    }),
    removeBag: useMutation({
      mutationFn: (lineId: string) => services.receiving.removeWeighBag(queueId, lineId),
      onSuccess: store,
    }),
    lock: useMutation({
      mutationFn: () => services.receiving.lockFreshWeighSlip(queueId),
      onSuccess: store,
    }),
    unlock: useMutation({
      mutationFn: (reason: string) => services.receiving.unlockFreshWeighSlip(queueId, reason),
      onSuccess: store,
    }),
  }
}

export function useShellWeighActions(queueId: string) {
  const qc = useQueryClient()
  const store = (slip: Parameters<typeof qc.setQueryData>[1]) => {
    qc.setQueryData(receivingKeys.shellWeigh(queueId), slip)
    void qc.invalidateQueries({ queryKey: receivingKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  }
  return {
    save: useMutation({
      mutationFn: (payload: ShellWeighPayload) =>
        services.receiving.saveShellWeighSlip(queueId, payload),
      onSuccess: store,
    }),
    lock: useMutation({
      mutationFn: () => services.receiving.lockShellWeighSlip(queueId),
      onSuccess: store,
    }),
    unlock: useMutation({
      mutationFn: (reason: string) => services.receiving.unlockShellWeighSlip(queueId, reason),
      onSuccess: store,
    }),
  }
}

export function useQualityActions(queueId: string) {
  const qc = useQueryClient()
  const after = () => {
    void qc.invalidateQueries({ queryKey: receivingKeys.all })
    void qc.invalidateQueries({ queryKey: dashboardKeys.all })
  }
  return {
    save: useMutation({
      mutationFn: (payload: QualityPayload) => services.receiving.saveQuality(queueId, payload),
      onSuccess: (q) => {
        qc.setQueryData(receivingKeys.quality(queueId), q)
        after()
      },
    }),
    confirm: useMutation({
      mutationFn: () => services.receiving.confirmQuality(queueId),
      onSuccess: after,
    }),
  }
}

export function useCompletePurchase(queueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => services.receiving.completePurchase(queueId),
    onSuccess: (summary) => {
      qc.setQueryData(receivingKeys.summary(queueId), summary)
      void qc.invalidateQueries({ queryKey: receivingKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
      void qc.invalidateQueries({ queryKey: ['debts'] })
    },
  })
}
