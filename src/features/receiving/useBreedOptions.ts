import { useMemo } from 'react'
import type { Option } from '@/types/common'
import { useSellableProducts } from '@/features/bookings/hooks'

/**
 * สายพันธุ์ options for the receiving slip.
 *
 * Breeds are EGG products in the product master, so the slip and the booking
 * refer to the same catalogue rather than to a hard-coded constant.
 */
export function useBreedOptions(): { options: Option[]; loading: boolean } {
  const { data, isPending } = useSellableProducts()
  const options = useMemo(
    () =>
      (data ?? [])
        .filter((p) => p.kind === 'EGG' && p.breedId)
        .map((p) => ({ value: p.breedId!, label: p.name, description: p.code })),
    [data],
  )
  return { options, loading: isPending }
}
