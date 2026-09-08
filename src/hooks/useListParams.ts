import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ListParams } from '@/types/common'

export interface UseListParamsOptions {
  defaultPageSize?: number
  defaultSortBy?: string
  defaultSortDir?: 'asc' | 'desc'
  /** Extra query keys this screen owns, e.g. `categoryId`. */
  extraKeys?: string[]
}

/**
 * Keeps list filters in the URL so a filtered view is shareable and survives a
 * refresh — the "direct URL works" acceptance criterion (FND-009).
 */
export function useListParams(options: UseListParamsOptions = {}) {
  const {
    defaultPageSize = 20,
    defaultSortBy,
    defaultSortDir = 'desc',
    extraKeys = [],
  } = options
  const [searchParams, setSearchParams] = useSearchParams()

  const params = useMemo<ListParams & Record<string, string | number | undefined>>(() => {
    const extras: Record<string, string | undefined> = {}
    for (const key of extraKeys) {
      const value = searchParams.get(key)
      if (value) extras[key] = value
    }
    return {
      page: Number(searchParams.get('page') ?? 1),
      pageSize: Number(searchParams.get('pageSize') ?? defaultPageSize),
      search: searchParams.get('q') ?? '',
      sortBy: searchParams.get('sortBy') ?? defaultSortBy,
      sortDir: (searchParams.get('sortDir') as 'asc' | 'desc') ?? defaultSortDir,
      branchId: searchParams.get('branchId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
      dateFrom: searchParams.get('dateFrom') ?? undefined,
      dateTo: searchParams.get('dateTo') ?? undefined,
      ...extras,
    }
  }, [searchParams, defaultPageSize, defaultSortBy, defaultSortDir, extraKeys])

  const update = useCallback(
    (patch: Record<string, string | number | undefined | null>, resetPage = true) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === null || value === '') next.delete(key)
            else next.set(key, String(value))
          }
          if (resetPage && !('page' in patch)) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const reset = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true })
  }, [setSearchParams])

  const activeFilterCount = useMemo(() => {
    let count = 0
    for (const key of ['q', 'status', 'branchId', 'dateFrom', 'dateTo', ...extraKeys]) {
      if (searchParams.get(key)) count += 1
    }
    return count
  }, [searchParams, extraKeys])

  const setSort = useCallback(
    (key: string, dir: 'asc' | 'desc') => update({ sortBy: key, sortDir: dir }, false),
    [update],
  )

  return { params, update, reset, setSort, activeFilterCount }
}
