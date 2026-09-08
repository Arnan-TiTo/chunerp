import { beforeAll, describe, expect, it } from 'vitest'
import { mockServices } from '@/services/mocks/mockAdapter'
import { DEMO_PASSWORD } from '@/services/mocks/db'
import * as repo from './repositories'
import * as store from './chunErpStore'

/**
 * Everything a user changes has to survive a reload.
 *
 * These tests go behind the service and read the row back out of SQLite,
 * because that is the thing that was broken: the permission grid wrote to an
 * in-memory array, so the grant looked applied and was gone on the next boot.
 * Asserting through the service alone would have passed then too.
 */
beforeAll(async () => {
  await mockServices.auth.login({ username: 'admin', password: DEMO_PASSWORD })
})

describe('persistence (SQLite)', () => {
  it('stores a permission grant, not just the in-memory user', async () => {
    const users = await mockServices.system.users()
    const target = users.find((u) => u.role === 'VIEWER')!
    const granted = [...target.permissions, 'report:export' as const]

    await mockServices.system.updateUserPermissions(target.id, granted)

    const stored = repo.loadUsers().find((u) => u.id === target.id)!
    expect(stored.permissions).toContain('report:export')
    expect(stored.permissions).toHaveLength(granted.length)
  })

  it('removes a permission as well as adding one', async () => {
    const users = await mockServices.system.users()
    const target = users.find((u) => u.role === 'VIEWER')!
    const reduced = target.permissions.filter((p) => p !== 'report:view')

    await mockServices.system.updateUserPermissions(target.id, reduced)

    const stored = repo.loadUsers().find((u) => u.id === target.id)!
    expect(stored.permissions).not.toContain('report:view')
  })

  it('stores a changed setting', async () => {
    await mockServices.system.updateSetting('queue.waitWarningMinutes', 45)
    const stored = repo.loadSettings().find((s) => s.key === 'queue.waitWarningMinutes')
    expect(stored?.value).toBe(45)
  })

  it('stores a master row and its disabled state', async () => {
    const code = `PJT-${Date.now()}`
    const created = await mockServices.master.saveProject(null, {
      code,
      name: 'โครงการทดสอบการบันทึก',
      active: true,
    })
    expect(repo.loadProjects().find((p) => p.id === created.id)?.name).toBe(
      'โครงการทดสอบการบันทึก',
    )

    await mockServices.master.saveProject(created.id, { code, name: 'ปิดใช้งาน', active: false })
    const disabled = repo.loadProjects().find((p) => p.id === created.id)
    expect(disabled?.active).toBe(false)
    expect(disabled?.name).toBe('ปิดใช้งาน')
  })

  it('stores a new price and keeps the superseded row', async () => {
    const sellable = await mockServices.products.sellable()
    const product = sellable[0]

    await mockServices.products.savePrice({
      productId: product.id,
      price: (product.currentPrice ?? 0) + 25,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      note: 'ทดสอบการบันทึกราคา',
    })

    const rows = repo
      .loadProductPrices(sellable, new Date().toISOString().slice(0, 10))
      .filter((p) => p.productId === product.id)

    // The history is what lets an old document explain the price it used.
    expect(rows.length).toBeGreaterThan(1)
    expect(rows.some((p) => p.note === 'ทดสอบการบันทึกราคา')).toBe(true)
  })

  it('stores an expense and the approval that released it', async () => {
    const page = await mockServices.expenses.list({ status: 'SUBMITTED', pageSize: 1 })
    const expense = page.items[0]
    if (!expense) return

    await mockServices.expenses.approve(expense.id, 'ทดสอบ')

    const categories = await mockServices.master.expenseCategories(true)
    const stored = repo.loadExpenses(categories).find((e) => e.id === expense.id)
    expect(stored?.status).toBe('APPROVED')
    expect(stored?.approvedByName).toBeTruthy()
  })

  it('stores the audit row for every one of those changes', () => {
    const trail = repo.loadAuditEntries()
    expect(trail.some((a) => a.action === 'UPDATE_PERMISSION')).toBe(true)
    expect(trail.some((a) => a.action === 'APPROVE_EXPENSE')).toBe(true)
  })

  /*
   * A database saved before a column existed is the failure the user hit:
   * `CREATE TABLE IF NOT EXISTS` leaves an existing table alone, so the first
   * SELECT afterwards died with "no such column: exported_at". Wiping the file
   * would have fixed it and thrown away every permission they had set.
   */
  it('carries every late-added column on the live tables', () => {
    for (const [table, columns] of Object.entries(store.ADDED_COLUMNS)) {
      const present = store.columnsOf(table)
      for (const [name] of columns) expect(present).toContain(name)
    }
  })

  it('adds a missing column without touching one that is already there', () => {
    const before = store.columnsOf('debt')
    store.ensureColumns('debt', [
      ['exported_at', 'TEXT'],
      ['export_batch_no', 'TEXT'],
    ])
    expect(store.columnsOf('debt')).toEqual(before)
  })

  it('stores the export stamp on the document itself, not only the batch', async () => {
    const [row] = await mockServices.debts.pendingExport('DEBT')
    if (!row) return
    const { batch } = await mockServices.debts.exportToAccounting('DEBT', [row.id])

    const stored = store.loadDebts().find((d) => d.id === row.id)
    expect(stored?.exportBatchNo).toBe(batch.batchNo)
    expect(stored?.exportedAt).toBeTruthy()

    const batches = store.loadExportBatches()
    expect(batches.find((b) => b.batchNo === batch.batchNo)?.rowCount).toBe(1)
  })

  it('stores the pay-out of every finished purchase', async () => {
    const page = await mockServices.payments.list({ pageSize: 50 })
    if (page.items.length === 0) return
    const stored = store.loadPayments()

    for (const payment of page.items) {
      const row = stored.find((x) => x.id === payment.id)
      expect(row).toBeDefined()
      expect(row?.netAmount).toBeCloseTo(payment.netAmount, 2)
      expect(row?.status).toBe(payment.status)
    }
  })

  it('stores a booking with its lines', async () => {
    const completed = await mockServices.receiving.getQueue({ status: 'COMPLETED', pageSize: 1 })
    const farmerId = completed.items[0]?.farmerId
    if (!farmerId) return

    const sellable = await mockServices.products.sellable()
    const egg = sellable.find((p) => p.kind === 'EGG')!
    const booking = await mockServices.bookings.create({
      bookingDate: new Date().toISOString().slice(0, 10),
      farmerId,
      branchId: 'BR-KPP',
      batchNo: 'RP/2569',
      expectedDeliveryDate: new Date().toISOString().slice(0, 10),
      items: [{ productId: egg.id, quantity: 2 }],
    })

    const farmers = repo.loadFarmers()
    const stored = repo
      .loadBookings(farmers, sellable, repo.loadProjects())
      .find((b) => b.id === booking.id)

    expect(stored?.items).toHaveLength(1)
    expect(stored?.totalAmount).toBe(booking.totalAmount)

    await mockServices.bookings.cancel(booking.id, 'ทดสอบ')
  })
})
