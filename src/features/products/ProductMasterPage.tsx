import { useState } from 'react'
import { PRODUCT_KIND_LABELS, type Product, type ProductKind } from '@/types/product'
import { PageHeader, Tabs } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { FilterBar, FilterField, PaginationFor, SearchBox } from '@/components/data-display/FilterBar'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/feedback/Modal'
import { InfoBanner } from '@/components/feedback/States'
import { Field, FormGrid } from '@/components/form/Field'
import { CurrencyInput, DateInput, Input, Textarea } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { Switch } from '@/components/form/Choice'
import { useToast } from '@/components/feedback/Toast'
import { Can } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatCurrency, formatDateTH, todayInput } from '@/utils/format'
import { fieldErrors, toUserMessage } from '@/utils/errors'
import {
  useProductList,
  useProductPrices,
  useProductUnits,
  useSavePrice,
  useSaveProduct,
  useSaveUnit,
  useSaveWarehouse,
  useWarehouses,
} from './hooks'
import type { ProductPrice, ProductUnit, Warehouse } from '@/types/product'

/**
 * ข้อมูลหลักสินค้า — product · productUnit · productPrice · warehouse.
 *
 * Documents read from here and never write a price of their own, so this is
 * the single place a price actually changes.
 */
const TABS = [
  { id: 'products', label: 'สินค้า' },
  { id: 'prices', label: 'ราคาสินค้า' },
  { id: 'units', label: 'หน่วยนับ' },
  { id: 'warehouses', label: 'คลังสินค้า' },
]

export function ProductMasterPage() {
  const [tab, setTab] = useState('products')

  return (
    <>
      <PageHeader
        title="ข้อมูลหลักสินค้า"
        subtitle="สินค้า หน่วยนับ ราคา และคลัง — เอกสารทุกใบดึงราคาจากที่นี่"
      >
        <Tabs active={tab} onChange={setTab} tabs={TABS} />
      </PageHeader>

      {tab === 'products' && <ProductsTab />}
      {tab === 'prices' && <PricesTab />}
      {tab === 'units' && <UnitsTab />}
      {tab === 'warehouses' && <WarehousesTab />}
    </>
  )
}

/* ── product ────────────────────────────────────────────────────────────── */

