import { useQuery } from '@tanstack/react-query'
import type { DashboardParams, DashboardSnapshot, WorkTypeId } from '@/types/dashboard'
import { services } from '@/services'

export const dashboardKeys = {
  all: ['dashboard'] as const,
  snapshot: (params: DashboardParams) => [...dashboardKeys.all, 'snapshot', params] as const,
}

/**
 * DASH-002 — one query per (work type × branch × date range).
 *
 * Switching work type changes the key, so React Query keeps each work area's
 * data cached separately and the user can flip between them without a refetch
 * storm. `placeholderData` holds the previous snapshot while the next loads so
 * the layout never collapses (§7.2).
 */
export function useDashboardSnapshot(params: DashboardParams | null) {
  return useQuery<DashboardSnapshot>({
    queryKey: dashboardKeys.snapshot(params as DashboardParams),
    queryFn: () => services.dashboard.getSnapshot(params as DashboardParams),
    enabled: params != null,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })
}

export function buildDashboardParams(
  workTypeId: WorkTypeId | null,
  branchId: string,
  range: { from: string; to: string },
): DashboardParams | null {
  if (!workTypeId) return null
  return { workTypeId, branchId, dateFrom: range.from, dateTo: range.to }
}
