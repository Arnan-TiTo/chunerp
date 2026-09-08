import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '@/types/common'
import { mockServices } from './mockAdapter'
import { DEMO_PASSWORD } from './db'

/**
 * The point of the product master is that a document can never invent a price.
 * These cover that boundary from both sides.
 */
beforeAll(async () => {
  await mockServices.auth.login({ username: 'admin', password: DEMO_PASSWORD })
})

/**
 * A farmer rears one round at a time, so only someone whose last round has been
 * bought may book again. That is the farmer these tests write against, and each
 * booking is cancelled afterwards to hand them back.
 */
const freeFarmerId = async () => {
  const completed = await mockServices.receiving.getQueue({ status: 'COMPLETED', pageSize: 1 })
  const ticket = completed.items[0]
  if (ticket) return ticket.farmerId
  return (await mockServices.farmers.search('')).at(0)!.value as string
}

const created: string[] = []

const bookingHeader = async () => ({
  bookingDate: '2026-09-01',
  farmerId: await freeFarmerId(),
  branchId: 'BR-KPP',
  batchNo: 'RT/2569',
  expectedDeliveryDate: '2026-09-22',
})

/** Books a round and remembers it, so the farmer is free again next test. */
const createBooking = async (
  items: { productId: string; quantity: number }[],
) => {
  const booking = await mockServices.bookings.create({ ...(await bookingHeader()), items })
  created.push(booking.id)
  return booking
}

afterEach(async () => {
  for (const id of created.splice(0)) {
    await mockServices.bookings.cancel(id, 'ทดสอบ')
  }
})

describe('product master', () => {
  it('only offers active, priced products to documents', async () => {
    const sellable = await mockServices.products.sellable()
    expect(sellable.length).toBeGreaterThan(0)
    for (const p of sellable) {
      expect(p.active).toBe(true)
      expect(p.currentPrice).not.toBeNull()
    }
  })

  it('creates a product with no price, so it cannot be sold yet', async () => {
    const units = await mockServices.products.units()
    const product = await mockServices.products.create({
      code: `TST-${Date.now()}`,
      name: 'สินค้าทดสอบ',
      kind: 'SUPPLY',
      unitId: units[0].id,
      active: true,
    })
    expect(product.currentPrice).toBeNull()

    const sellable = await mockServices.products.sellable('สินค้าทดสอบ')
    expect(sellable.find((p) => p.id === product.id)).toBeUndefined()
  })

  it('rejects a duplicate product code', async () => {
    const units = await mockServices.products.units()
    const code = `DUP-${Date.now()}`
    const payload = {
      code,
      name: 'ซ้ำ',
      kind: 'SUPPLY' as const,
      unitId: units[0].id,
      active: true,
    }
    await mockServices.products.create(payload)
    await expect(mockServices.products.create(payload)).rejects.toMatchObject({ status: 422 })
  })

  it('supersedes the previous price instead of overwriting it', async () => {
    const page = await mockServices.products.list({ pageSize: 1 })
    const product = page.items[0]
    const before = product.currentPrice

    const created = await mockServices.products.savePrice({
      productId: product.id,
      price: 999,
      effectiveFrom: '2026-09-07',
    })
    expect(created.current).toBe(true)
    expect(created.price).toBe(999)

    const history = await mockServices.products.prices({ productId: product.id, pageSize: 50 })
    const current = history.items.filter((p) => p.current)
    expect(current).toHaveLength(1)
    // The old row is kept, closed off with an end date.
    const superseded = history.items.find((p) => !p.current && p.price === before)
    expect(superseded?.effectiveTo).toBeTruthy()

    const refreshed = await mockServices.products.get(product.id)
    expect(refreshed.currentPrice).toBe(999)
  })

  it('rejects a negative price', async () => {
    const page = await mockServices.products.list({ pageSize: 1 })
    await expect(
      mockServices.products.savePrice({
        productId: page.items[0].id,
        price: -1,
        effectiveFrom: '2026-09-07',
      }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('booking document body', () => {
  it('prices each line from the master and totals them', async () => {
    const sellable = await mockServices.products.sellable()
    const egg = sellable.find((p) => p.kind === 'EGG')!
    const supply = sellable.find((p) => p.kind !== 'EGG')!

    const booking = await createBooking([
      { productId: egg.id, quantity: 2 },
      { productId: supply.id, quantity: 3 },
    ])

    expect(booking.items).toHaveLength(2)
    const eggLine = booking.items.find((i) => i.productId === egg.id)!
    expect(eggLine.unitPrice).toBe(egg.currentPrice)
    expect(eggLine.unitName).toBe(egg.unitName)
    expect(eggLine.amount).toBe(2 * egg.currentPrice!)

    const expectedTotal = 2 * egg.currentPrice! + 3 * supply.currentPrice!
    expect(booking.totalAmount).toBe(expectedTotal)
  })

  it('derives the egg quantity and breed for the receiving slip', async () => {
    const sellable = await mockServices.products.sellable()
    const egg = sellable.find((p) => p.kind === 'EGG')!
    const supply = sellable.find((p) => p.kind !== 'EGG')!

    const booking = await createBooking([
      { productId: egg.id, quantity: 1.5 },
      { productId: supply.id, quantity: 4 },
    ])

    // Only the EGG line counts towards จำนวนไข่ไหมที่จองไป.
    expect(booking.quantity).toBe(1.5)
    expect(booking.breedName).toBe(egg.name)
    expect(booking.unit).toBe(egg.unitName)
  })

  it('refuses a booking with no lines', async () => {
    await expect(
      mockServices.bookings.create({ ...(await bookingHeader()), items: [] }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('refuses a line whose product has no price', async () => {
    const units = await mockServices.products.units()
    const unpriced = await mockServices.products.create({
      code: `NOPRICE-${Date.now()}`,
      name: 'ยังไม่ตั้งราคา',
      kind: 'SUPPLY',
      unitId: units[0].id,
      active: true,
    })
    await expect(
      mockServices.bookings.create({
        ...(await bookingHeader()),
        items: [{ productId: unpriced.id, quantity: 1 }],
      }),
    ).rejects.toBeInstanceOf(ApiError)
  })

  it('refuses an unknown product', async () => {
    await expect(
      mockServices.bookings.create({
        ...(await bookingHeader()),
        items: [{ productId: 'P-does-not-exist', quantity: 1 }],
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('recalculates the total when lines are edited', async () => {
    const sellable = await mockServices.products.sellable()
    const egg = sellable.find((p) => p.kind === 'EGG')!

    const booking = await createBooking([{ productId: egg.id, quantity: 1 }])
    expect(booking.totalAmount).toBe(egg.currentPrice)

    const updated = await mockServices.bookings.update(booking.id, {
      ...(await bookingHeader()),
      items: [{ productId: egg.id, quantity: 4 }],
    })
    expect(updated.totalAmount).toBe(4 * egg.currentPrice!)
  })
})
