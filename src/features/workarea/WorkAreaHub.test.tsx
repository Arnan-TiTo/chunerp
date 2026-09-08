import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from '@/test/renderWithProviders'
import { mockServices } from '@/services/mocks/mockAdapter'
import { DEMO_PASSWORD } from '@/services/mocks/db'
import { workTypeStorageKey } from '@/constants/workTypes'
import { WorkAreaHub } from './WorkAreaHub'

/**
 * The work-area picker is what makes the dashboard "ของใครของมัน", so these
 * cover the two rules that matter: only permitted areas are offered, and the
 * choice is remembered per user.
 */
async function signIn(username: string) {
  const session = await mockServices.auth.login({ username, password: DEMO_PASSWORD })
  window.localStorage.setItem('chulfarm.session', JSON.stringify(session))
  return session
}

describe('WorkAreaHub', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('offers an admin every work area', async () => {
    await signIn('admin')
    renderWithProviders(<WorkAreaHub />, { route: '/hub' })

    expect(await screen.findByText('เลือกพื้นที่การทำงาน')).toBeInTheDocument()
    expect(screen.getByText('Farm Promotion')).toBeInTheDocument()
    expect(screen.getByText('Cocoon Receiving')).toBeInTheDocument()
    expect(screen.getByText('Finance & Accounting')).toBeInTheDocument()
    expect(screen.getByText('Executive Overview')).toBeInTheDocument()
  })

  it('hides work areas the account has no permission for', async () => {
    await signIn('receiving')
    renderWithProviders(<WorkAreaHub />, { route: '/hub' })

    expect(await screen.findByText('Cocoon Receiving')).toBeInTheDocument()
    expect(screen.queryByText('Finance & Accounting')).not.toBeInTheDocument()
    expect(screen.queryByText('Executive Overview')).not.toBeInTheDocument()
  })

  it('shows accounting only the finance and promotion-free set it can open', async () => {
    await signIn('account')
    renderWithProviders(<WorkAreaHub />, { route: '/hub' })

    expect(await screen.findByText('Finance & Accounting')).toBeInTheDocument()
    expect(screen.queryByText('Cocoon Receiving')).not.toBeInTheDocument()
  })

  it("remembers the picked work area under that user's own key", async () => {
    const session = await signIn('admin')
    renderWithProviders(<WorkAreaHub />, { route: '/hub' })

    const card = await screen.findByText('Cocoon Receiving')
    await userEvent.click(card)

    await waitFor(() => {
      const saved = window.localStorage.getItem(workTypeStorageKey(session.user.id))
      expect(saved).toBe(JSON.stringify('RECEIVING'))
    })
  })

  it('explains the situation when the account can open nothing', async () => {
    const session = await signIn('admin')
    session.user.permissions = []
    window.localStorage.setItem('chulfarm.session', JSON.stringify(session))

    renderWithProviders(<WorkAreaHub />, { route: '/hub' })
    expect(await screen.findByText('ไม่มีสิทธิ์เข้าถึง')).toBeInTheDocument()
  })
})
