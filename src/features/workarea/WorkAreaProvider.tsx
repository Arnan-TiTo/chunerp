import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { WorkTypeDefinition, WorkTypeId } from '@/types/dashboard'
import {
  ACCENT_VARS,
  getAvailableWorkTypes,
  resolveDefaultWorkType,
  WORK_TYPE_MAP,
  workTypeStorageKey,
} from '@/constants/workTypes'
import { readStorage, writeStorage } from '@/utils/storage'
import { services } from '@/services'
import { useAuth } from '@/features/auth/AuthProvider'

interface WorkAreaContextValue {
  /** null until the user has picked, or when they can open none. */
  workType: WorkTypeDefinition | null
  workTypeId: WorkTypeId | null
  /** Only the work areas this user's permissions unlock. */
  available: WorkTypeDefinition[]
  setWorkType: (id: WorkTypeId) => void
  clearWorkType: () => void
  ready: boolean
}

const WorkAreaContext = createContext<WorkAreaContextValue | null>(null)

export function useWorkArea(): WorkAreaContextValue {
  const ctx = useContext(WorkAreaContext)
  if (!ctx) throw new Error('useWorkArea must be used inside <WorkAreaProvider>')
  return ctx
}

/**
 * ประเภทงาน state.
 *
 * The chosen work area drives three things at once: which sidebar renders,
 * which dashboard snapshot is fetched, and the `--accent` custom properties
 * every component reads. It is stored per user id, so two accounts sharing a
 * tablet never inherit each other's choice ("เป็นของใครของมัน").
 */
export function WorkAreaProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const { user } = useAuth()
  const [workTypeId, setWorkTypeId] = useState<WorkTypeId | null>(null)
  const [ready, setReady] = useState(false)

  const available = useMemo(
    () => (user ? getAvailableWorkTypes(user.permissions) : []),
    [user],
  )

  // Restore this user's own saved work area on login / reload.
  useEffect(() => {
    if (!user) {
      setWorkTypeId(null)
      setReady(false)
      return
    }
    const saved = readStorage<WorkTypeId | null>(workTypeStorageKey(user.id), null)
    // A single available work area needs no picker — go straight in.
    const resolved =
      available.length === 1 ? available[0].id : saved && WORK_TYPE_MAP[saved] ? saved : null
    setWorkTypeId(resolved && available.some((w) => w.id === resolved) ? resolved : null)
    setReady(true)
  }, [user, available])

  const setWorkType = useCallback(
    (id: WorkTypeId) => {
      setWorkTypeId(id)
      if (user) writeStorage(workTypeStorageKey(user.id), id)
      // Best-effort server-side default; a failure must not block navigation.
      void services.dashboard.setDefaultWorkType(id).catch(() => undefined)
    },
    [user],
  )

  const clearWorkType = useCallback(() => setWorkTypeId(null), [])

  const workType = workTypeId ? (WORK_TYPE_MAP[workTypeId] ?? null) : null

  // Re-bind the accent custom properties whenever the work area changes.
  useEffect(() => {
    const root = document.documentElement
    const vars = ACCENT_VARS[workType?.accent ?? 'forest']
    root.style.setProperty('--accent', vars.accent)
    root.style.setProperty('--accent-soft', vars.accentSoft)
    root.style.setProperty('--accent-deep', vars.accentDeep)
  }, [workType])

  const value = useMemo<WorkAreaContextValue>(
    () => ({ workType, workTypeId, available, setWorkType, clearWorkType, ready }),
    [workType, workTypeId, available, setWorkType, clearWorkType, ready],
  )

  return <WorkAreaContext.Provider value={value}>{children}</WorkAreaContext.Provider>
}

/** Convenience for pages that need the current work area's default landing id. */
export function useResolvedDefaultWorkType(): WorkTypeId | null {
  const { user } = useAuth()
  if (!user) return null
  const saved = readStorage<WorkTypeId | null>(workTypeStorageKey(user.id), null)
  return resolveDefaultWorkType(user, saved)
}