function ProductsTab() {
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'code',
    defaultSortDir: 'asc',
    extraKeys: ['kind'],
  })
  const { data, isPending, error, refetch } = useProductList(params)
  const [editing, setEditing] = useState<Product | null | undefined>(undefined)

  const columns: Column<Product>[] = [
    {
      key: 'code',
      header: 'รหัส',
      sortable: true,
      width: '9rem',
      cell: (p) => <span className="dash-num font-semibold text-forest">{p.code}</span>,
    },
    { key: 'name', header: 'ชื่อสินค้า', sortable: true, cell: (p) => p.name },
    {
      key: 'kind',
      header: 'ประเภท',
      hideBelow: 'md',
      cell: (p) => (
        <Badge tone={p.kind === 'EGG' ? 'active' : 'neutral'}>{PRODUCT_KIND_LABELS[p.kind]}</Badge>
      ),
    },
    { key: 'unitName', header: 'หน่วยนับ', hideBelow: 'md', cell: (p) => p.unitName },
    {
      key: 'warehouseName',
      header: 'คลัง',
      hideBelow: 'lg',
      cell: (p) => p.warehouseName ?? '—',
    },
    {
      key: 'currentPrice',
      header: 'ราคาปัจจุบัน',
      align: 'right',
      sortable: true,
      cell: (p) =>
        p.currentPrice == null ? (
          <Badge tone="warning" icon="alert">
            ยังไม่ตั้งราคา
          </Badge>
        ) : (
          <span className="font-bold">{formatCurrency(p.currentPrice)}</span>
        ),
    },
    {
      key: 'active',
      header: 'สถานะ',
      width: '7rem',
      cell: (p) =>
        p.active ? (
          <Badge tone="success" icon="check-circle">
            ใช้งาน
          </Badge>
        ) : (
          <Badge tone="neutral" icon="slash">
            ปิดใช้งาน
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '3.5rem',
      cell: (p) => (
        <Can permission="product:manage">
          <IconButton
            icon="edit"
            label={`แก้ไข ${p.name}`}
            variant="soft"
            size="sm"
            onClick={() => setEditing(p)}
          />
        </Can>
      ),
    },
  ]

  return (
    <>
      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="รหัส / ชื่อสินค้า"
          />
        </FilterField>
        <FilterField label="ประเภท" className="sm:w-52">
          <Select
            placeholder="ทุกประเภท"
            value={(params.kind as string) ?? ''}
            options={Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
            onChange={(e) => update({ kind: e.target.value })}
          />
        </FilterField>
        <Can permission="product:manage">
          <Button
            variant="green"
            iconLeft="plus"
            className="sm:ml-auto"
            onClick={() => setEditing(null)}
          >
            เพิ่มสินค้า
          </Button>
        </Can>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ไม่พบสินค้า"
        footer={
          <PaginationFor
            data={data}
            onPageChange={(page) => update({ page }, false)}
            onPageSizeChange={(pageSize) => update({ pageSize })}
          />
        }
      />

      {editing !== undefined && (
        <ProductModal product={editing} onClose={() => setEditing(undefined)} />
      )}
    </>
  )
}

function ProductModal({
  product,
  onClose,
}: Readonly<{ product: Product | null; onClose: () => void }>) {
  const toast = useToast()
  const save = useSaveProduct()
  const { data: units } = useProductUnits()
  const { data: warehouses } = useWarehouses()
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [form, setForm] = useState({
    code: product?.code ?? '',
    name: product?.name ?? '',
    kind: (product?.kind ?? 'SUPPLY') as ProductKind,
    unitId: product?.unitId ?? '',
    warehouseId: product?.warehouseId ?? '',
    description: product?.description ?? '',
    active: product?.active ?? true,
  })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({
        id: product?.id ?? null,
        payload: {
          ...form,
          warehouseId: form.warehouseId || undefined,
          breedId: product?.breedId,
          description: form.description || undefined,
        },
      })
      toast.success(product ? 'บันทึกสินค้าแล้ว' : 'เพิ่มสินค้าแล้ว', form.name)
      onClose()
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `แก้ไขสินค้า ${product.code}` : 'เพิ่มสินค้าใหม่'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            ยกเลิก
          </Button>
          <Button variant="green" iconLeft="check" loading={save.isPending} onClick={() => void submit()}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormGrid columns={2}>
          <Field label="รหัสสินค้า" required error={errors.code}>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="SUP-001" />
          </Field>
          <Field label="ชื่อสินค้า" required error={errors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="ประเภท" required>
            <Select
              value={form.kind}
              placeholder="เลือกประเภท"
              options={Object.entries(PRODUCT_KIND_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(e) => set('kind', e.target.value as ProductKind)}
            />
          </Field>
          <Field label="หน่วยนับ" required error={errors.unitId}>
            <Select
              value={form.unitId}
              placeholder="เลือกหน่วยนับ"
              options={(units ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }))}
              onChange={(e) => set('unitId', e.target.value)}
            />
          </Field>
          <Field label="คลังสินค้า">
            <Select
              value={form.warehouseId}
              placeholder="ไม่ระบุ"
              options={(warehouses ?? []).map((w) => ({ value: w.id, label: w.name }))}
              onChange={(e) => set('warehouseId', e.target.value)}
            />
          </Field>
        </FormGrid>

        <Field label="คำอธิบาย">
          <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} />
        </Field>

        <Switch
          label="เปิดใช้งาน"
          description="สินค้าที่ปิดใช้งานจะไม่ปรากฏในเอกสาร"
          checked={form.active}
          onChange={(v) => set('active', v)}
        />

        {!product && (
          <InfoBanner tone="info" icon="info">
            สินค้าใหม่จะยังไม่มีราคา ต้องไปตั้งราคาที่แท็บ &ldquo;ราคาสินค้า&rdquo; ก่อนจึงจะใช้ในใบจองได้
          </InfoBanner>
        )}
      </div>
    </Modal>
  )
}

