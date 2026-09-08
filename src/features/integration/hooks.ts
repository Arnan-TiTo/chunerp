import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FloorWeightQuery } from '@/types/integration'
import { services } from '@/services'
import { receivingKeys } from '@/features/receiving/hooks'
import { dashboardKeys } from '@/features/dashboard/hooks'

export const integrationKeys = {
  all: ['integration'] as const,
  floorWeightStatus: () => [...integrationKeys.all, 'floor-weight', 'status'] as const,
  floorWeightSessions: (query: FloorWeightQuery) =>
    [...integrationKeys.all, 'floor-weight', 'sessions', query] as const,
  floorWeightLatestDate: (farmerCode: string) =>
    [...integrationKeys.all, 'floor-weight', 'latest-date', farmerCode] as const,
}

/** INT-001 — is the link to the scale system up. */
export function useFloorWeightStatus() {
  return useQuery({
    queryKey: integrationKeys.floorWeightStatus(),
    queryFn: () => services.integration.floorWeightStatus(),
    staleTime: 60_000,
  })
}

/** วันที่ชั่งล่าสุดของเกษตรกร — used to prefill the pull filter. */
export function useFloorWeightLatestDate(farmerCode: string | undefined) {
  return useQuery({
    queryKey: integrationKeys.floorWeightLatestDate(farmerCode ?? ''),
    queryFn: () => services.integration.floorWeightLatestDate(farmerCode!),
    enabled: Boolean(farmerCode),
  })
}

/**
 * The pull itself. Disabled until a farmer code is known, because that plus the
 * weigh date is the whole filter the external system accepts.
 */
export function useFloorWeightSessions(query: FloorWeightQuery, enabled = true) {
  return useQuery({
    queryKey: integrationKeys.floorWeightSessions(query),
    queryFn: () => services.integration.floorWeightSessions(query),
    enabled: enabled && Boolean(query.farmerCode),
  })
}

export function useImportFloorWeight(queueId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sessionId: number) => services.integration.importFloorWeight(queueId, sessionId),
    onSuccess: ({ fresh, shell }) => {
      qc.setQueryData(receivingKeys.freshWeigh(queueId), fresh)
      qc.setQueryData(receivingKeys.shellWeigh(queueId), shell)
      void qc.invalidateQueries({ queryKey: integrationKeys.all })
      void qc.invalidateQueries({ queryKey: receivingKeys.all })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}
