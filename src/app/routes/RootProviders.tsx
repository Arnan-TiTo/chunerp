import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { FullPageLoader } from '@/features/auth/guards'
import { WorkAreaProvider } from '@/features/workarea/WorkAreaProvider'
import { BranchProvider } from '@/hooks/useBranchContext'

/**
 * Providers every route needs — public and private alike. Session must be
 * available on /login, and the work area must survive a full page reload.
 */
export function RootProviders() {
  return (
    <AuthProvider>
      <WorkAreaProvider>
        <BranchProvider>
          <Suspense fallback={<FullPageLoader />}>
            <Outlet />
          </Suspense>
        </BranchProvider>
      </WorkAreaProvider>
    </AuthProvider>
  )
}
