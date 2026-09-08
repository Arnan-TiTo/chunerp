import { useMemo, useState } from 'react'
import { cn } from '@/utils/cn'
import type { Product } from '@/types/product'
import { PRODUCT_KIND_LABELS } from '@/types/product'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/StatusBadge'
import { Field } from '@/components/form/Field'
import { NumberInput } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { EmptyState, InfoBanner } from '@/components/feedback/States'
import { formatCurrency, formatNumber } from '@/utils/format'

export interface DraftLine {
  productId: string
  quantity: number
}

export interface ResolvedLine extends DraftLine {
  product: Product
  amount: number
}

/**
 * The booking document body: pick a product, type a quantity, press เพิ่ม.
 *
 * The unit and the unit price are shown but never editable — both come from
 * the product master. Changing what a farmer is charged means editing
 * `ProductPrice`, which keeps the price history auditable.
 */
export function BookingItemsEditor({
  lines,
  products,
  loading,
  readOnly,
  error,
  onChange,
}: Readonly<{
  lines: DraftLine[]
  products: Product[]
  loading?: boolean
  readOnly?: boolean
  error?: string
  onChange: (lines: DraftLine[]) => void
}>) {
  const [pickProductId, setPickProductId] = useState('')
  const [pickQty, setPickQty] = useState<number | ''>(1)

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const resolved: ResolvedLine[] = lines.flatMap((line) => {
    const product = byId.get(line.productId)
    if (!product || product.currentPrice == null) return []
    return [
      { ...line, product, amount: Math.round(line.quantity * product.currentPrice * 100) / 100 },
    ]
  })

  const total = resolved.reduce((sum, l) => sum + l.amount, 0)
  const picked = pickProductId ? byId.get(pickProductId) : undefined
  const alreadyAdded = lines.some((l) => l.productId === pickProductId)
  const qty = typeof pickQty === 'number' ? pickQty : 0

  const add = () => {
    if (!picked || qty <= 0 || alreadyAdded) return
    onChange([...lines, { productId: picked.id, quantity: qty }])
    setPickProductId('')
    setPickQty(1)
  }

  const remove = (productId: string) =>
    onChange(lines.filter((l) => l.productId !== productId))

  const setQuantity = (productId: string, quantity: number) =>
    onChange(lines.map((l) => (l.productId === productId ? { ...l, quantity } : l)))

  return (
    <div className="flex flex-col gap-4">
      {!readOnly && (
        <div className="rounded border border-line bg-sunken px-4 py-4">
          {/*
            No per-field hints in this row: a hint under one field only would
            push its control out of line with the others. The guidance lives in
            the summary line below, which is always rendered so the row height
            never shifts.
          */}
          <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
            <Field label="รายการ">
              <Select
                value={pickProductId}
                disabled={loading}
                placeholder={loading ? 'กำลังโหลดสินค้า...' : 'เลือกรายการ'}
                onChange={(e) => setPickProductId(e.target.value)}
                options={products.map((p) => ({
                  value: p.id,
                  label: `${p.name} (${p.unitName})`,
                  description: `${p.code} · ${PRODUCT_KIND_LABELS[p.kind]} · ${formatCurrency(p.currentPrice ?? 0)}`,
                  disabled: lines.some((l) => l.productId === p.id),
                }))}
              />
            </Field>
            <Field label="จำนวน">
              <NumberInput
                value={pickQty}
                step="0.5"
                min={0}
                unit={picked?.unitName}
                onChange={(e) =>
                  setPickQty(e.target.value === '' ? '' : Number(e.target.value))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
              />
            </Field>
            {/* Matches the 42px control height so all three line up exactly. */}
            <Button
              variant="green"
              iconLeft="plus"
              className="h-[42px]"
              disabled={!picked || qty <= 0 || alreadyAdded}
              onClick={add}
            >
              เพิ่ม
            </Button>
          </div>

          <p className="mt-2.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-4 gap-y-1 text-[.78rem] text-ink-dim">
            {picked ? (
              <>
                <span>
                  ราคาต่อหน่วย{' '}
                  <strong className="dash-num text-ink">
                    {formatCurrency(picked.currentPrice ?? 0)}
                  </strong>
                  <span className="ml-1 text-ink-faint">/ {picked.unitName}</span>
                </span>
                <span className="flex items-center gap-1 text-ink-faint">
                  <Icon name="lock" size={12} />
                  ราคามาจากข้อมูลหลัก แก้ที่ ตั้งราคาสินค้า
                </span>
                {alreadyAdded && (
                  <span className="font-semibold text-tan-dark">รายการนี้อยู่ในใบจองแล้ว</span>
                )}
              </>
            ) : (
              <span className="text-ink-faint">
                เลือกสินค้าจากข้อมูลหลัก — หน่วยและราคาต่อหน่วยจะถูกดึงมาอัตโนมัติ
              </span>
            )}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs font-semibold text-danger">
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded border border-line">
        {resolved.length === 0 ? (
          <EmptyState
            icon="archive"
            title="ยังไม่มีรายการในใบจอง"
            description={readOnly ? undefined : 'เลือกรายการ ใส่จำนวน แล้วกดปุ่ม เพิ่ม'}
          />
        ) : (
          <div className="app-scroll overflow-x-auto">
            <table className="w-full min-w-[42rem] border-collapse">
              <thead>
                <tr>
                  {['รายการ', 'จำนวน', 'หน่วย', 'ราคา', 'รวม', ''].map((h, i) => (
                    <th
                      key={h || `sp${i}`}
                      className={cn(
                        'border-b border-forest-dark bg-forest px-4 py-2.5 text-[.72rem] font-bold uppercase tracking-[.5px] text-white',
                        i >= 1 && i <= 4 ? 'text-right' : 'text-left',
                        i === 5 && 'w-12',
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resolved.map((line) => (
                  <tr key={line.productId} className="hover:bg-[#f8faf6]">
                    <td className="border-b border-line-faint px-4 py-2.5 text-[.86rem]">
                      <span className="block font-semibold text-ink">{line.product.name}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="dash-num text-[.72rem] text-ink-faint">
                          {line.product.code}
                        </span>
                        <Badge tone={line.product.kind === 'EGG' ? 'active' : 'neutral'}>
                          {PRODUCT_KIND_LABELS[line.product.kind]}
                        </Badge>
                      </span>
                    </td>
                    <td className="border-b border-line-faint px-4 py-2.5 text-right">
                      {readOnly ? (
                        <span className="dash-num text-[.86rem]">
                          {formatNumber(line.quantity, line.quantity % 1 === 0 ? 0 : 2)}
                        </span>
                      ) : (
                        <NumberInput
                          value={line.quantity}
                          step="0.5"
                          min={0}
                          aria-label={`จำนวนของ ${line.product.name}`}
                          className="h-9 w-28 text-right"
                          onChange={(e) => setQuantity(line.productId, Number(e.target.value))}
                        />
                      )}
                    </td>
                    <td className="border-b border-line-faint px-4 py-2.5 text-right text-[.86rem] text-ink-dim">
                      {line.product.unitName}
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2.5 text-right text-[.86rem] text-ink-dim">
                      {formatCurrency(line.product.currentPrice ?? 0)}
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2.5 text-right text-[.86rem] font-bold">
                      {formatCurrency(line.amount)}
                    </td>
                    <td className="border-b border-line-faint px-2 py-2.5 text-right">
                      {!readOnly && (
                        <IconButton
                          icon="trash"
                          label={`ลบ ${line.product.name}`}
                          variant="ghost"
                          size="sm"
                          className="text-danger hover:bg-danger-soft"
                          onClick={() => remove(line.productId)}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-line-faint">
                  <td colSpan={4} className="px-4 py-3 text-right text-[.86rem] font-bold">
                    ยอดรวมทั้งหมด
                  </td>
                  <td className="dash-num px-4 py-3 text-right text-[1.05rem] font-bold text-forest">
                    {formatCurrency(total)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <InfoBanner tone="warning" icon="coins" title="ยอดนี้จะถูกนำไปตั้งหนี้">
          ยอดรวม <strong className="dash-num">{formatCurrency(total)}</strong> คือจำนวนที่จะตั้งเป็นหนี้ของเกษตรกร
          เมื่อใบจองถูกยืนยัน — การตั้งหนี้จริงดำเนินการโดยระบบหลังบ้าน
        </InfoBanner>
      )}
    </div>
  )
}
