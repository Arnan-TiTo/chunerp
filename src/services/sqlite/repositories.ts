import type { Permission, Role, User } from '@/types/auth'
import type { AuditEntry, Attachment } from '@/types/common'
import type {
  BankMaster,
  BranchMaster,
  ExpenseCategoryMaster,
  ProjectMaster,
} from '@/types/master'
import type { Product, ProductPrice, ProductUnit, Warehouse } from '@/types/product'
import type { Booking, BookingItem, Expense, Farmer } from '@/types/domain'
import type { SystemSetting } from '@/services/api/contracts'
import { BRANCHES } from '@/constants'
import type { SqliteConnection } from './engine'

/**
 * Repositories for everything the system owns.
 *
 * Every table gets the same three things: a row shape, a loader that turns rows
 * back into domain objects, and a save that is an upsert. Reads happen once at
 * boot; writes go through here on every mutation, which is what makes a change
 * survive a reload — the permission grid was the first thing to prove it did
 * not.
 *
 * Money and quantities are stored as numbers, timestamps as ISO-8601, and
 * anything derivable (a line total, %เปลือกรัง, the effective price) is left
 * out and recomputed on read, so a corrected price can never leave stale money
 * behind in an old row.
 */

let conn: SqliteConnection | null = null

export function bindConnection(connection: SqliteConnection) {
  conn = connection
}

function db(): SqliteConnection {
  if (!conn) throw new Error('ChunERP database is not open')
  return conn
}

const flag = (value: number) => value === 1
const bit = (value: boolean | undefined) => (value ? 1 : 0)
const opt = <T>(value: T | null): T | undefined => value ?? undefined

/* ── Users and permissions ──────────────────────────────────────────────── */

interface UserRow {
  id: string
  username: string
  display_name: string
  email: string | null
  role: Role
  branch_id: string
  active: number
  default_work_type_id: string | null
}

/**
 * A user's rights come from `user_permission`, not from their role.
 *
 * The role only seeds the initial grant; once an administrator has adjusted
 * someone's access, that is the record, and re-deriving it from the role on
 * load would quietly undo their work.
 */
export function loadUsers(): User[] {
  const rows = db().all<UserRow>(`SELECT * FROM app_user ORDER BY id`)
  const grants = db().all<{ user_id: string; permission: Permission }>(
    `SELECT user_id, permission FROM user_permission`,
  )

  return rows.map((row) => ({
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    email: row.email ?? '',
    role: row.role,
    permissions: grants.filter((g) => g.user_id === row.id).map((g) => g.permission),
    branchId: row.branch_id,
    branches:
      row.role === 'ADMIN' || row.role === 'MANAGER'
        ? BRANCHES
        : BRANCHES.filter((b) => b.id === row.branch_id),
    defaultWorkTypeId: opt(row.default_work_type_id),
  }))
}

