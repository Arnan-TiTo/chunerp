import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListParams } from '@/types/common'
import type { BookingPayload, DeliveryPayload } from '@/services/api/contracts'
import { services } from '@/services'
import { dashboardKeys } from '@/features/dashboard/hooks'

export const bookingKeys = {
  all: ['bookings'] as const,
  list: (params: ListParams) => [...bookingKeys.all, 'list', params] as const,
  detail: (id: string) => [...bookingKeys.all, 'detail', id] as const,
  batches: (breedId: string) => [...bookingKeys.all, 'batches', breedId] as const,
  sellableProducts: () => ['products', 'sellable'] as const,
}

export function useBookingList(params: ListParams) {
  return useQuery({
    queryKey: bookingKeys.list(params),
    queryFn: () => services.bookings.list(params),
    placeholderData: (prev) => prev,
  })
}

export function useBooking(id: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.detail(id ?? ''),
    queryFn: () => services.bookings.get(id!),
    enabled: Boolean(id),
  })
}

/** Dependent options — refetched whenever the parent breed changes (§7.4). */
export function useBatchOptions(breedId: string) {
  return useQuery({
    queryKey: bookingKeys.batches(breedId),
    queryFn: () => services.bookings.batchOptions(breedId),
    enabled: Boolean(breedId),
    staleTime: 5 * 60_000,
  })
}

/** Catalogue for the document body — only priced, active products. */
export function useSellableProducts() {
  return useQuery({
    queryKey: bookingKeys.sellableProducts(),
    queryFn: () => services.products.sellable(),
    staleTime: 5 * 60_000,
  })
}

export function useSaveBooking(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: BookingPayload) =>
      id ? services.bookings.update(id, payload) : services.bookings.create(payload),
    onSuccess: (booking) => {
      void qc.invalidateQueries({ queryKey: bookingKeys.all })
      qc.setQueryData(bookingKeys.detail(booking.id), booking)
    },
  })
}

/**
 * BOOK-005 — recording the hand-over also raises the debt, so the debt and
 * farmer caches have to be dropped alongside the booking's.
 */
export function useRecordDelivery(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (payload: DeliveryPayload) => services.bookings.recordDelivery(id, payload),
    onSuccess: (booking) => {
      qc.setQueryData(bookingKeys.detail(id), booking)
      void qc.invalidateQueries({ queryKey: bookingKeys.all })
      void qc.invalidateQueries({ queryKey: ['debts'] })
      void qc.invalidateQueries({ queryKey: ['farmers'] })
      void qc.invalidateQueries({ queryKey: dashboardKeys.all })
    },
  })
}

/**
 * ทุกรอบของเกษตรกร พร้อมเหตุผลว่ารอบไหนออกใบคิวไม่ได้เพราะอะไร.
 */
export function useFarmerRounds(farmerId: string | undefined, includeBookingId?: string) {
  return useQuery({
    queryKey: [...bookingKeys.all, 'rounds', farmerId ?? '', includeBookingId ?? ''] as const,
    queryFn: () => services.bookings.rounds(farmerId!, includeBookingId),
    enabled: Boolean(farmerId),
  })
}

export function useCancelBooking(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (reason: string) => services.bookings.cancel(id, reason),
    onSuccess: (booking) => {
      void qc.invalidateQueries({ queryKey: bookingKeys.all })
      qc.setQueryData(bookingKeys.detail(id), booking)
    },
  })
}
