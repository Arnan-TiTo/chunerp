import { describe, expect, it } from 'vitest'
import { ROLE_PERMISSIONS } from './rbac'
import {
  getAvailableWorkTypes,
  resolveDefaultWorkType,
  workTypeStorageKey,
  WORK_TYPES,
} from './workTypes'

/**
 * The work-area registry is what makes the dashboard "ของใครของมัน", so its
 * filtering and default-resolution rules are covered directly.
 */
describe('getAvailableWorkTypes', () => {
  it('gives an admin every work area', () => {
    const available = getAvailableWorkTypes(ROLE_PERMISSIONS.ADMIN)
    expect(available.map((w) => w.id)).toEqual(WORK_TYPES.map((w) => w.id))
  })

  it('limits receiving staff to the work areas they can actually open', () => {
    const ids = getAvailableWorkTypes(ROLE_PERMISSIONS.RECEIVING_STAFF).map((w) => w.id)
    expect(ids).toContain('RECEIVING')
    // No debt or expense permission, and no report permission.
    expect(ids).not.toContain('FINANCE')
    expect(ids).not.toContain('EXECUTIVE')
    expect(ids).not.toContain('ADMIN')
  })

  it('gates the all-menu ADMIN view on permission:manage', () => {
    for (const role of ['FARM_MANAGER', 'RECEIVING_STAFF', 'ACCOUNTING', 'MANAGER', 'VIEWER'] as const) {
      expect(getAvailableWorkTypes(ROLE_PERMISSIONS[role]).map((w) => w.id)).not.toContain('ADMIN')
    }
    expect(getAvailableWorkTypes(ROLE_PERMISSIONS.ADMIN).map((w) => w.id)).toContain('ADMIN')
  })

  it("exposes every module in the ADMIN view's sidebar", () => {
    const admin = WORK_TYPES.find((w) => w.id === 'ADMIN')!
    const links = admin.nav.flatMap((g) => g.items.map((i) => i.to))
    // Every P0 module is reachable without switching work area.
    expect(links).toEqual(
      expect.arrayContaining([
        '/farmers',
        '/bookings',
        '/receiving/sorting',
        '/receiving/weighing',
        '/debts',
        '/expenses',
        '/reports',
      ]),
    )
  })

  it('honours anyOfPermissions — expense access alone unlocks FINANCE', () => {
    const ids = getAvailableWorkTypes(['dashboard:view', 'expense:view']).map((w) => w.id)
    expect(ids).toEqual(['FINANCE'])
  })

  it('returns nothing without dashboard:view', () => {
    expect(getAvailableWorkTypes(['expense:view', 'debt:view'])).toEqual([])
  })
})

describe('resolveDefaultWorkType', () => {
  const accounting = {
    role: 'ACCOUNTING' as const,
    permissions: ROLE_PERMISSIONS.ACCOUNTING,
    defaultWorkTypeId: undefined,
  }

  it("prefers the user's own saved choice", () => {
    expect(resolveDefaultWorkType(accounting, 'PROMOTION')).toBe('PROMOTION')
  })

  it('falls back to the server default when nothing is saved locally', () => {
    expect(
      resolveDefaultWorkType({ ...accounting, defaultWorkTypeId: 'PROMOTION' }, null),
    ).toBe('PROMOTION')
  })

  it('falls back to the work area matching the role', () => {
    expect(resolveDefaultWorkType(accounting, null)).toBe('FINANCE')
  })

  it('lands an administrator on the all-menu view', () => {
    expect(
      resolveDefaultWorkType(
        { role: 'ADMIN', permissions: ROLE_PERMISSIONS.ADMIN, defaultWorkTypeId: undefined },
        null,
      ),
    ).toBe('ADMIN')
  })

  it('ignores a saved choice the user may no longer open', () => {
    const receiving = {
      role: 'RECEIVING_STAFF' as const,
      permissions: ROLE_PERMISSIONS.RECEIVING_STAFF,
      defaultWorkTypeId: undefined,
    }
    expect(resolveDefaultWorkType(receiving, 'FINANCE')).toBe('RECEIVING')
  })

  it('returns null when the user can open nothing', () => {
    expect(
      resolveDefaultWorkType({ role: 'VIEWER', permissions: [], defaultWorkTypeId: undefined }, null),
    ).toBeNull()
  })
})

describe('workTypeStorageKey', () => {
  it('scopes the saved choice to one user', () => {
    expect(workTypeStorageKey('U-001')).not.toBe(workTypeStorageKey('U-002'))
  })
})

describe('work area definitions', () => {
  it('every work area lands somewhere and has a sidebar', () => {
    for (const wt of WORK_TYPES) {
      expect(wt.moduleTo.startsWith('/')).toBe(true)
      expect(wt.nav.length).toBeGreaterThan(0)
      expect(wt.requiredPermissions).toContain('dashboard:view')
    }
  })
})