export function saveUser(user: User, at: string, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO app_user
       (id, username, display_name, email, role, branch_id, active, default_work_type_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       display_name = excluded.display_name,
       email = excluded.email,
       role = excluded.role,
       branch_id = excluded.branch_id,
       default_work_type_id = excluded.default_work_type_id,
       updated_at = excluded.updated_at`,
    [
      user.id,
      user.username,
      user.displayName,
      user.email || null,
      user.role,
      user.branchId,
      user.defaultWorkTypeId ?? null,
      at,
      at,
    ],
  )
  saveUserPermissions(user.id, user.permissions, target)
}

/** Replaces the whole grant, because that is what the permission grid submits. */
export function saveUserPermissions(
  userId: string,
  permissions: Permission[],
  target: SqliteConnection = db(),
) {
  target.run(`DELETE FROM user_permission WHERE user_id = ?`, [userId])
  for (const permission of permissions) {
    target.run(`INSERT INTO user_permission (user_id, permission) VALUES (?, ?)`, [
      userId,
      permission,
    ])
  }
}

export function saveRolePermissions(
  matrix: Record<Role, Permission[]>,
  target: SqliteConnection = db(),
) {
  for (const [role, permissions] of Object.entries(matrix)) {
    for (const permission of permissions) {
      target.run(
        `INSERT OR IGNORE INTO role_permission (role, permission) VALUES (?, ?)`,
        [role, permission],
      )
    }
  }
}

export function saveDefaultWorkType(userId: string, workTypeId: string, at: string) {
  db().run(`UPDATE app_user SET default_work_type_id = ?, updated_at = ? WHERE id = ?`, [
    workTypeId,
    at,
    userId,
  ])
}

/* ── General master data ────────────────────────────────────────────────── */

interface MasterRow {
  id: string
  code: string
  name: string
  address?: string | null
  phone?: string | null
  description?: string | null
  active: number
  updated_at: string
}

export function loadBranches(): BranchMaster[] {
  return db()
    .all<MasterRow>(`SELECT * FROM branch ORDER BY code`)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      address: opt(row.address ?? null),
      phone: opt(row.phone ?? null),
      active: flag(row.active),
      updatedAt: row.updated_at,
    }))
}

export function saveBranch(branch: BranchMaster, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO branch (id, code, name, address, phone, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, name = excluded.name, address = excluded.address,
       phone = excluded.phone, active = excluded.active, updated_at = excluded.updated_at`,
    [
      branch.id,
      branch.code,
      branch.name,
      branch.address ?? null,
      branch.phone ?? null,
      bit(branch.active),
      branch.updatedAt,
    ],
  )
}

export function loadProjects(): ProjectMaster[] {
  return db()
    .all<MasterRow>(`SELECT * FROM project ORDER BY code`)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: opt(row.description ?? null),
      active: flag(row.active),
      updatedAt: row.updated_at,
    }))
}

export function saveProject(project: ProjectMaster, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO project (id, code, name, description, active, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, name = excluded.name, description = excluded.description,
       active = excluded.active, updated_at = excluded.updated_at`,
    [
      project.id,
      project.code,
      project.name,
      project.description ?? null,
      bit(project.active),
      project.updatedAt,
    ],
  )
}

export function loadBanks(): BankMaster[] {
  return db()
    .all<MasterRow>(`SELECT * FROM bank ORDER BY code`)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      active: flag(row.active),
      updatedAt: row.updated_at,
    }))
}

export function saveBank(bank: BankMaster, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO bank (id, code, name, active, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, name = excluded.name,
       active = excluded.active, updated_at = excluded.updated_at`,
    [bank.id, bank.code, bank.name, bit(bank.active), bank.updatedAt],
  )
}

interface ExpenseTypeRow {
  id: string
  category_id: string
  name: string
  active: number
}

export function loadExpenseCategories(): ExpenseCategoryMaster[] {
  const categories = db().all<MasterRow>(`SELECT * FROM expense_category ORDER BY code`)
  const types = db().all<ExpenseTypeRow>(`SELECT * FROM expense_type ORDER BY id`)

  return categories.map((row) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    types: types
      .filter((t) => t.category_id === row.id)
      .map((t) => ({
        id: t.id,
        categoryId: t.category_id,
        name: t.name,
        active: flag(t.active),
      })),
    active: flag(row.active),
    updatedAt: row.updated_at,
  }))
}

export function saveExpenseCategory(
  category: ExpenseCategoryMaster,
  target: SqliteConnection = db(),
) {
  target.run(
    `INSERT INTO expense_category (id, code, name, active, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, name = excluded.name,
       active = excluded.active, updated_at = excluded.updated_at`,
    [category.id, category.code, category.name, bit(category.active), category.updatedAt],
  )

  // Sub-types are replaced wholesale: the editor submits the whole list, and a
  // type removed there has to disappear from the dropdown it feeds.
  target.run(`DELETE FROM expense_type WHERE category_id = ?`, [category.id])
  for (const type of category.types) {
    target.run(
      `INSERT INTO expense_type (id, category_id, name, active) VALUES (?, ?, ?, ?)`,
      [type.id, category.id, type.name, bit(type.active)],
    )
  }
}