/* ── productPrice ───────────────────────────────────────────────────────── */

function PricesTab() {
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'effectiveFrom',
    extraKeys: ['productId'],
  })
  const { data, isPending, error, refetch } = useProductPrices(params)
  const [open, setOpen] = useState(false)

  const columns: Column<ProductPrice>[] = [
    {
      key: 'productCode',
      header: 'สินค้า',
      cell: (p) => (
        <span>
          <span className="block font-semibold text-ink">{p.productName}</span>
          <span className="dash-num block text-[.74rem] text-ink-faint">{p.productCode}</span>
        </span>
      ),
    },
    { key: 'unitName', header: 'หน่วย', hideBelow: 'md', cell: (p) => p.unitName },
    {
      key: 'price',
      header: 'ราคา',
      align: 'right',
      sortable: true,
      cell: (p) => <span className="font-bold">{formatCurrency(p.price)}</span>,
    },
    {
      key: 'effectiveFrom',
      header: 'เริ่มใช้',
      align: 'right',
      sortable: true,
      cell: (p) => <span className="dash-num">{formatDateTH(p.effectiveFrom)}</span>,
    },
    {
      key: 'effectiveTo',
      header: 'สิ้นสุด',
      align: 'right',
      hideBelow: 'md',
      cell: (p) => <span className="dash-num">{p.effectiveTo ? formatDateTH(p.effectiveTo) : '—'}</span>,
    },
    {
      key: 'current',
      header: 'สถานะ',
      width: '9rem',
      cell: (p) =>
        p.current ? (
          <Badge tone="success" icon="check-circle">
            ใช้อยู่
          </Badge>
        ) : (
          <Badge tone="neutral" icon="history">
            ประวัติ
          </Badge>
        ),
    },
  ]

  return (
    <>
      <InfoBanner tone="warning" icon="lock" title="ราคาแก้ที่นี่ที่เดียว" className="mb-[18px]">
        เอกสารทุกใบดึงราคาจากรายการนี้และแก้ในเอกสารไม่ได้ การตั้งราคาใหม่จะปิดราคาเดิมไว้เป็นประวัติ
        ไม่ทับของเดิม เพื่อให้ตรวจย้อนหลังได้
      </InfoBanner>

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="รหัส / ชื่อสินค้า"
          />
        </FilterField>
        <Can permission="product:manage">
          <Button variant="green" iconLeft="plus" className="sm:ml-auto" onClick={() => setOpen(true)}>
            ตั้งราคาใหม่
          </Button>
        </Can>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(p) => p.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ยังไม่มีรายการราคา"
        footer={
          <PaginationFor
            data={data}
            onPageChange={(page) => update({ page }, false)}
            onPageSizeChange={(pageSize) => update({ pageSize })}
          />
        }
      />

      {open && <PriceModal onClose={() => setOpen(false)} />}
    </>
  )
}

