import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Permission } from '@/types/auth'
import { PermissionDenied } from '@/components/feedback/States'
import { Spinner } from '@/components/ui/Button'
import { useAuth } from './AuthProvider'

export function FullPageLoader({ label = 'กำลังโหลด...' }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex flex-col items-center gap-3 text-ink-faint">
        <Spinner size={28} className="text-forest" />
        <p className="text-sm">{label}</p>
      </div>
    </div>
  )
}

/** FND-010 — route guard. Unauthenticated users are bounced to /login. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader label="กำลังตรวจสอบสิทธิ์..." />
  if (status === 'unauthenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/**
 * Route-level permission guard. Renders the permission-denied state rather
 * than redirecting, so a deep link stays explainable (§14).
 */
export function RequirePermission({
  permission,
  anyOf,
}: {
  permission?: Permission
  anyOf?: Permission[]
}) {
  const { can, canAny } = useAuth()
  const allowed = permission ? can(permission) : anyOf ? canAny(anyOf) : true
  if (!allowed) return <PermissionDenied />
  return <Outlet />
}

/**
 * Action guard. Wrap any control whose permission the user may lack —
 * remember that hiding it is UX, not security (§13).
 */
export function Can({
  permission,
  anyOf,
  fallback = null,
  children,
}: {
  permission?: Permission
  anyOf?: Permission[]
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const { can, canAny } = useAuth()
  const allowed = permission ? can(permission) : anyOf ? canAny(anyOf) : true
  return <>{allowed ? children : fallback}</>
}
