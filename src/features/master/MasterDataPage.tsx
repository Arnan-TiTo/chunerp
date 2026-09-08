import { useState } from 'react'
import type { BankMaster, BranchMaster, ExpenseCategoryMaster, ProjectMaster } from '@/types/master'
import { PageHeader, Tabs } from '@/components/data-display/PageHeader'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/feedback/Modal'
import { InfoBanner, SkeletonText } from '@/components/feedback/States'
import { Field, FormGrid } from '@/components/form/Field'
import { Input, Textarea } from '@/components/form/Input'
import { Switch } from '@/components/form/Choice'
import { useToast } from '@/components/feedback/Toast'
import { Can } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { fieldErrors, toUserMessage } from '@/utils/errors'
import {
  useBankMaster,
  useBranchMaster,
  useExpenseCategoryMaster,
  useProjectMaster,
  useSaveBank,
  useSaveBranch,
  useSaveExpenseCategory,
  useSaveProject,
} from './hooks'

/**
 * ข้อมูลหลัก — the tables behind the app's dropdowns.
 *
 * Anything a user can pick from a list is edited here, so options are never
 * hard-coded in a screen. Workflow enums (สถานะ, วิธีชำระเงิน) stay in code
 * because changing them would change behaviour, not just labels.
 */
const TABS = [
  { id: 'branch', label: 'สาขา / จุดรับซื้อ' },
  { id: 'project', label: 'โครงการ' },
  { id: 'bank', label: 'ธนาคาร' },
  { id: 'expenseCategory', label: 'ประเภทค่าใช้จ่าย' },
]

export function MasterDataPage() {
  const [tab, setTab] = useState('branch')

  return (
    <>
      <PageHeader
        title="ข้อมูลหลัก"
        subtitle="ตารางที่อยู่เบื้องหลัง dropdown ทุกหน้าจอ — แก้ที่นี่แล้วมีผลทุกที่ทันที"
      >
        <Tabs active={tab} onChange={setTab} tabs={TABS} />
      </PageHeader>

      <InfoBanner tone="info" icon="info" className="mb-[18px]">
        รายการที่ปิดใช้งานจะไม่ปรากฏใน dropdown ของเอกสารใหม่ แต่เอกสารเดิมที่อ้างถึงยังแสดงได้ตามปกติ
      </InfoBanner>

      {tab === 'branch' && <BranchTab />}
      {tab === 'project' && <ProjectTab />}
      {tab === 'bank' && <BankTab />}
      {tab === 'expenseCategory' && <ExpenseCategoryTab />}
    </>
  )
}

/* ── Shared list chrome ─────────────────────────────────────────────────── */