function PriceModal({ onClose }: Readonly<{ onClose: () => void }>) {
  const toast = useToast()
  const save = useSavePrice()
  const { data: products } = useProductList({ pageSize: 200 })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState({
    productId: '',
    price: 0,
    effectiveFrom: todayInput(),
    note: '',
  })

  const selected = products?.items.find((p) => p.id === form.productId)

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({
        productId: form.productId,
        price: form.price,
        effectiveFrom: form.effectiveFrom,
        note: form.note || undefined,
      })
      toast.success('ตั้งราคาใหม่แล้ว', `${selected?.name} · ${formatCurrency(form.price)}`)
      onClose()
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="ตั้งราคาสินค้า"
      description="ราคาเดิมจะถูกปิดเป็นประวัติโดยอัตโนมัติ"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            ยกเลิก
          </Button>
          <Button
            variant="green"
            iconLeft="check"
            loading={save.isPending}
            disabled={!form.productId || form.price < 0}
            onClick={() => void submit()}
          >
            บันทึกราคา
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="สินค้า" required error={errors.productId}>
          <Select
            value={form.productId}
            placeholder="เลือกสินค้า"
            options={(products?.items ?? []).map((p) => ({
              value: p.id,
              label: `${p.name} (${p.unitName})`,
              description: p.code,
            }))}
            onChange={(e) => setForm((f) => ({ ...f, productId: e.target.value }))}
          />
        </Field>

        {selected && (
          <p className="flex items-center gap-1.5 text-[.8rem] text-ink-dim">
            <Icon name="info" size={13} />
            ราคาปัจจุบัน:{' '}
            <strong className="dash-num text-ink">
              {selected.currentPrice == null ? 'ยังไม่ตั้งราคา' : formatCurrency(selected.currentPrice)}
            </strong>
          </p>
        )}

        <FormGrid columns={2}>
          <Field label="ราคาใหม่" required error={errors.price}>
            <CurrencyInput
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
            />
          </Field>
          <Field label="เริ่มใช้วันที่" required>
            <DateInput
              value={form.effectiveFrom}
              onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))}
            />
          </Field>
        </FormGrid>

        <Field label="หมายเหตุ">
          <Textarea
            rows={2}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="เช่น ปรับตามต้นทุนฤดูกาล"
          />
        </Field>
      </div>
    </Modal>
  )
}

/* ── productUnit ────────────────────────────────────────────────────────── */

