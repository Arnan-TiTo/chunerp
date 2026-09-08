import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '@/types/common'
import { WORK_TYPES } from '@/constants/workTypes'
import type { WorkTypeId } from '@/types/dashboard'
import { mockServices } from './mockAdapter'
import { DEMO_PASSWORD } from './db'

/**
 * A rolling window ending today. Pinning the range to a fixed date is the same
 * mistake the boards used to make: it passes until the calendar moves past it.
 */
const dayOffset = (days: number) => {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const params = {
  branchId: 'ALL',
  dateFrom: dayOffset(-60),
  dateTo: dayOffset(0),
}

beforeAll(async () => {
  await mockServices.auth.login({ username: 'admin', password: DEMO_PASSWORD })
})

describe('auth', () => {
  it('rejects a wrong password with a 401', async () => {
    await expect(
      mockServices.auth.login({ username: 'admin', password: 'nope' }),
    ).rejects.toMatchObject({ status: 401 })
  })

  it('rejects an unknown user', async () => {
    await expect(
      mockServices.auth.login({ username: 'ghost', password: DEMO_PASSWORD }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('dashboard snapshots', () => {
  it.each(WORK_TYPES.map((w) => w.id))(
    'returns a well-formed snapshot for %s',
    async (workTypeId) => {
      const snapshot = await mockServices.dashboard.getSnapshot({ ...params, workTypeId })
      expect(snapshot.workTypeId).toBe(workTypeId)
      expect(snapshot.kpis.length).toBeGreaterThan(0)
      expect(snapshot.panels.length).toBeGreaterThan(0)
      for (const kpi of snapshot.kpis) {
        expect(Number.isFinite(kpi.value)).toBe(true)
        expect(kpi.label).toBeTruthy()
      }
    },
  )

  it('gives each work area a different KPI set', async () => {
    const [receiving, finance] = await Promise.all([
      mockServices.dashboard.getSnapshot({ ...params, workTypeId: 'RECEIVING' }),
      mockServices.dashboard.getSnapshot({ ...params, workTypeId: 'FINANCE' }),
    ])
    expect(receiving.kpis.map((k) => k.id)).not.toEqual(finance.kpis.map((k) => k.id))
  })

  it('rejects an unknown work type', async () => {
    await expect(
      mockServices.dashboard.getSnapshot({ ...params, workTypeId: 'NOPE' as WorkTypeId }),
    ).rejects.toBeInstanceOf(ApiError)
  })
})

describe('expenses', () => {
  it('computes Amount as Quantity × Unit Price server-side (§8.4)', async () => {
    const created = await mockServices.expenses.create({
      expenseDate: '2026-09-01',
      branchId: 'BR-KPP',
      categoryId: 'CAT-ICE',
      description: 'ค่าน้ำแข็ง',
      quantity: 3,
      unitPrice: 125.5,
      paymentMethod: 'CASH',
      status: 'DRAFT',
    })
    expect(created.amount).toBe(376.5)
    expect(created.expenseNo).toMatch(/^EX-2569-\d{4}$/)
  })

  it('refuses to edit an approved expense', async () => {
    const page = await mockServices.expenses.list({ status: 'APPROVED', pageSize: 1 })
    const approved = page.items[0]
    if (!approved) return
    await expect(
      mockServices.expenses.update(approved.id, {
        expenseDate: approved.expenseDate,
        branchId: approved.branchId,
        categoryId: approved.categoryId,
        description: 'x',
        quantity: 1,
        unitPrice: 1,
        paymentMethod: 'CASH',
        status: 'DRAFT',
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('filters by search term', async () => {
    const page = await mockServices.expenses.list({ search: 'ค่าไฟฟ้า', pageSize: 50 })
    for (const item of page.items) {
      const haystack = `${item.expenseNo} ${item.description} ${item.vendor ?? ''}`
      expect(haystack).toContain('ค่าไฟฟ้า')
    }
  })
})

/**
 * A debt is raised by a booking and settled from the รวมรายได้ of a purchase
 * *of the same รอบ*. The two rules worth pinning down are the ceiling and the
 * round matching — get either wrong and a farmer is paid the wrong amount.
 */
/**
 * The chain the business actually runs on:
 *
 *   ใบจอง → ส่งของ → ตั้งหนี้ → ขายรังไหมสด → ใบรับซื้อ → หักหนี้
 *
 * A farmer who never booked has no eggs, so they cannot turn up with cocoons.
 * These tests pin that down, because a broken link here shows up much later as
 * an invoice that cannot be reconciled against any debt.
 */
describe('ใบจอง → ส่งของ → ตั้งหนี้ (§7.4, §7.9)', () => {
  it('raises no debt until the goods are handed over', async () => {
    const page = await mockServices.bookings.list({ status: 'CONFIRMED', pageSize: 5 })
    for (const booking of page.items) {
      expect(booking.delivery).toBeUndefined()
      const debts = await mockServices.debts.list({ search: booking.bookingNo, pageSize: 20 })
      expect(debts.items.find((d) => d.sourceId === booking.id)).toBeUndefined()
    }
  })

  it('records the delivery and opens the debt at the delivered amount', async () => {
    const page = await mockServices.bookings.list({ status: 'PREPARING', pageSize: 5 })
    const booking = page.items[0]
    if (!booking) return

    const delivered = await mockServices.bookings.recordDelivery(booking.id, {
      deliveredAt: '2026-09-08',
      receivedBy: booking.farmerName,
      items: booking.items.map((item) => ({ bookingItemId: item.id, quantity: item.quantity })),
    })

    expect(delivered.status).toBe('DELIVERED')
    expect(delivered.delivery?.totalAmount).toBeCloseTo(booking.totalAmount, 2)

    const debt = await mockServices.debts.get(delivered.delivery!.debtId)
    expect(debt.sourceType).toBe('BOOKING_DELIVERY')
    expect(debt.sourceNo).toBe(booking.bookingNo)
    expect(debt.batchNo).toBe(booking.batchNo)
    expect(debt.originalAmount).toBeCloseTo(booking.totalAmount, 2)
    expect(debt.remainingBalance).toBeCloseTo(booking.totalAmount, 2)
    expect(debt.items).toHaveLength(booking.items.length)
  })

  it('opens the debt at what was delivered, not what was booked', async () => {
    const page = await mockServices.bookings.list({ status: 'PREPARING', pageSize: 5 })
    const booking = page.items.find((b) => b.items.length > 1)
    if (!booking) return

    // One line short-delivered, one line dropped entirely.
    const [first, ...rest] = booking.items
    const delivered = await mockServices.bookings.recordDelivery(booking.id, {
      deliveredAt: '2026-09-08',
      items: [
        { bookingItemId: first.id, quantity: first.quantity },
        ...rest.slice(1).map((item) => ({ bookingItemId: item.id, quantity: item.quantity })),
      ],
    })

    const expected = [first, ...rest.slice(1)].reduce((sum, item) => sum + item.amount, 0)
    expect(delivered.delivery?.totalAmount).toBeCloseTo(Math.round(expected * 100) / 100, 2)
    expect(delivered.delivery?.totalAmount).toBeLessThan(booking.totalAmount)
  })

  it('will not deliver the same booking twice', async () => {
    const page = await mockServices.bookings.list({ status: 'DELIVERED', pageSize: 1 })
    const booking = page.items[0]
    if (!booking) return
    await expect(
      mockServices.bookings.recordDelivery(booking.id, {
        deliveredAt: '2026-09-08',
        items: booking.items.map((item) => ({ bookingItemId: item.id, quantity: item.quantity })),
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses an officer without the right', async () => {
    await mockServices.auth.login({ username: 'account', password: DEMO_PASSWORD })
    const page = await mockServices.bookings.list({ status: 'PREPARING', pageSize: 1 })
    const booking = page.items[0]
    if (booking) {
      await expect(
        mockServices.bookings.recordDelivery(booking.id, {
          deliveredAt: '2026-09-08',
          items: booking.items.map((i) => ({ bookingItemId: i.id, quantity: i.quantity })),
        }),
      ).rejects.toMatchObject({ status: 403 })
    }
    await mockServices.auth.login({ username: 'admin', password: DEMO_PASSWORD })
  })

  it('every farmer in the queue has a delivered booking behind them', async () => {
    const queue = await mockServices.receiving.getQueue({ pageSize: 6 })
    expect(queue.items.length).toBeGreaterThan(0)

    for (const ticket of queue.items) {
      expect(ticket.bookingId).toBeTruthy()
      const booking = await mockServices.bookings.get(ticket.bookingId!)
      expect(booking.farmerId).toBe(ticket.farmerId)
      expect(booking.delivery).toBeDefined()
    }
  })

  it('every completed purchase can be matched to a debt of its own รอบ', async () => {
    const queue = await mockServices.receiving.getQueue({ status: 'COMPLETED', pageSize: 3 })
    for (const ticket of queue.items) {
      const summary = await mockServices.receiving.getPurchaseSummary(ticket.id)
      expect(summary.batchNo).toBeTruthy()

      const debts = await mockServices.debts.list({ farmerId: ticket.farmerId, pageSize: 50 })
      expect(debts.items.some((d) => d.batchNo === summary.batchNo)).toBe(true)
    }
  })
})

/**
 * §8 — approval is what releases the money, so it is a right of its own and a
 * one-way transition. The rules worth pinning down: who may act, what state an
 * item must be in, and that a rejection always carries a reason.
 */
describe('expense approval (§8)', () => {
  async function submitted() {
    const page = await mockServices.expenses.list({ status: 'SUBMITTED', pageSize: 5 })
    return page.items[0]
  }

  it('approves a submitted item and stamps who did it', async () => {
    const expense = await submitted()
    expect(expense).toBeDefined()

    const approved = await mockServices.expenses.approve(expense.id, 'ตรวจเอกสารครบแล้ว')
    expect(approved.status).toBe('APPROVED')
    expect(approved.approvedByName).toBeTruthy()
    expect(approved.approvedAt).toBeTruthy()
  })

  it('will not approve the same item twice', async () => {
    const expense = await submitted()
    if (!expense) return
    await mockServices.expenses.approve(expense.id)
    await expect(mockServices.expenses.approve(expense.id)).rejects.toMatchObject({ status: 409 })
  })

  it('will not approve a draft', async () => {
    const page = await mockServices.expenses.list({ status: 'DRAFT', pageSize: 1 })
    const draft = page.items[0]
    if (!draft) return
    await expect(mockServices.expenses.approve(draft.id)).rejects.toMatchObject({ status: 409 })
  })

  it('rejects with a reason the submitter can act on', async () => {
    const expense = await submitted()
    if (!expense) return
    const rejected = await mockServices.expenses.reject(expense.id, 'ยังไม่แนบใบเสร็จตัวจริง')
    expect(rejected.status).toBe('REJECTED')
    expect(rejected.rejectedReason).toBe('ยังไม่แนบใบเสร็จตัวจริง')
  })

  it('refuses a rejection with no reason', async () => {
    const expense = await submitted()
    if (!expense) return
    await expect(mockServices.expenses.reject(expense.id, '   ')).rejects.toMatchObject({
      status: 422,
    })
  })

  it('refuses an approver without the right — hiding the button is not the guard', async () => {
    // บัญชี creates and edits but does not approve: separation of duties (§13).
    await mockServices.auth.login({ username: 'account', password: DEMO_PASSWORD })
    const expense = await submitted()
    if (expense) {
      await expect(mockServices.expenses.approve(expense.id)).rejects.toMatchObject({ status: 403 })
    }
    await mockServices.auth.login({ username: 'admin', password: DEMO_PASSWORD })
  })
})

describe('debt deduction (§7.9)', () => {
  /** A debt that has at least one completed purchase of its own รอบ behind it. */
  async function debtWithSource() {
    const page = await mockServices.debts.list({ pageSize: 12 })
    for (const debt of page.items) {
      if (debt.remainingBalance <= 0 || debt.status === 'HOLD') continue
      const sources = await mockServices.debts.deductionSources(debt.id)
      if (sources.length > 0) return { debt, source: sources[0] }
    }
    return null
  }

  it('raises the debt from the booking, itemised', async () => {
    const page = await mockServices.debts.list({ pageSize: 1 })
    const debt = page.items[0]
    expect(debt).toBeDefined()
    expect(debt.sourceType).toBe('BOOKING_DELIVERY')
    expect(debt.items.length).toBeGreaterThan(0)

    const itemTotal = debt.items.reduce((sum, i) => sum + i.amount, 0)
    expect(Math.round(itemTotal * 100) / 100).toBeCloseTo(debt.originalAmount, 2)
  })

  it('only offers purchases from the debt\'s own รอบ', async () => {
    const page = await mockServices.debts.list({ pageSize: 6 })
    for (const debt of page.items) {
      const sources = await mockServices.debts.deductionSources(debt.id)
      for (const source of sources) {
        expect(source.batchNo).toBe(debt.batchNo)
        expect(source.availableAmount).toBeGreaterThan(0)
      }
    }
  })

  it('refuses a purchase that belongs to another round', async () => {
    const found = await debtWithSource()
    if (!found) return
    await expect(
      mockServices.debts.previewDeduction(found.debt.id, {
        purchaseId: 'PU-DOES-NOT-EXIST',
        currentDeduction: 1,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('caps the deduction at the invoice income still unapplied', async () => {
    const found = await debtWithSource()
    if (!found) return
    const ceiling = Math.min(found.debt.remainingBalance, found.source.availableAmount)
    await expect(
      mockServices.debts.previewDeduction(found.debt.id, {
        purchaseId: found.source.purchaseId,
        currentDeduction: ceiling + 1,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a zero deduction', async () => {
    const found = await debtWithSource()
    if (!found) return
    await expect(
      mockServices.debts.previewDeduction(found.debt.id, {
        purchaseId: found.source.purchaseId,
        currentDeduction: 0,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('applies the deduction and lowers what the invoice can still pay', async () => {
    const found = await debtWithSource()
    if (!found) return
    const amount = Math.min(100, found.debt.remainingBalance, found.source.availableAmount)

    const after = await mockServices.debts.confirmDeduction(
      found.debt.id,
      { purchaseId: found.source.purchaseId, currentDeduction: amount },
      `test-apply-${found.debt.id}`,
    )
    expect(after.deductedAmount).toBeCloseTo(found.debt.deductedAmount + amount, 2)
    expect(after.remainingBalance).toBeCloseTo(found.debt.remainingBalance - amount, 2)

    const history = await mockServices.debts.deductions(found.debt.id)
    expect(history[0].amount).toBe(amount)
    expect(history[0].purchaseId).toBe(found.source.purchaseId)

    // The same income cannot be spent twice: the invoice now has less to give.
    const sources = await mockServices.debts.deductionSources(found.debt.id)
    const same = sources.find((x) => x.purchaseId === found.source.purchaseId)
    if (same) expect(same.availableAmount).toBeCloseTo(found.source.availableAmount - amount, 2)
  })

  it('rejects a replayed idempotency key (DEBT-004)', async () => {
    const found = await debtWithSource()
    if (!found) return
    const key = 'test-idempotency-key'
    const payload = {
      purchaseId: found.source.purchaseId,
      currentDeduction: Math.min(50, found.debt.remainingBalance, found.source.availableAmount),
    }

    await mockServices.debts.confirmDeduction(found.debt.id, payload, key)
    await expect(
      mockServices.debts.confirmDeduction(found.debt.id, payload, key),
    ).rejects.toMatchObject({ status: 409 })
  })
})

/**
 * The physical order is จุดคัดแยก → จุดชั่งน้ำหนัก: the slip is written and
 * issued first, and the queue number only exists from that moment on.
 */
describe('จุดคัดแยก → จุดชั่งน้ำหนัก', () => {
  /**
   * Opens a slip the way the counter does: against a round that has been
   * delivered and has no queue yet.
   *
   * There are only ever a handful of open rounds — a farmer rears one at a time
   * — so each slip is cancelled afterwards, which is also what the counter does
   * with a slip written in error. Without that, the suite would exhaust the
   * rounds and start failing on data rather than on behaviour.
   */
  const openedSlips: string[] = []

  const openSlip = async () => {
    const page = await mockServices.bookings.list({ status: 'DELIVERED', pageSize: 20 })
    const farmerIds = [...new Set(page.items.map((b) => b.farmerId))]
    const lists = await Promise.all(
      farmerIds.map((farmerId) => mockServices.bookings.rounds(farmerId)),
    )
    const round = lists.flat().filter((r) => r.eligible)[0]
    if (!round) throw new Error('no deliverable round left to open a slip against')

    const slip = await mockServices.receiving.createQueue({
      farmerId: round.booking.farmerId,
      branchId: 'BR-KPP',
      bookingId: round.booking.id,
    })
    openedSlips.push(slip.id)
    return slip
  }

  afterEach(async () => {
    for (const id of openedSlips.splice(0)) {
      await mockServices.receiving.cancelQueue(id, 'ทดสอบ').catch(() => undefined)
    }
  })

  const fillSorting = (queueId: string) =>
    mockServices.receiving.saveQuality(queueId, {
      goodCocoonQty: 12,
      afterScreenQty: 2,
      damagedCocoonQty: 1,
      doubleCocoonQty: 0,
      thinCocoonQty: 0,
      flossQty: 1,
      dryingLevel: 'OLD',
      moisturePercent: 18,
    })

  it('opens a slip with no queue number yet', async () => {
    const slip = await openSlip()
    expect(slip.status).toBe('SORTING')
    expect(slip.queueNo).toBeNull()
  })

  /**
   * "No round available" has several causes, and the counter's next action is
   * different for each. Returning the reason is what stops the screen telling
   * someone to record a delivery that already happened.
   */
  it('says why a round cannot be used, not just that it cannot', async () => {
    const page = await mockServices.bookings.list({ pageSize: 30 })
    const seen = new Set<string>()

    for (const booking of page.items) {
      const rounds = await mockServices.bookings.rounds(booking.farmerId)
      for (const round of rounds) {
        if (round.eligible) {
          expect(round.blockedReason).toBeUndefined()
          seen.add('ELIGIBLE')
        } else {
          expect(round.blockedReason).toBeTruthy()
          seen.add(round.blockedReason!)
        }
      }
    }

    // The fixture puts a farmer in each of these states on purpose.
    expect(seen.has('ELIGIBLE')).toBe(true)
    expect(seen.has('NOT_DELIVERED')).toBe(true)
    expect(seen.has('ALREADY_PURCHASED')).toBe(true)
  })

  it('reports a round whose slip is still open as ALREADY_QUEUED', async () => {
    const queue = await mockServices.receiving.getQueue({ pageSize: 20 })
    const open = queue.items.find((t) => t.status !== 'COMPLETED' && t.status !== 'CANCELLED')
    if (!open?.bookingId) return

    const rounds = await mockServices.bookings.rounds(open.farmerId)
    const round = rounds.find((r) => r.booking.id === open.bookingId)
    expect(round?.eligible).toBe(false)
    expect(round?.blockedReason).toBe('ALREADY_QUEUED')
    expect(round?.queueId).toBe(open.id)
  })

  it('keeps the round of the slip being edited selectable', async () => {
    const queue = await mockServices.receiving.getQueue({ status: 'SORTING', pageSize: 5 })
    const draft = queue.items[0]
    if (!draft?.bookingId) return

    const rounds = await mockServices.bookings.rounds(draft.farmerId, draft.bookingId)
    expect(rounds.find((r) => r.booking.id === draft.bookingId)?.eligible).toBe(true)
  })

  it('refuses a slip for a round that was never delivered', async () => {
    const page = await mockServices.bookings.list({ status: 'CONFIRMED', pageSize: 1 })
    const booking = page.items[0]
    if (!booking) return
    await expect(
      mockServices.receiving.createQueue({
        farmerId: booking.farmerId,
        branchId: 'BR-KPP',
        bookingId: booking.id,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it("refuses a round that belongs to another farmer", async () => {
    const page = await mockServices.bookings.list({ status: 'DELIVERED', pageSize: 20 })
    const booking = page.items[0]
    const other = page.items.find((b) => b.farmerId !== booking?.farmerId)
    if (!booking || !other) return
    await expect(
      mockServices.receiving.createQueue({
        farmerId: other.farmerId,
        branchId: 'BR-KPP',
        bookingId: booking.id,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('will not open a second slip for the same round', async () => {
    const slip = await openSlip()
    await expect(
      mockServices.receiving.createQueue({
        farmerId: slip.farmerId,
        branchId: 'BR-KPP',
        bookingId: slip.bookingId!,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('takes สายพันธุ์ · รุ่นฟัก · จำนวนกล่อง from the round, not the caller', async () => {
    const slip = await openSlip()
    const booking = await mockServices.bookings.get(slip.bookingId!)

    expect(slip.breedName).toBe(booking.breedName)
    expect(slip.hatchDate).toBe(booking.hatchDate)
    expect(slip.expectedBoxes).toBe(booking.quantity)
  })

  it('refuses to issue a slip with no sorting result', async () => {
    const slip = await openSlip()
    await expect(mockServices.receiving.issueSlip(slip.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('refuses to issue a slip whose cocoon counts are all zero', async () => {
    const slip = await openSlip()
    await mockServices.receiving.saveQuality(slip.id, {
      goodCocoonQty: 0,
      afterScreenQty: 0,
      damagedCocoonQty: 0,
      doubleCocoonQty: 0,
      thinCocoonQty: 0,
      flossQty: 0,
    })
    await expect(mockServices.receiving.issueSlip(slip.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('assigns the queue number and locks the sorting result on issue', async () => {
    const slip = await openSlip()
    await fillSorting(slip.id)

    const issued = await mockServices.receiving.issueSlip(slip.id)
    expect(issued.queueNo).toBeGreaterThan(0)
    expect(issued.status).toBe('WAITING_WEIGH')
    expect(issued.issuedAt).toBeTruthy()

    const quality = await mockServices.receiving.getQuality(slip.id)
    expect(quality.confirmed).toBe(true)
    // Locked: the slip is now a printed document.
    await expect(fillSorting(slip.id)).rejects.toMatchObject({ status: 409 })
  })

  it('cannot issue the same slip twice', async () => {
    const slip = await openSlip()
    await fillSorting(slip.id)
    await mockServices.receiving.issueSlip(slip.id)
    await expect(mockServices.receiving.issueSlip(slip.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('cannot edit the header once the slip is issued', async () => {
    const slip = await openSlip()
    await fillSorting(slip.id)
    await mockServices.receiving.issueSlip(slip.id)
    await expect(
      mockServices.receiving.updateQueue(slip.id, {
        farmerId: slip.farmerId,
        branchId: 'BR-NKT',
        bookingId: slip.bookingId!,
      }),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('will not weigh a slip that has not been issued', async () => {
    const slip = await openSlip()
    await expect(mockServices.receiving.startWeighing(slip.id)).rejects.toMatchObject({
      status: 409,
    })
    await expect(mockServices.receiving.callQueue(slip.id)).rejects.toMatchObject({
      status: 409,
    })
  })

  it('runs the full station-to-station flow', async () => {
    const slip = await openSlip()
    await fillSorting(slip.id)
    const issued = await mockServices.receiving.issueSlip(slip.id)

    const called = await mockServices.receiving.callQueue(issued.id)
    expect(called.status).toBe('CALLED')

    const weighing = await mockServices.receiving.startWeighing(issued.id)
    expect(weighing.status).toBe('WEIGHING')

    // Bags go on one at a time; the split and the totals come back computed.
    await mockServices.receiving.addWeighBag(issued.id, {
      grade: 'GOOD',
      weightKg: 40,
      source: 'MANUAL',
    })
    await mockServices.receiving.addWeighBag(issued.id, {
      grade: 'DOUBLE',
      weightKg: 8,
      source: 'MANUAL',
    })
    const fresh = await mockServices.receiving.addWeighBag(issued.id, {
      grade: 'FLOSS',
      weightKg: 2,
      source: 'MANUAL',
    })
    expect(fresh.lines).toHaveLength(3)
    expect(fresh.totalCocoonWeight).toBe(48)
    expect(fresh.totalScrapWeight).toBe(2)

    await mockServices.receiving.saveShellWeighSlip(issued.id, {
      sampleCocoonCount: 25,
      sampleCocoonWeightG: 42,
      shellWeightG: 8.4,
      moisturePercent: 14,
    })

    const locked = await mockServices.receiving.lockFreshWeighSlip(issued.id)
    expect(locked.locked).toBe(true)

    const summary = await mockServices.receiving.completePurchase(issued.id)
    expect(summary.status).toBe('COMPLETED')
    expect(summary.totalCocoonWeight).toBe(48)
    expect(summary.totalScrapWeight).toBe(2)
    expect(summary.grossAmount).toBeGreaterThan(0)
    expect(summary.analysis.shellPercent).toBe(20)
    // A full walk of both stations crosses the mock latency a dozen times.
  }, 20_000)

  it('bills ดี/เสีย/แฝด as น้ำหนักรัง and บาง/ปุยไหม as น้ำหนักเศษ', async () => {
    const slip = await openSlip()
    await fillSorting(slip.id)
    const issued = await mockServices.receiving.issueSlip(slip.id)
    await mockServices.receiving.callQueue(issued.id)
    await mockServices.receiving.startWeighing(issued.id)
    await mockServices.receiving.addWeighBag(issued.id, {
      grade: 'THIN',
      weightKg: 5,
      source: 'MANUAL',
    })

    const summary = await mockServices.receiving.getPurchaseSummary(issued.id)
    const thin = summary.lines.find((l) => l.grade === 'THIN')
    expect(thin?.scrapWeight).toBe(5)
    expect(thin?.cocoonWeight).toBeNull()
    expect(summary.totalCocoonWeight).toBe(0)
    expect(summary.totalScrapWeight).toBe(5)
  })

  it('will not lock a slip that has no bag on it yet', async () => {
    const slip = await openSlip()
    await fillSorting(slip.id)
    const issued = await mockServices.receiving.issueSlip(slip.id)
    await mockServices.receiving.callQueue(issued.id)
    await mockServices.receiving.startWeighing(issued.id)

    await expect(mockServices.receiving.lockFreshWeighSlip(issued.id)).rejects.toMatchObject({
      status: 422,
    })
  })

  it('rejects a bag weight that is not positive', async () => {
    const page = await mockServices.receiving.getQueue({ status: 'WEIGHING', pageSize: 1 })
    const ticket = page.items[0]
    if (!ticket) return
    await expect(
      mockServices.receiving.addWeighBag(ticket.id, {
        grade: 'GOOD',
        weightKg: 0,
        source: 'MANUAL',
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects a shell heavier than the sample it came from', async () => {
    const page = await mockServices.receiving.getQueue({ status: 'WEIGHING', pageSize: 1 })
    const ticket = page.items[0]
    if (!ticket) return
    await expect(
      mockServices.receiving.saveShellWeighSlip(ticket.id, {
        sampleCocoonCount: 20,
        sampleCocoonWeightG: 30,
        shellWeightG: 31,
        moisturePercent: 12,
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

/**
 * INT-001 — the weighing happens in Floor Weight Cocoon, a separate database.
 * What matters here is the filter contract and the rule that one external slip
 * can only ever land on one queue.
 */
describe('Floor Weight integration', () => {
  it('reports the link and what is visible through it', async () => {
    const status = await mockServices.integration.floorWeightStatus()
    expect(status.connected).toBe(true)
    expect(status.sessionCount).toBeGreaterThan(0)
  })

  /** A ticket on the scale, plus the external session waiting for it. */
  async function weighingTicket() {
    const page = await mockServices.receiving.getQueue({ status: 'WEIGHING', pageSize: 5 })
    for (const ticket of page.items) {
      const sessions = await mockServices.integration.floorWeightSessions({
        farmerCode: ticket.farmerCode,
      })
      const free = sessions.find((s) => s.importedQueueId == null)
      if (free) return { ticket, session: free }
    }
    return null
  }

  it('filters by farmer code and defaults to the latest weigh date', async () => {
    const found = await weighingTicket()
    if (!found) return

    const latest = await mockServices.integration.floorWeightLatestDate(found.ticket.farmerCode)
    expect(latest).toBeTruthy()

    const sessions = await mockServices.integration.floorWeightSessions({
      farmerCode: found.ticket.farmerCode,
    })
    for (const session of sessions) {
      expect(session.farmerCode).toBe(found.ticket.farmerCode)
      expect(session.weighDate).toBe(latest)
      expect(session.status).toBe('CLOSED')
    }
  })

  it('needs a farmer code', async () => {
    await expect(
      mockServices.integration.floorWeightSessions({ farmerCode: '' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('returns nothing for a farmer the scale has never seen', async () => {
    const sessions = await mockServices.integration.floorWeightSessions({
      farmerCode: 'FM-NOT-A-FARMER',
    })
    expect(sessions).toEqual([])
  })

  it('imports the external bags into both slips', async () => {
    const found = await weighingTicket()
    if (!found) return

    const { fresh, shell } = await mockServices.integration.importFloorWeight(
      found.ticket.id,
      found.session.sessionId,
    )
    expect(fresh.source).toBe('SCALE')
    expect(fresh.lines).toHaveLength(found.session.bags.length)
    expect(fresh.totalCocoonWeight + fresh.totalScrapWeight).toBeCloseTo(
      found.session.totalWeightKg,
      1,
    )
    expect(shell.shellPercent).not.toBeNull()

    // And it is what the receiving service now serves.
    const stored = await mockServices.receiving.getFreshWeighSlip(found.ticket.id)
    expect(stored.slipNo).toBe(found.session.sessionNo)
  })

  it('will not pull the same external slip onto a second queue', async () => {
    const found = await weighingTicket()
    if (!found) return
    await mockServices.integration.importFloorWeight(found.ticket.id, found.session.sessionId)

    const other = await mockServices.receiving.getQueue({ status: 'WEIGHING', pageSize: 10 })
    const otherTicket = other.items.find((t) => t.id !== found.ticket.id)
    if (!otherTicket) return

    await expect(
      mockServices.integration.importFloorWeight(otherTicket.id, found.session.sessionId),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('will not pull a weighing that belongs to another farmer', async () => {
    const found = await weighingTicket()
    if (!found) return
    const page = await mockServices.receiving.getQueue({ status: 'WEIGHING', pageSize: 10 })
    const otherTicket = page.items.find((t) => t.farmerCode !== found.ticket.farmerCode)
    if (!otherTicket) return

    await expect(
      mockServices.integration.importFloorWeight(otherTicket.id, found.session.sessionId),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('rejects an unknown session', async () => {
    const page = await mockServices.receiving.getQueue({ status: 'WEIGHING', pageSize: 1 })
    const ticket = page.items[0]
    if (!ticket) return
    await expect(
      mockServices.integration.importFloorWeight(ticket.id, 999_999),
    ).rejects.toMatchObject({ status: 404 })
  })
})

describe('pagination', () => {
  it('clamps an out-of-range page instead of returning nothing', async () => {
    const page = await mockServices.farmers.list({ page: 9999, pageSize: 10 })
    expect(page.page).toBe(page.totalPages)
    expect(page.items.length).toBeGreaterThan(0)
  })
})

/**
 * §12 — the accounting hand-over.
 *
 * Two things must hold no matter what the counter does: a document reaches
 * accounting exactly once, and the farmer is paid exactly the difference
 * between what their cocoons were worth and what their round owed.
 */
describe('ส่งออกไประบบบัญชี BPlus (§12)', () => {
  it('lists debts that have not been sent yet', async () => {
    const rows = await mockServices.debts.pendingExport('DEBT')
    const debts = await mockServices.debts.list({ pageSize: 50 })
    for (const row of rows) {
      const debt = debts.items.find((d) => d.id === row.id)
      expect(debt?.exportedAt).toBeUndefined()
      expect(row.docNo).toBe(debt?.sourceNo)
      expect(row.amount).toBeCloseTo(debt?.originalAmount ?? 0, 2)
    }
  })

  it('stamps every row in the file and drops it from the waiting list', async () => {
    const [first] = await mockServices.debts.pendingExport('DEBT')
    if (!first) return

    const result = await mockServices.debts.exportToAccounting('DEBT', [first.id])
    expect(result.batch.rowCount).toBe(1)
    expect(result.batch.target).toBe('BPLUS')
    expect(result.batch.totalAmount).toBeCloseTo(first.amount, 2)

    const debt = await mockServices.debts.get(first.id)
    expect(debt.exportedAt).toBeTruthy()
    expect(debt.exportBatchNo).toBe(result.batch.batchNo)

    const remaining = await mockServices.debts.pendingExport('DEBT')
    expect(remaining.some((r) => r.id === first.id)).toBe(false)
  })

  it('refuses to send the same document twice', async () => {
    const [first] = await mockServices.debts.pendingExport('DEBT')
    if (!first) return
    await mockServices.debts.exportToAccounting('DEBT', [first.id])
    await expect(
      mockServices.debts.exportToAccounting('DEBT', [first.id]),
    ).rejects.toMatchObject({ status: 409 })
  })

  it('refuses an empty selection', async () => {
    await expect(mockServices.debts.exportToAccounting('DEBT', [])).rejects.toMatchObject({
      status: 422,
    })
  })

  it('writes a CSV Excel can read in Thai', async () => {
    const [first] = await mockServices.debts.pendingExport('DEBT')
    if (!first) return
    const { content, batch } = await mockServices.debts.exportToAccounting('DEBT', [first.id])

    // Without the BOM, Excel on a Thai Windows reads the file as TIS-620 and
    // every farmer's name becomes mojibake.
    expect(content.startsWith('\uFEFF')).toBe(true)
    const [header, ...lines] = content.slice(1).trim().split('\r\n')
    expect(header.split(',')[0]).toBe('DocNo')
    expect(lines.length).toBeGreaterThan(0)
    expect(lines.every((line) => line.startsWith(first.docNo))).toBe(true)
    expect(batch.fileName).toMatch(/^BPLUS_AR_.*\.csv$/)
  })

  it('keeps every batch in the history', async () => {
    const [first] = await mockServices.debts.pendingExport('DEBT')
    if (!first) return
    const { batch } = await mockServices.debts.exportToAccounting('DEBT', [first.id])
    const history = await mockServices.debts.exportHistory()
    expect(history.some((b) => b.batchNo === batch.batchNo)).toBe(true)
    expect(history[0].exportedAt >= history[history.length - 1].exportedAt).toBe(true)
  })

  /*
   * ไร่ซื้อรังไหมสดเป็น *วัตถุดิบ* เข้าโรงงาน ไม่ใช่แค่จ่ายเงินออก — ไฟล์นี้จึง
   * ต้องมีรายการสินค้าแยกตามชั้นคุณภาพ พร้อมน้ำหนักเป็นกิโลกรัม ไม่ใช่ยอดรวม
   * ก้อนเดียว
   */
  it('sends the purchase as goods, one line per grade', async () => {
    const rows = await mockServices.debts.pendingExport('PURCHASE')
    if (rows.length === 0) return

    const summary = await mockServices.receiving.getPurchaseSummary(rows[0].id)
    const { content } = await mockServices.debts.exportToAccounting('PURCHASE', [rows[0].id])
    const [header, ...lines] = content.slice(1).trim().split('\r\n')

    expect(header.split(',')).toEqual([
      'DocNo', 'DocDate', 'VendCode', 'VendName', 'BranchCode', 'BatchNo',
      'ItemCode', 'ItemName', 'Qty', 'Unit', 'UnitPrice', 'Amount', 'DocTotal', 'Remark',
    ])

    // One line per grade that actually had weight — a zero line is not a stock
    // movement and must not reach the ledger.
    const weighed = summary.lines.filter((l) => (l.cocoonWeight ?? l.scrapWeight ?? 0) > 0)
    expect(lines).toHaveLength(weighed.length)
    expect(lines.every((line) => line.includes('กิโลกรัม'))).toBe(true)

    // The lines must add up to the invoice total, or the raw material booked in
    // does not match the liability raised against it.
    const amounts = lines.map((line) => Number(line.split(',').at(-3)))
    const sum = Math.round(amounts.reduce((a, b) => a + b, 0) * 100) / 100
    expect(sum).toBeCloseTo(summary.grossAmount, 2)

    // Booking the same goods in twice would double the mill's raw material.
    const stamped = await mockServices.receiving.getPurchaseSummary(rows[0].id)
    expect(stamped.exportedAt).toBeTruthy()
    expect(stamped.exportBatchNo).toBeTruthy()
    await expect(
      mockServices.debts.exportToAccounting('PURCHASE', [rows[0].id]),
    ).rejects.toMatchObject({ status: 409 })
    const waiting = await mockServices.debts.pendingExport('PURCHASE')
    expect(waiting.some((r) => r.id === rows[0].id)).toBe(false)
  })

  it('carries both document numbers on an offset row', async () => {
    const rows = await mockServices.debts.pendingExport('DEDUCTION')
    if (rows.length === 0) return
    const { content } = await mockServices.debts.exportToAccounting('DEDUCTION', [rows[0].id])
    const header = content.slice(1).split('\r\n')[0].split(',')
    // Accounting cannot post an offset without knowing which receivable it
    // pays down and which purchase paid it.
    expect(header).toContain('ARDocNo')
    expect(header).toContain('APDocNo')
  })
})

describe('จ่ายเงินเกษตรกร (§7.10)', () => {
  it('gives every finished purchase a pay-out worth gross − deducted', async () => {
    const page = await mockServices.payments.list({ pageSize: 50 })
    expect(page.items.length).toBeGreaterThan(0)
    for (const payment of page.items) {
      expect(payment.netAmount).toBeCloseTo(payment.grossAmount - payment.deductedAmount, 2)
      expect(payment.transactionNo).toBeTruthy()
    }
  })

  it('finds the pay-out from the invoice it belongs to', async () => {
    const [payment] = (await mockServices.payments.list({ pageSize: 1 })).items
    if (!payment) return
    const found = await mockServices.payments.forPurchase(payment.purchaseId)
    expect(found?.id).toBe(payment.id)
  })

  it('will not pay a round whose debt could still be settled from this invoice', async () => {
    const page = await mockServices.payments.list({ pageSize: 50 })
    const pending = page.items.filter((x) => x.status === 'PENDING')
    for (const payment of pending) {
      const debts = await mockServices.debts.list({ farmerId: payment.farmerId, pageSize: 20 })
      const owes = debts.items.some(
        (d) => d.batchNo === payment.batchNo && d.remainingBalance > 0 && d.status !== 'HOLD',
      )
      if (!owes) continue
      await expect(
        mockServices.payments.pay(
          payment.id,
          { method: 'CASH', paidDate: dayOffset(0) },
          `test-pay-blocked-${payment.id}`,
        ),
      ).rejects.toMatchObject({ status: 409 })
      return
    }
  })

  /** Settles whatever the round still owes out of its own invoice. */
  async function settleRoundOf(payment: { id: string; farmerId: string; batchNo?: string; purchaseId: string }) {
    const debts = await mockServices.debts.list({ farmerId: payment.farmerId, pageSize: 20 })
    for (const debt of debts.items) {
      if (debt.batchNo !== payment.batchNo || debt.remainingBalance <= 0) continue
      if (debt.status === 'HOLD') continue
      const sources = await mockServices.debts.deductionSources(debt.id)
      const source = sources.find((x) => x.purchaseId === payment.purchaseId)
      if (!source) continue
      await mockServices.debts.confirmDeduction(
        debt.id,
        {
          purchaseId: source.purchaseId,
          currentDeduction: Math.min(debt.remainingBalance, source.availableAmount),
        },
        `test-settle-${debt.id}-${Date.now()}`,
      )
    }
  }

  it('pays the difference once the round debt has been taken off', async () => {
    const page = await mockServices.payments.list({ pageSize: 50 })
    const pending = page.items.find((x) => x.status === 'PENDING')
    if (!pending) return

    await settleRoundOf(pending)
    const ready = await mockServices.payments.get(pending.id)
    if (ready.netAmount <= 0) return

    const key = `test-pay-${ready.id}`
    const paid = await mockServices.payments.pay(
      ready.id,
      {
        method: 'BANK_TRANSFER',
        paidDate: dayOffset(0),
        bankName: 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร',
        transferRef: 'TRF-TEST-001',
      },
      key,
    )
    expect(paid.status).toBe('PAID')
    expect(paid.netAmount).toBeCloseTo(ready.grossAmount - ready.deductedAmount, 2)
    expect(paid.paidByName).toBeTruthy()
    expect(paid.bankName).toContain('ธนาคาร')
    expect(paid.transferRef).toBe('TRF-TEST-001')

    // A retried click must not pay the same farmer a second time.
    await expect(
      mockServices.payments.pay(
        ready.id,
        { method: 'CASH', paidDate: dayOffset(0) },
        key,
      ),
    ).rejects.toMatchObject({ status: 409 })
  }, 20_000)

  it('refuses a transfer with no bank named', async () => {
    const page = await mockServices.payments.list({ pageSize: 50 })
    const pending = page.items.find((x) => x.status === 'PENDING')
    if (!pending) return
    await settleRoundOf(pending)
    const ready = await mockServices.payments.get(pending.id)
    if (ready.netAmount <= 0) return

    await expect(
      mockServices.payments.pay(
        ready.id,
        { method: 'BANK_TRANSFER', paidDate: dayOffset(0) },
        `test-pay-nobank-${ready.id}`,
      ),
    ).rejects.toMatchObject({ status: 422 })
  }, 20_000)

  it('will not send a pay-out to accounting before the money has gone out', async () => {
    const rows = await mockServices.debts.pendingExport('PAYMENT')
    const page = await mockServices.payments.list({ pageSize: 50 })
    for (const row of rows) {
      const payment = page.items.find((x) => x.id === row.id)
      expect(payment?.status).toBe('PAID')
    }
    const stillPending = page.items.find((x) => x.status === 'PENDING')
    if (stillPending) {
      await expect(
        mockServices.debts.exportToAccounting('PAYMENT', [stillPending.id]),
      ).rejects.toMatchObject({ status: 409 })
    }
  })

  it('stamps a paid voucher once it is sent', async () => {
    const [row] = await mockServices.debts.pendingExport('PAYMENT')
    if (!row) return
    const { batch, content } = await mockServices.debts.exportToAccounting('PAYMENT', [row.id])
    expect(batch.fileName).toMatch(/^BPLUS_PAYMENT_/)
    expect(content.slice(1).split('\r\n')[0].split(',')).toContain('PayType')

    const payment = await mockServices.payments.get(row.id)
    expect(payment.exportBatchNo).toBe(batch.batchNo)
  })
})