function MasterList<T extends { id: string; code: string; name: string; active: boolean }>({
  title,
  icon,
  rows,
  loading,
  renderMeta,
  onAdd,
  onEdit,
  addLabel,
}: Readonly<{
  title: string
  icon: 'building' | 'shield' | 'wallet' | 'archive'
  rows: T[] | undefined
  loading: boolean
  renderMeta?: (row: T) => React.ReactNode
  onAdd: () => void
  onEdit: (row: T) => void
  addLabel: string
}>) {
  const { can } = useAuth()

  return (
    <Card>
      <CardHeader
        title={title}
        icon={icon}
        subtitle={`${rows?.length ?? 0} รายการ`}
        actions={
          <Can permission="product:manage">
            <Button variant="green" size="sm" iconLeft="plus" onClick={onAdd}>
              {addLabel}
            </Button>
          </Can>
        }
      />
      {loading ? (
        <div className="px-[22px] py-5">
          <SkeletonText lines={5} />
        </div>
      ) : (
        <ul>
          {rows?.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 border-b border-line-faint px-[22px] py-3 last:border-b-0"
            >
              <span className="dash-num w-24 shrink-0 font-semibold text-forest">{row.code}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[.9rem] text-ink">{row.name}</span>
                {renderMeta && (
                  <span className="block text-[.74rem] text-ink-faint">{renderMeta(row)}</span>
                )}
              </span>
              {row.active ? (
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
                  label={`แก้ไข ${row.name}`}
                  variant="soft"
                  size="sm"
                  onClick={() => onEdit(row)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function MasterModal({
  title,
  open,
  saving,
  onClose,
  onSubmit,
  children,
}: Readonly<{
  title: string
  open: boolean
  saving: boolean
  onClose: () => void
  onSubmit: () => void
  children: React.ReactNode
}>) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="green" iconLeft="check" loading={saving} onClick={onSubmit}>
            บันทึก
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">{children}</div>
    </Modal>
  )
}

/* ── branch ─────────────────────────────────────────────────────────────── */

function BranchTab() {
  const toast = useToast()
  const { data, isPending } = useBranchMaster(true)
  const save = useSaveBranch()
  const [editing, setEditing] = useState<BranchMaster | null | undefined>(undefined)
  const [form, setForm] = useState({ code: '', name: '', address: '', phone: '', active: true })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const open = (row: BranchMaster | null) => {
    setEditing(row)
    setForm({
      code: row?.code ?? '',
      name: row?.name ?? '',
      address: row?.address ?? '',
      phone: row?.phone ?? '',
      active: row?.active ?? true,
    })
    setErrors({})
  }

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({
        id: editing?.id ?? null,
        payload: { ...form, address: form.address || undefined, phone: form.phone || undefined },
      })
      toast.success('บันทึกสาขาแล้ว', form.name)
      setEditing(undefined)
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <MasterList
        title="สาขา / จุดรับซื้อ"
        icon="building"
        rows={data}
        loading={isPending}
        renderMeta={(b) => [b.address, b.phone].filter(Boolean).join(' · ') || '—'}
        addLabel="เพิ่มสาขา"
        onAdd={() => open(null)}
        onEdit={open}
      />
      {editing !== undefined && (
        <MasterModal
          open
          title={editing ? `แก้ไขสาขา ${editing.code}` : 'เพิ่มสาขา'}
          saving={save.isPending}
          onClose={() => setEditing(undefined)}
          onSubmit={() => void submit()}
        >
          <FormGrid columns={2}>
            <Field label="รหัสสาขา" required error={errors.code}>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </Field>
            <Field label="ชื่อสาขา" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
          </FormGrid>
          <Field label="ที่อยู่">
            <Textarea rows={2} value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
          </Field>
          <Field label="เบอร์โทร">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Switch label="เปิดใช้งาน" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        </MasterModal>
      )}
    </>
  )
}

/* ── project ────────────────────────────────────────────────────────────── */

function ProjectTab() {
  const toast = useToast()
  const { data, isPending } = useProjectMaster(true)
  const save = useSaveProject()
  const [editing, setEditing] = useState<ProjectMaster | null | undefined>(undefined)
  const [form, setForm] = useState({ code: '', name: '', description: '', active: true })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const open = (row: ProjectMaster | null) => {
    setEditing(row)
    setForm({
      code: row?.code ?? '',
      name: row?.name ?? '',
      description: row?.description ?? '',
      active: row?.active ?? true,
    })
    setErrors({})
  }

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({
        id: editing?.id ?? null,
        payload: { ...form, description: form.description || undefined },
      })
      toast.success('บันทึกโครงการแล้ว', form.name)
      setEditing(undefined)
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <MasterList
        title="โครงการ"
        icon="shield"
        rows={data}
        loading={isPending}
        renderMeta={(p) => p.description ?? '—'}
        addLabel="เพิ่มโครงการ"
        onAdd={() => open(null)}
        onEdit={open}
      />
      {editing !== undefined && (
        <MasterModal
          open
          title={editing ? `แก้ไขโครงการ ${editing.code}` : 'เพิ่มโครงการ'}
          saving={save.isPending}
          onClose={() => setEditing(undefined)}
          onSubmit={() => void submit()}
        >
          <FormGrid columns={2}>
            <Field label="รหัส" required error={errors.code}>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </Field>
            <Field label="ชื่อโครงการ" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
          </FormGrid>
          <Field label="รายละเอียด">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Switch label="เปิดใช้งาน" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        </MasterModal>
      )}
    </>
  )
}

/* ── bank ───────────────────────────────────────────────────────────────── */

function BankTab() {
  const toast = useToast()
  const { data, isPending } = useBankMaster(true)
  const save = useSaveBank()
  const [editing, setEditing] = useState<BankMaster | null | undefined>(undefined)
  const [form, setForm] = useState({ code: '', name: '', active: true })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const open = (row: BankMaster | null) => {
    setEditing(row)
    setForm({ code: row?.code ?? '', name: row?.name ?? '', active: row?.active ?? true })
    setErrors({})
  }

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({ id: editing?.id ?? null, payload: form })
      toast.success('บันทึกธนาคารแล้ว', form.name)
      setEditing(undefined)
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <MasterList
        title="ธนาคาร"
        icon="wallet"
        rows={data}
        loading={isPending}
        addLabel="เพิ่มธนาคาร"
        onAdd={() => open(null)}
        onEdit={open}
      />
      {editing !== undefined && (
        <MasterModal
          open
          title={editing ? `แก้ไขธนาคาร ${editing.code}` : 'เพิ่มธนาคาร'}
          saving={save.isPending}
          onClose={() => setEditing(undefined)}
          onSubmit={() => void submit()}
        >
          <Field label="รหัส" required error={errors.code}>
            <Input value={form.code} placeholder="BAAC" onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
          </Field>
          <Field label="ชื่อธนาคาร" required error={errors.name}>
            <Input value={form.name} placeholder="ธ.ก.ส." onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Switch label="เปิดใช้งาน" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        </MasterModal>
      )}
    </>
  )
}

/* ── expense category (with nested types) ───────────────────────────────── */

function ExpenseCategoryTab() {
  const toast = useToast()
  const { data, isPending } = useExpenseCategoryMaster(true)
  const save = useSaveExpenseCategory()
  const [editing, setEditing] = useState<ExpenseCategoryMaster | null | undefined>(undefined)
  const [form, setForm] = useState<{
    code: string
    name: string
    active: boolean
    types: { id?: string; name: string; active: boolean }[]
  }>({ code: '', name: '', active: true, types: [] })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const open = (row: ExpenseCategoryMaster | null) => {
    setEditing(row)
    setForm({
      code: row?.code ?? '',
      name: row?.name ?? '',
      active: row?.active ?? true,
      types: row?.types.map((t) => ({ id: t.id, name: t.name, active: t.active })) ?? [],
    })
    setErrors({})
  }

  const submit = async () => {
    setErrors({})
    try {
      await save.mutateAsync({
        id: editing?.id ?? null,
        payload: { ...form, types: form.types.filter((t) => t.name.trim()) },
      })
      toast.success('บันทึกประเภทค่าใช้จ่ายแล้ว', form.name)
      setEditing(undefined)
    } catch (err) {
      const details = fieldErrors(err)
      setErrors(details)
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <MasterList
        title="ประเภทค่าใช้จ่าย"
        icon="archive"
        rows={data}
        loading={isPending}
        renderMeta={(c) =>
          c.types.length > 0 ? `ประเภทย่อย: ${c.types.map((t) => t.name).join(', ')}` : 'ไม่มีประเภทย่อย'
        }
        addLabel="เพิ่มประเภท"
        onAdd={() => open(null)}
        onEdit={open}
      />
      {editing !== undefined && (
        <MasterModal
          open
          title={editing ? `แก้ไขประเภท ${editing.code}` : 'เพิ่มประเภทค่าใช้จ่าย'}
          saving={save.isPending}
          onClose={() => setEditing(undefined)}
          onSubmit={() => void submit()}
        >
          <FormGrid columns={2}>
            <Field label="รหัส" required error={errors.code}>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} />
            </Field>
            <Field label="ชื่อประเภท" required error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
          </FormGrid>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[.78rem] font-semibold uppercase tracking-[.2px] text-ink-dim">
                ประเภทย่อย
              </span>
              <button
                type="button"
                onClick={() =>
                  setForm((f) => ({ ...f, types: [...f.types, { name: '', active: true }] }))
                }
                className="flex items-center gap-1 text-[.78rem] font-semibold text-forest hover:underline"
              >
                <Icon name="plus" size={12} />
                เพิ่มประเภทย่อย
              </button>
            </div>
            <div className="flex flex-col gap-2">
              {form.types.length === 0 && (
                <p className="text-[.8rem] text-ink-faint">ยังไม่มีประเภทย่อย</p>
              )}
              {form.types.map((type, i) => (
                <div key={type.id ?? `new-${i}`} className="flex items-center gap-2">
                  <Input
                    value={type.name}
                    placeholder="ชื่อประเภทย่อย"
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        types: f.types.map((t, j) => (j === i ? { ...t, name: e.target.value } : t)),
                      }))
                    }
                  />
                  <IconButton
                    icon="trash"
                    label={`ลบ ${type.name || 'ประเภทย่อย'}`}
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() =>
                      setForm((f) => ({ ...f, types: f.types.filter((_, j) => j !== i) }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>

          <Switch label="เปิดใช้งาน" checked={form.active} onChange={(v) => setForm((f) => ({ ...f, active: v }))} />
        </MasterModal>
      )}
    </>
  )
}
