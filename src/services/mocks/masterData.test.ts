import { beforeAll, describe, expect, it } from 'vitest'
import { mockServices } from './mockAdapter'
import { DEMO_PASSWORD } from './db'

/**
 * Every dropdown in the app resolves from these tables, so the contract that
 * matters is: options are editable, and disabling a row removes it from new
 * documents without breaking existing ones.
 */
beforeAll(async () => {
  await mockServices.auth.login({ username: 'admin', password: DEMO_PASSWORD })
})

describe('general master data', () => {
  it('returns only active rows by default and everything when asked', async () => {
    const created = await mockServices.master.saveProject(null, {
      code: `PJX-${Date.now()}`,
      name: 'โครงการปิดใช้งาน',
      active: false,
    })
    const activeOnly = await mockServices.master.projects()
    const all = await mockServices.master.projects(true)

    expect(activeOnly.find((p) => p.id === created.id)).toBeUndefined()
    expect(all.find((p) => p.id === created.id)).toBeDefined()
  })

  it('rejects a duplicate code', async () => {
    const code = `BRX-${Date.now()}`
    await mockServices.master.saveBranch(null, { code, name: 'สาขาทดสอบ', active: true })
    await expect(
      mockServices.master.saveBranch(null, { code, name: 'ซ้ำ', active: true }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('updates a row in place rather than creating a second one', async () => {
    const before = await mockServices.master.banks(true)
    const target = before[0]
    const updated = await mockServices.master.saveBank(target.id, {
      code: target.code,
      name: 'ชื่อใหม่',
      active: true,
    })
    const after = await mockServices.master.banks(true)

    expect(updated.id).toBe(target.id)
    expect(after).toHaveLength(before.length)
    expect(after.find((b) => b.id === target.id)?.name).toBe('ชื่อใหม่')
  })

  it('feeds the expense category dropdown from the master', async () => {
    const created = await mockServices.master.saveExpenseCategory(null, {
      code: `ECX-${Date.now()}`,
      name: 'หมวดทดสอบ',
      active: true,
      types: [
        { name: 'ย่อย ก', active: true },
        { name: 'ย่อย ข', active: true },
      ],
    })
    expect(created.types).toHaveLength(2)

    // The expense form reads through this call, so the new row must appear.
    const options = await mockServices.expenses.categories()
    const found = options.find((c) => c.id === created.id)
    expect(found?.name).toBe('หมวดทดสอบ')
    expect(found?.types.map((t) => t.name)).toEqual(['ย่อย ก', 'ย่อย ข'])
  })

  it('hides a disabled category from the dropdown', async () => {
    const created = await mockServices.master.saveExpenseCategory(null, {
      code: `ECD-${Date.now()}`,
      name: 'หมวดที่ปิด',
      active: true,
      types: [],
    })
    await mockServices.master.saveExpenseCategory(created.id, {
      code: created.code,
      name: created.name,
      active: false,
      types: [],
    })

    const options = await mockServices.expenses.categories()
    expect(options.find((c) => c.id === created.id)).toBeUndefined()
  })

  it('drops a disabled sub-type from the dependent dropdown', async () => {
    const created = await mockServices.master.saveExpenseCategory(null, {
      code: `ECT-${Date.now()}`,
      name: 'หมวดมีย่อย',
      active: true,
      types: [
        { name: 'เปิดอยู่', active: true },
        { name: 'ปิดแล้ว', active: false },
      ],
    })
    const options = await mockServices.expenses.categories()
    const found = options.find((c) => c.id === created.id)
    expect(found?.types.map((t) => t.name)).toEqual(['เปิดอยู่'])
  })
})