/* ── Product master ─────────────────────────────────────────────────────── */

export function loadProductUnits(): ProductUnit[] {
  return db()
    .all<{ id: string; code: string; name: string; active: number }>(
      `SELECT * FROM product_unit ORDER BY code`,
    )
    .map((row) => ({ id: row.id, code: row.code, name: row.name, active: flag(row.active) }))
}

export function saveProductUnit(unit: ProductUnit, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO product_unit (id, code, name, active) VALUES (?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET code = excluded.code, name = excluded.name, active = excluded.active`,
    [unit.id, unit.code, unit.name, bit(unit.active)],
  )
}

export function loadWarehouses(): Warehouse[] {
  return db()
    .all<{ id: string; code: string; name: string; branch_id: string; active: number }>(
      `SELECT * FROM warehouse ORDER BY code`,
    )
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      branchId: row.branch_id,
      branchName: BRANCHES.find((b) => b.id === row.branch_id)?.name ?? '-',
      active: flag(row.active),
    }))
}

export function saveWarehouse(warehouse: Warehouse, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO warehouse (id, code, name, branch_id, active) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, name = excluded.name,
       branch_id = excluded.branch_id, active = excluded.active`,
    [warehouse.id, warehouse.code, warehouse.name, warehouse.branchId, bit(warehouse.active)],
  )
}

interface ProductRow {
  id: string
  code: string
  name: string
  kind: Product['kind']
  unit_id: string
  warehouse_id: string | null
  breed_id: string | null
  description: string | null
  active: number
  updated_at: string
}

/**
 * `currentPrice` is deliberately absent from the row: it is whichever
 * `product_price` is in effect today, so it is resolved on read and a price
 * correction takes effect everywhere at once.
 */
export function loadProducts(units: ProductUnit[], warehouses: Warehouse[]): Product[] {
  return db()
    .all<ProductRow>(`SELECT * FROM product ORDER BY code`)
    .map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      unitId: row.unit_id,
      unitName: units.find((u) => u.id === row.unit_id)?.name ?? '-',
      warehouseId: opt(row.warehouse_id),
      warehouseName: warehouses.find((w) => w.id === row.warehouse_id)?.name,
      currentPrice: null,
      breedId: opt(row.breed_id),
      description: opt(row.description),
      active: flag(row.active),
      updatedAt: row.updated_at,
    }))
}