function UnitsTab() {
  const toast = useToast()
  const { data: units, isPending } = useProductUnits()
  const save = useSaveUnit()
  const { can } = useAuth()
  const [editing, setEditing] = useState<ProductUnit | null | undefined>(undefined)
  const [form, setForm] = useState({ code: '', name: '', active: true })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const openEditor = (unit: ProductUnit | null) => {
    setEditing(unit)
    setForm({ code: unit?.code ?? '', name: unit?.name ?? '', active: unit?.active ?? true })
    setErrors({})
  }

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({ id: editing?.id ?? null, payload: form })
      toast.success('บันทึกหน่วยนับแล้ว', form.name)
      setEditing(undefined)
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="หน่วยนับสินค้า"
          icon="archive"
          subtitle={`${units?.length ?? 0} หน่วย`}
          actions={
            <Can permission="product:manage">
              <Button variant="green" size="sm" iconLeft="plus" onClick={() => openEditor(null)}>
                เพิ่มหน่วยนับ
              </Button>
            </Can>
          }
        />
        <ul>
          {isPending && <li className="px-[22px] py-4 text-sm text-ink-faint">กำลังโหลด...</li>}
          {units?.map((unit) => (
            <li
              key={unit.id}
              className="flex items-center gap-3 border-b border-line-faint px-[22px] py-3 last:border-b-0"
            >
              <span className="dash-num w-20 shrink-0 font-semibold text-forest">{unit.code}</span>
              <span className="min-w-0 flex-1 text-[.9rem] text-ink">{unit.name}</span>
              {unit.active ? (
                <Badge tone="success" icon="check-circle">
                  ใช้งาน
                </Badge>
              ) : (
                <Badge tone="neutral" icon="slash">
                  ปิดใช้งาน
                </Badge>
              )}
              {can('product:manage') && (
                <IconButton
                  icon="edit"
                  label={`แก้ไข ${unit.name}`}
                  variant="soft"
                  size="sm"
                  onClick={() => openEditor(unit)}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>

      {editing !== undefined && (
        <Modal
          open
          onClose={() => setEditing(undefined)}
          title={editing ? `แก้ไขหน่วยนับ ${editing.code}` : 'เพิ่มหน่วยนับ'}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(undefined)} disabled={save.isPending}>
                ยกเลิก
              </Button>
              <Button variant="green" iconLeft="check" loading={save.isPending} onClick={() => void submit()}>
                บันทึก
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="รหัส" required error={errors.code}>
              <Input
                value={form.code}
                placeholder="BOX"
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </Field>
            <Field label="ชื่อหน่วย" required error={errors.name}>
              <Input
                value={form.name}
                placeholder="กล่อง"
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </Field>
            <Switch
              label="เปิดใช้งาน"
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>
        </Modal>
      )}
    </>
  )
}

/* ── warehouse ──────────────────────────────────────────────────────────── */

function WarehousesTab() {
  const toast = useToast()
  const { data: warehouses, isPending } = useWarehouses()
  const save = useSaveWarehouse()
  const { options: branchOptions } = useBranchOptions()
  const { can } = useAuth()
  const [editing, setEditing] = useState<Warehouse | null | undefined>(undefined)
  const [form, setForm] = useState({ code: '', name: '', branchId: '', active: true })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const openEditor = (warehouse: Warehouse | null) => {
    setEditing(warehouse)
    setForm({
      code: warehouse?.code ?? '',
      name: warehouse?.name ?? '',
      branchId: warehouse?.branchId ?? '',
      active: warehouse?.active ?? true,
    })
    setErrors({})
  }

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({ id: editing?.id ?? null, payload: form })
      toast.success('บันทึกคลังสินค้าแล้ว', form.name)
      setEditing(undefined)
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <Card>
        <CardHeader
          title="คลังสินค้า"
          icon="building"
          subtitle={`${warehouses?.length ?? 0} คลัง`}
          actions={
            <Can permission="product:manage">
              <Button variant="green" size="sm" iconLeft="plus" onClick={() => openEditor(null)}>
                เพิ่มคลัง
              </Button>
            </Can>
          }
        />
        <ul>
          {isPending && <li className="px-[22px] py-4 text-sm text-ink-faint">กำลังโหลด...</li>}
          {warehouses?.map((w) => (
            <li
              key={w.id}
              className="flex items-center gap-3 border-b border-line-faint px-[22px] py-3 last:border-b-0"
            >
              <span className="dash-num w-20 shrink-0 font-semibold text-forest">{w.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[.9rem] text-ink">{w.name}</span>
                <span className="block text-[.74rem] text-ink-faint">{w.branchName}</span>
              </span>
              {w.active ? (
                <Badge tone="success" icon="check-circle">
                  ใช้งาน
                </Badge>
              ) : (
                <Badge tone="neutral" icon="slash">
                  ปิดใช้งาน
                </Badge>
              )}
              {can('product:manage') && (
                <IconButton
                  icon="edit"
                  label={`แก้ไข ${w.name}`}
                  variant="soft"
                  size="sm"
                  onClick={() => openEditor(w)}
                />
              )}
            </li>
          ))}
        </ul>
      </Card>

      {editing !== undefined && (
        <Modal
          open
          onClose={() => setEditing(undefined)}
          title={editing ? `แก้ไขคลัง ${editing.code}` : 'เพิ่มคลังสินค้า'}
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setEditing(undefined)} disabled={save.isPending}>
                ยกเลิก
              </Button>
              <Button variant="green" iconLeft="check" loading={save.isPending} onClick={() => void submit()}>
                บันทึก
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Field label="รหัสคลัง" required error={errors.code}>
              <Input
                value={form.code}
                placeholder="WH01"
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              />
            </Field>
            <Field label="ชื่อคลัง" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="สาขา" required error={errors.branchId}>
              <Select
                value={form.branchId}
                placeholder="เลือกสาขา"
                options={branchOptions}
                onChange={(e) => setForm((f) => ({ ...f, branchId: e.target.value }))}
              />
            </Field>
            <Switch
              label="เปิดใช้งาน"
              checked={form.active}
              onChange={(v) => setForm((f) => ({ ...f, active: v }))}
            />
          </div>
        </Modal>
      )}
    </>
  )
}
