import type { ID } from './common'

/**
 * Product master.
 *
 * Bookings (and later, any other document that sells or issues goods) pick
 * from `Product` and take their unit price from `ProductPrice`. The price is
 * never typed into a document — changing what a farmer is charged means
 * editing the price list, which leaves an auditable trail.
 */

export type ProductKind = 'EGG' | 'SUPPLY' | 'CHEMICAL' | 'EQUIPMENT'

export const PRODUCT_KIND_LABELS: Record<ProductKind, string> = {
  EGG: 'ไข่ไหม / สายพันธุ์',
  SUPPLY: 'วัสดุการเลี้ยง',
  CHEMICAL: 'สารเคมี / น้ำยา',
  EQUIPMENT: 'อุปกรณ์',
}

/** productUnit — the unit of measure a product is counted in. */
export interface ProductUnit {
  id: ID
  code: string
  name: string
  active: boolean
}

/** warehouse — where stock of a product is held. */
export interface Warehouse {
  id: ID
  code: string
  name: string
  branchId: string
  branchName: string
  active: boolean
}

/** product — the catalogue entry itself. */
export interface Product {
  id: ID
  code: string
  name: string
  kind: ProductKind
  unitId: string
  unitName: string
  warehouseId?: string
  warehouseName?: string
  /**
   * Resolved from the effective `ProductPrice` row by the backend — null when
   * no price is currently in effect, which blocks the product from being added
   * to a document.
   */
  currentPrice: number | null
  /** Set for EGG products so the receiving slip can pre-fill สายพันธุ์. */
  breedId?: string
  description?: string
  active: boolean
  updatedAt: string
}

/** productPrice — a dated price list entry. */
export interface ProductPrice {
  id: ID
  productId: string
  productCode: string
  productName: string
  unitName: string
  price: number
  effectiveFrom: string
  effectiveTo?: string
  /** True when this row is the one currently in effect for its product. */
  current: boolean
  note?: string
  updatedAt: string
}
