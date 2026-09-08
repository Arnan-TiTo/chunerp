import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { addDaysInput, todayInput } from '@/utils/format'
import { readStorage, writeStorage } from '@/utils/storage'
import { useAuth } from '@/features/auth/AuthProvider'

export interface DateRange {
  from: string
  to: string
}

interface BranchContextValue {
  branchId: string
  setBranchId: (id: string) => void
  range: DateRange
  setRange: (range: DateRange) => void
  resetRange: () => void
}

const BranchContext = createContext<BranchContextValue | null>(null)

export function useBranchContext(): BranchContextValue {
  const ctx = useContext(BranchContext)
  if (!ctx) throw new Error('useBranchContext must be used inside <BranchProvider>')
  return ctx
}

const defaultRange = (): DateRange => ({
  from: addDaysInput(todayInput(), -29),
  to: todayInput(),
})

/**
 * Branch + date context shared by the dashboard and every list screen (§7.2).
 * Stored per user so two accounts on one shared tablet do not inherit each
 * other's scope.
 */
export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const storageKey = user ? `chulfarm.branch.${user.id}` : null

  const [branchId, setBranchIdState] = useState<string>('ALL')
  const [range, setRangeState] = useState<DateRange>(defaultRange)

  useEffect(() => {
    if (!user) return
    const saved = storageKey ? readStorage<string | null>(storageKey, null) : null
    const allowed = user.branches.map((b) => b.id)
    if (saved && (saved === 'ALL' || allowed.includes(saved))) {
      setBranchIdState(saved)
    } else {
      setBranchIdState(user.branches.length > 1 ? 'ALL' : user.branchId)
    }
  }, [user, storageKey])

  const setBranchId = useCallback(
    (id: string) => {
      setBranchIdState(id)
      if (storageKey) writeStorage(storageKey, id)
    },
    [storageKey],
  )

  const value = useMemo<BranchContextValue>(
    () => ({
      branchId,
      setBranchId,
      range,
      setRange: setRangeState,
      resetRange: () => setRangeState(defaultRange()),
    }),
    [branchId, setBranchId, range],
  )

  return <BranchContext.Provider value={value}>{children}</BranchContext.Provider>
}
