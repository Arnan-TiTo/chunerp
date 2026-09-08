import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { WorkAreaProvider } from '@/features/workarea/WorkAreaProvider'
import { BranchProvider } from '@/hooks/useBranchContext'
import { ToastProvider } from '@/components/feedback/Toast'

/**
 * Renders a component inside the same provider stack the app uses, on a memory
 * router so tests can start at any route.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  })

  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <AuthProvider>
            <WorkAreaProvider>
              <BranchProvider>
                <ToastProvider>{ui}</ToastProvider>
              </BranchProvider>
            </WorkAreaProvider>
          </AuthProvider>
        ),
      },
    ],
    { initialEntries: [route] },
  )

  return {
    queryClient,
    router,
    ...render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
      options,
    ),
  }
}
