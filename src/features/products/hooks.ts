import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type {
  ProductPayload,
  ProductPricePayload,
  ProductUnitPayload,
  WarehousePayload,
} from '@/services/api/contracts'
import { services } from '@/services'

export const productKeys = {
  all: ['products'] as const,
  list: (params: ListParams) => [...productKeys.all, 'list', params] as const,
  sellable: () => [...productKeys.all, 'sellable'] as const,
  units: () => [...productKeys.all, 'units'] as const,
  prices: (params: ListParams) => [...productKeys.all, 'prices', params] as const,
  warehouses: () => [...productKeys.all, 'warehouses'] as const,
}

export function useProductList(params: ListParams & { kind?: string }) {
  return useQuery({
    queryKey: productKeys.list(params),
    queryFn: () => services.products.list(params),
    placeholderData: (prev) => prev,
  })
}

export function useProductUnits() {
  return useQuery({
    queryKey: productKeys.units(),
    queryFn: () => services.products.units(),
    staleTime: 5 * 60_000,
  })
}

export function useWarehouses() {
  return useQuery({
    queryKey: productKeys.warehouses(),
    queryFn: () => services.products.warehouses(),
    staleTime: 5 * 60_000,
  })
}

export function useProductPrices(params: ListParams & { productId?: string }) {
  return useQuery({
    queryKey: productKeys.prices(params),
    queryFn: () => services.products.prices(params),
    placeholderData: (prev) => prev,
  })
}

/**
 * Every product-master mutation invalidates the whole product tree, because a
 * price change must reach the booking form's catalogue immediately.
 */
function useProductMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: productKeys.all })
      void qc.invalidateQueries({ queryKey: ['bookings'] })
    },
  })
}

export function useSaveProduct() {
  return useProductMutation(({ id, payload }: { id: string | null; payload: ProductPayload }) =>
    id ? services.products.update(id, payload) : services.products.create(payload),
  )
}

export function useSaveUnit() {
  return useProductMutation(({ id, payload }: { id: string | null; payload: ProductUnitPayload }) =>
    services.products.saveUnit(id, payload),
  )
}

export function useSavePrice() {
  return useProductMutation((payload: ProductPricePayload) => services.products.savePrice(payload))
}

export function useSaveWarehouse() {
  return useProductMutation(({ id, payload }: { id: string | null; payload: WarehousePayload }) =>
    services.products.saveWarehouse(id, payload),
  )
}
