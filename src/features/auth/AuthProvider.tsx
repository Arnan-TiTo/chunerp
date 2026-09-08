import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { LoginPayload, Permission, Session, User } from '@/types/auth'
import { services } from '@/services'
import { setAuthToken, setUnauthorizedHandler } from '@/services/api/client'
import { readStorage, removeStorage, writeStorage } from '@/utils/storage'

const SESSION_KEY = 'chulfarm.session'

interface AuthContextValue {
  user: User | null
  session: Session | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  /** Set when a 401 ended the session mid-flight, so the login page can say so. */
  expired: boolean
  login: (payload: LoginPayload) => Promise<User>
  logout: () => Promise<void>
  /** Action guard — see also `useCan` for the convenience hook. */
  can: (permission: Permission) => boolean
  canAny: (permissions: Permission[]) => boolean
  canAll: (permissions: Permission[]) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** Convenience: `const canEdit = useCan('expense:edit')`. */
export function useCan(permission: Permission): boolean {
  return useAuth().can(permission)
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient()
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthContextValue['status']>('loading')
  const [expired, setExpired] = useState(false)

  // Restore a persisted session on boot so a hard refresh keeps the user in.
  useEffect(() => {
    const stored = readStorage<Session | null>(SESSION_KEY, null)
    if (stored && new Date(stored.expiresAt).getTime() > Date.now()) {
      setAuthToken(stored.token)
      setSession(stored)
      setStatus('authenticated')
    } else {
      if (stored) removeStorage(SESSION_KEY)
      setStatus('unauthenticated')
    }
  }, [])

  const endSession = useCallback(
    (wasExpired: boolean) => {
      setAuthToken(null)
      removeStorage(SESSION_KEY)
      setSession(null)
      setExpired(wasExpired)
      setStatus('unauthenticated')
      queryClient.clear()
    },
    [queryClient],
  )

  // §14 — a 401 from anywhere ends the session exactly once.
  useEffect(() => {
    setUnauthorizedHandler(() => endSession(true))
    return () => setUnauthorizedHandler(null)
  }, [endSession])

  const login = useCallback(async (payload: LoginPayload) => {
    const next = await services.auth.login(payload)
    setAuthToken(next.token)
    if (payload.rememberMe !== false) writeStorage(SESSION_KEY, next)
    setSession(next)
    setExpired(false)
    setStatus('authenticated')
    return next.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await services.auth.logout()
    } finally {
      endSession(false)
    }
  }, [endSession])

  const value = useMemo<AuthContextValue>(() => {
    const owned = new Set(session?.user.permissions ?? [])
    return {
      user: session?.user ?? null,
      session,
      status,
      expired,
      login,
      logout,
      can: (permission) => owned.has(permission),
      canAny: (permissions) => permissions.some((p) => owned.has(p)),
      canAll: (permissions) => permissions.every((p) => owned.has(p)),
    }
  }, [session, status, expired, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