export function saveProduct(product: Product, at: string, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO product
       (id, code, name, kind, unit_id, warehouse_id, breed_id, description, active,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, name = excluded.name, kind = excluded.kind,
       unit_id = excluded.unit_id, warehouse_id = excluded.warehouse_id,
       breed_id = excluded.breed_id, description = excluded.description,
       active = excluded.active, updated_at = excluded.updated_at`,
    [
      product.id,
      product.code,
      product.name,
      product.kind,
      product.unitId,
      product.warehouseId ?? null,
      product.breedId ?? null,
      product.description ?? null,
      bit(product.active),
      at,
      product.updatedAt,
    ],
  )
}

interface PriceRow {
  id: string
  product_id: string
  price: number
  effective_from: string
  effective_to: string | null
  note: string | null
  created_at: string
  created_by: string | null
}

/**
 * `current` and the product's display fields are not columns: whether a price
 * is the effective one depends on today's date, and the product's name belongs
 * to the product. Both are resolved on read.
 */
export function loadProductPrices(products: Product[], today: string): ProductPrice[] {
  return db()
    .all<PriceRow>(`SELECT * FROM product_price ORDER BY product_id, effective_from DESC`)
    .map((row) => {
      const product = products.find((p) => p.id === row.product_id)
      return {
        id: row.id,
        productId: row.product_id,
        productCode: product?.code ?? '-',
        productName: product?.name ?? '-',
        unitName: product?.unitName ?? '-',
        price: row.price,
        effectiveFrom: row.effective_from,
        effectiveTo: opt(row.effective_to),
        current:
          row.effective_from <= today && (row.effective_to == null || row.effective_to >= today),
        note: opt(row.note),
        updatedAt: row.created_at,
      }
    })
}

export function saveProductPrice(
  price: ProductPrice,
  createdBy?: string,
  target: SqliteConnection = db(),
) {
  target.run(
    `INSERT INTO product_price
       (id, product_id, price, effective_from, effective_to, note, created_at, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       price = excluded.price, effective_from = excluded.effective_from,
       effective_to = excluded.effective_to, note = excluded.note`,
    [
      price.id,
      price.productId,
      price.price,
      price.effectiveFrom,
      price.effectiveTo ?? null,
      price.note ?? null,
      price.updatedAt,
      createdBy ?? null,
    ],
  )
}

/* ── Farmers ────────────────────────────────────────────────────────────── */

interface FarmerRow {
  id: string
  code: string
  first_name: string
  last_name: string
  national_id: string | null
  phone: string | null
  address: string | null
  sub_district: string | null
  district: string | null
  province: string | null
  branch_id: string
  status: Farmer['status']
  joined_at: string
  program_jul_uam_jai: number
  program_debt_relief: number
  program_guaranteed_price: number
  created_at: string
  updated_at: string
}

/**
 * `outstandingDebt` and `totalPurchaseAmount` are not columns: they are the
 * debt ledger and the completed invoices added up. Storing them would give two
 * places for the same truth to live, and one of them would go stale.
 */
export function loadFarmers(): Farmer[] {
  return db()
    .all<FarmerRow>(`SELECT * FROM farmer ORDER BY code`)
    .map((row) => ({
      id: row.id,
      code: row.code,
      firstName: row.first_name,
      lastName: row.last_name,
      fullName: `${row.first_name} ${row.last_name}`,
      nationalId: opt(row.national_id),
      phone: opt(row.phone),
      address: opt(row.address),
      subDistrict: opt(row.sub_district),
      district: opt(row.district),
      province: opt(row.province),
      branchId: row.branch_id,
      branchName: BRANCHES.find((b) => b.id === row.branch_id)?.name ?? '-',
      status: row.status,
      joinedAt: row.joined_at,
      programs: {
        julUamJai: flag(row.program_jul_uam_jai),
        debtRelief: flag(row.program_debt_relief),
        guaranteedGoodPrice: flag(row.program_guaranteed_price),
      },
      outstandingDebt: 0,
      totalPurchaseAmount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }))
}

export function saveFarmer(farmer: Farmer, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO farmer
       (id, code, first_name, last_name, national_id, phone, address, sub_district,
        district, province, branch_id, status, joined_at, program_jul_uam_jai,
        program_debt_relief, program_guaranteed_price, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       code = excluded.code, first_name = excluded.first_name, last_name = excluded.last_name,
       national_id = excluded.national_id, phone = excluded.phone, address = excluded.address,
       sub_district = excluded.sub_district, district = excluded.district,
       province = excluded.province, branch_id = excluded.branch_id, status = excluded.status,
       program_jul_uam_jai = excluded.program_jul_uam_jai,
       program_debt_relief = excluded.program_debt_relief,
       program_guaranteed_price = excluded.program_guaranteed_price,
       updated_at = excluded.updated_at`,
    [
      farmer.id,
      farmer.code,
      farmer.firstName,
      farmer.lastName,
      farmer.nationalId ?? null,
      farmer.phone ?? null,
      farmer.address ?? null,
      farmer.subDistrict ?? null,
      farmer.district ?? null,
      farmer.province ?? null,
      farmer.branchId,
      farmer.status,
      farmer.joinedAt,
      bit(farmer.programs.julUamJai),
      bit(farmer.programs.debtRelief),
      bit(farmer.programs.guaranteedGoodPrice),
      farmer.createdAt,
      farmer.updatedAt,
    ],
  )
}

/* ── Bookings and deliveries ────────────────────────────────────────────── */

interface BookingRow {
  id: string
  booking_no: string
  booking_date: string
  farmer_id: string
  branch_id: string
  project_id: string | null
  batch_no: string
  hatch_date: string | null
  expected_delivery_date: string
  remark: string | null
  status: Booking['status']
  created_at: string
  updated_at: string
}

interface BookingItemRow {
  id: string
  booking_id: string
  line_no: number
  product_id: string
  quantity: number
  unit_price: number
}

interface DeliveryRow {
  booking_id: string
  delivered_at: string
  delivered_by: string
  delivered_by_name: string
  received_by: string | null
  debt_id: string
  remark: string | null
}

interface DeliveryItemRow {
  id: string
  booking_id: string
  booking_item_id: string
  product_name: string
  quantity: number
  unit_name: string
  unit_price: number
  amount: number
}

/**
 * Line totals and the document total are recomputed from quantity × unit_price
 * rather than read back, so a row can never disagree with its own arithmetic.
 */
export function loadBookings(
  farmers: Farmer[],
  products: Product[],
  projects: ProjectMaster[],
): Booking[] {
  const rows = db().all<BookingRow>(`SELECT * FROM booking ORDER BY booking_no`)
  const itemRows = db().all<BookingItemRow>(`SELECT * FROM booking_item ORDER BY booking_id, line_no`)
  const deliveries = db().all<DeliveryRow>(`SELECT * FROM booking_delivery`)
  const deliveryItems = db().all<DeliveryItemRow>(`SELECT * FROM delivery_item`)

  return rows.map((row) => {
    const farmer = farmers.find((f) => f.id === row.farmer_id)
    const items: BookingItem[] = itemRows
      .filter((item) => item.booking_id === row.id)
      .flatMap((item) => {
        const product = products.find((p) => p.id === item.product_id)
        if (!product) return []
        return [
          {
            id: item.id,
            productId: product.id,
            productCode: product.code,
            productName: product.name,
            kind: product.kind,
            quantity: item.quantity,
            unitId: product.unitId,
            unitName: product.unitName,
            unitPrice: item.unit_price,
            amount: Math.round(item.quantity * item.unit_price * 100) / 100,
          },
        ]
      })

    const eggs = items.filter((item) => item.kind === 'EGG')
    const firstEgg = eggs[0]
    const eggProduct = firstEgg ? products.find((p) => p.id === firstEgg.productId) : undefined
    const delivery = deliveries.find((d) => d.booking_id === row.id)

    return {
      id: row.id,
      bookingNo: row.booking_no,
      bookingDate: row.booking_date,
      farmerId: row.farmer_id,
      farmerName: farmer?.fullName ?? '-',
      farmerCode: farmer?.code ?? '-',
      branchId: row.branch_id,
      branchName: BRANCHES.find((b) => b.id === row.branch_id)?.name ?? '-',
      projectId: opt(row.project_id),
      projectName: projects.find((p) => p.id === row.project_id)?.name,
      batchNo: row.batch_no,
      hatchDate: opt(row.hatch_date),
      expectedDeliveryDate: row.expected_delivery_date,
      items,
      totalAmount: Math.round(items.reduce((sum, i) => sum + i.amount, 0) * 100) / 100,
      breedId: eggProduct?.breedId,
      breedName: firstEgg?.productName,
      quantity: Math.round(eggs.reduce((sum, i) => sum + i.quantity, 0) * 100) / 100,
      unit: firstEgg?.unitName ?? 'กล่อง',
      remark: opt(row.remark),
      attachments: [],
      delivery: delivery
        ? {
            deliveredAt: delivery.delivered_at,
            deliveredBy: delivery.delivered_by,
            deliveredByName: delivery.delivered_by_name,
            receivedBy: opt(delivery.received_by),
            items: deliveryItems
              .filter((item) => item.booking_id === row.id)
              .map((item) => ({
                bookingItemId: item.booking_item_id,
                productName: item.product_name,
                quantity: item.quantity,
                unitName: item.unit_name,
                unitPrice: item.unit_price,
                amount: item.amount,
              })),
            totalAmount: Math.round(
              deliveryItems
                .filter((item) => item.booking_id === row.id)
                .reduce((sum, item) => sum + item.amount, 0) * 100,
            ) / 100,
            debtId: delivery.debt_id,
            remark: opt(delivery.remark),
          }
        : undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

export function saveBooking(booking: Booking, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO booking
       (id, booking_no, booking_date, farmer_id, branch_id, project_id, batch_no,
        hatch_date, expected_delivery_date, remark, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       booking_date = excluded.booking_date, farmer_id = excluded.farmer_id,
       branch_id = excluded.branch_id, project_id = excluded.project_id,
       batch_no = excluded.batch_no, hatch_date = excluded.hatch_date,
       expected_delivery_date = excluded.expected_delivery_date,
       remark = excluded.remark, status = excluded.status, updated_at = excluded.updated_at`,
    [
      booking.id,
      booking.bookingNo,
      booking.bookingDate,
      booking.farmerId,
      booking.branchId,
      booking.projectId ?? null,
      booking.batchNo,
      booking.hatchDate ?? null,
      booking.expectedDeliveryDate,
      booking.remark ?? null,
      booking.status,
      booking.createdAt,
      booking.updatedAt,
    ],
  )

  // The document body is replaced wholesale — editing a booking submits the
  // whole line list, and a removed line has to be gone.
  target.run(`DELETE FROM booking_item WHERE booking_id = ?`, [booking.id])
  booking.items.forEach((item, i) => {
    target.run(
      `INSERT INTO booking_item (id, booking_id, line_no, product_id, quantity, unit_price)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [item.id, booking.id, i + 1, item.productId, item.quantity, item.unitPrice],
    )
  })

  if (booking.delivery) {
    const delivery = booking.delivery
    target.run(
      `INSERT INTO booking_delivery
         (booking_id, delivered_at, delivered_by, delivered_by_name, received_by, debt_id, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (booking_id) DO UPDATE SET
         delivered_at = excluded.delivered_at, delivered_by = excluded.delivered_by,
         delivered_by_name = excluded.delivered_by_name, received_by = excluded.received_by,
         debt_id = excluded.debt_id, remark = excluded.remark`,
      [
        booking.id,
        delivery.deliveredAt,
        delivery.deliveredBy,
        delivery.deliveredByName,
        delivery.receivedBy ?? null,
        delivery.debtId,
        delivery.remark ?? null,
      ],
    )

    target.run(`DELETE FROM delivery_item WHERE booking_id = ?`, [booking.id])
    delivery.items.forEach((item, i) => {
      target.run(
        `INSERT INTO delivery_item
           (id, booking_id, booking_item_id, product_name, quantity, unit_name, unit_price, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          `${booking.id}-D${i + 1}`,
          booking.id,
          item.bookingItemId,
          item.productName,
          item.quantity,
          item.unitName,
          item.unitPrice,
          item.amount,
        ],
      )
    })
  }
}

/* ── Expenses ───────────────────────────────────────────────────────────── */

interface ExpenseRow {
  id: string
  expense_no: string
  expense_date: string
  branch_id: string
  category_id: string
  expense_type_id: string | null
  description: string
  vendor: string | null
  reference_no: string | null
  quantity: number
  unit: string | null
  unit_price: number
  payment_method: Expense['paymentMethod']
  paid_date: string | null
  bank_name: string | null
  account_no: string | null
  transfer_date: string | null
  transfer_ref: string | null
  remark: string | null
  status: Expense['status']
  created_by: string
  created_by_name: string
  approved_by: string | null
  approved_by_name: string | null
  approved_at: string | null
  rejected_reason: string | null
  created_at: string
  updated_at: string
}

interface AttachmentRow {
  id: string
  expense_id: string
  file_name: string
  size_bytes: number
  mime_type: string
  url: string
  uploaded_at: string
  uploaded_by: string | null
}

export function loadExpenses(categories: ExpenseCategoryMaster[]): Expense[] {
  const rows = db().all<ExpenseRow>(`SELECT * FROM expense ORDER BY expense_date DESC`)
  const attachments = db().all<AttachmentRow>(`SELECT * FROM expense_attachment`)

  return rows.map((row) => {
    const category = categories.find((c) => c.id === row.category_id)
    return {
      id: row.id,
      expenseNo: row.expense_no,
      expenseDate: row.expense_date,
      branchId: row.branch_id,
      branchName: BRANCHES.find((b) => b.id === row.branch_id)?.name ?? '-',
      categoryId: row.category_id,
      categoryName: category?.name ?? '-',
      expenseTypeId: opt(row.expense_type_id),
      expenseTypeName: category?.types.find((t) => t.id === row.expense_type_id)?.name,
      description: row.description,
      vendor: opt(row.vendor),
      referenceNo: opt(row.reference_no),
      quantity: row.quantity,
      unit: opt(row.unit),
      unitPrice: row.unit_price,
      // §8.4 — the amount is the product of the two, never a stored third value.
      amount: Math.round(row.quantity * row.unit_price * 100) / 100,
      paymentMethod: row.payment_method,
      paidDate: opt(row.paid_date),
      bankName: opt(row.bank_name),
      accountNo: opt(row.account_no),
      transferDate: opt(row.transfer_date),
      transferRef: opt(row.transfer_ref),
      attachments: attachments
        .filter((a) => a.expense_id === row.id)
        .map<Attachment>((a) => ({
          id: a.id,
          fileName: a.file_name,
          size: a.size_bytes,
          mimeType: a.mime_type,
          url: a.url,
          uploadedAt: a.uploaded_at,
          uploadedBy: a.uploaded_by ?? '',
        })),
      remark: opt(row.remark),
      status: row.status,
      createdBy: row.created_by,
      createdByName: row.created_by_name,
      approvedBy: opt(row.approved_by),
      approvedByName: opt(row.approved_by_name),
      approvedAt: opt(row.approved_at),
      rejectedReason: opt(row.rejected_reason),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })
}

export function saveExpense(expense: Expense, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO expense
       (id, expense_no, expense_date, branch_id, category_id, expense_type_id, description,
        vendor, reference_no, quantity, unit, unit_price, payment_method, paid_date,
        bank_name, account_no, transfer_date, transfer_ref, remark, status,
        created_by, created_by_name, approved_by, approved_by_name, approved_at,
        rejected_reason, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       expense_date = excluded.expense_date, branch_id = excluded.branch_id,
       category_id = excluded.category_id, expense_type_id = excluded.expense_type_id,
       description = excluded.description, vendor = excluded.vendor,
       reference_no = excluded.reference_no, quantity = excluded.quantity,
       unit = excluded.unit, unit_price = excluded.unit_price,
       payment_method = excluded.payment_method, paid_date = excluded.paid_date,
       bank_name = excluded.bank_name, account_no = excluded.account_no,
       transfer_date = excluded.transfer_date, transfer_ref = excluded.transfer_ref,
       remark = excluded.remark, status = excluded.status,
       approved_by = excluded.approved_by, approved_by_name = excluded.approved_by_name,
       approved_at = excluded.approved_at, rejected_reason = excluded.rejected_reason,
       updated_at = excluded.updated_at`,
    [
      expense.id,
      expense.expenseNo,
      expense.expenseDate,
      expense.branchId,
      expense.categoryId,
      expense.expenseTypeId ?? null,
      expense.description,
      expense.vendor ?? null,
      expense.referenceNo ?? null,
      expense.quantity,
      expense.unit ?? null,
      expense.unitPrice,
      expense.paymentMethod,
      expense.paidDate ?? null,
      expense.bankName ?? null,
      expense.accountNo ?? null,
      expense.transferDate ?? null,
      expense.transferRef ?? null,
      expense.remark ?? null,
      expense.status,
      expense.createdBy,
      expense.createdByName,
      expense.approvedBy ?? null,
      expense.approvedByName ?? null,
      expense.approvedAt ?? null,
      expense.rejectedReason ?? null,
      expense.createdAt,
      expense.updatedAt,
    ],
  )

  target.run(`DELETE FROM expense_attachment WHERE expense_id = ?`, [expense.id])
  for (const file of expense.attachments) {
    target.run(
      `INSERT INTO expense_attachment
         (id, expense_id, file_name, size_bytes, mime_type, url, uploaded_at, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        file.id,
        expense.id,
        file.fileName,
        file.size,
        file.mimeType,
        file.url,
        file.uploadedAt,
        file.uploadedBy || null,
      ],
    )
  }
}

/* ── Audit trail ────────────────────────────────────────────────────────── */

interface AuditRow {
  id: string
  at: string
  actor_id: string
  actor_name: string
  action: string
  entity: string
  entity_id: string
  reference: string | null
  before_json: string | null
  after_json: string | null
}

const parseJson = (value: string | null): Record<string, unknown> | undefined => {
  if (!value) return undefined
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export function loadAuditEntries(): AuditEntry[] {
  return db()
    .all<AuditRow>(`SELECT * FROM audit_entry ORDER BY at DESC`)
    .map((row) => ({
      id: row.id,
      at: row.at,
      actorId: row.actor_id,
      actorName: row.actor_name,
      action: row.action,
      entity: row.entity,
      entityId: row.entity_id,
      reference: opt(row.reference),
      before: parseJson(row.before_json),
      after: parseJson(row.after_json),
    }))
}

export function saveAuditEntry(entry: AuditEntry, target: SqliteConnection = db()) {
  target.run(
    `INSERT OR REPLACE INTO audit_entry
       (id, at, actor_id, actor_name, action, entity, entity_id, reference, before_json, after_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.id,
      entry.at,
      entry.actorId,
      entry.actorName,
      entry.action,
      entry.entity,
      entry.entityId,
      entry.reference ?? null,
      entry.before ? JSON.stringify(entry.before) : null,
      entry.after ? JSON.stringify(entry.after) : null,
    ],
  )
}

/* ── Settings and counters ──────────────────────────────────────────────── */

interface SettingRow {
  key: string
  group_name: string
  label: string
  description: string | null
  value_type: SystemSetting['type']
  value: string
  options_json: string | null
  pending_confirmation: number
}

/** Values are stored as text and cast back by their declared type. */
function castSetting(row: SettingRow): SystemSetting['value'] {
  if (row.value_type === 'number') return Number(row.value)
  if (row.value_type === 'boolean') return row.value === 'true'
  return row.value
}

export function loadSettings(): SystemSetting[] {
  return db()
    .all<SettingRow>(`SELECT * FROM app_setting ORDER BY group_name, key`)
    .map((row) => ({
      key: row.key,
      group: row.group_name,
      label: row.label,
      description: opt(row.description),
      type: row.value_type,
      value: castSetting(row),
      options: row.options_json ? (JSON.parse(row.options_json) as SystemSetting['options']) : undefined,
      pendingConfirmation: flag(row.pending_confirmation) || undefined,
    }))
}

export function saveSetting(setting: SystemSetting, at: string, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO app_setting
       (key, group_name, label, description, value_type, value, options_json,
        pending_confirmation, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET
       value = excluded.value, label = excluded.label, description = excluded.description,
       pending_confirmation = excluded.pending_confirmation, updated_at = excluded.updated_at`,
    [
      setting.key,
      setting.group,
      setting.label,
      setting.description ?? null,
      setting.type,
      String(setting.value),
      setting.options ? JSON.stringify(setting.options) : null,
      bit(setting.pendingConfirmation),
      at,
    ],
  )
}

export function loadCounters(): Record<string, number> {
  return Object.fromEntries(
    db()
      .all<{ name: string; value: number }>(`SELECT * FROM document_counter`)
      .map((row) => [row.name, row.value]),
  )
}

export function saveCounter(name: string, value: number, target: SqliteConnection = db()) {
  target.run(
    `INSERT INTO document_counter (name, value) VALUES (?, ?)
     ON CONFLICT (name) DO UPDATE SET value = excluded.value`,
    [name, value],
  )
}
