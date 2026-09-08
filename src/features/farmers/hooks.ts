import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type { FarmerPayload } from '@/services/api/contracts'
import { services } from '@/services'

export const farmerKeys = {
  all: ['farmers'] as const,
  list: (params: ListParams) => [...farmerKeys.all, 'list', params] as const,
  detail: (id: string) => [...farmerKeys.all, 'detail', id] as const,
  history: (id: string) => [...farmerKeys.all, 'history', id] as const,
}

export function useFarmerList(params: ListParams) {
  return useQuery({
    queryKey: farmerKeys.list(params),
    queryFn: () => services.farmers.list(params),
    placeholderData: (prev) => prev,
  })
}

export function useFarmer(id: string | undefined) {
  return useQuery({
    queryKey: farmerKeys.detail(id ?? ''),
    queryFn: () => services.farmers.get(id!),
    enabled: Boolean(id),
  })
}

export function useFarmerHistory(id: string | undefined) {
  return useQuery({
    queryKey: farmerKeys.history(id ?? ''),
    queryFn: () => services.farmers.history(id!),
    enabled: Boolean(id),
  })
}

export function useSaveFarmer(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: FarmerPayload) =>
      id ? services.farmers.update(id, payload) : services.farmers.create(payload),
    onSuccess: (farmer) => {
      // Invalidate rather than patch: the server owns derived fields.
      void qc.invalidateQueries({ queryKey: farmerKeys.all })
      qc.setQueryData(farmerKeys.detail(farmer.id), farmer)
    },
  })
}
