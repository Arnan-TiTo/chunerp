import { useMemo, useState } from 'react'
import type { ExportBatch, ExportKind } from '@/types/domain'
import type { PendingExportRow } from '@/services/api/contracts'
import { COLUMNS, KIND_ENTRY, KIND_LABEL, columnGuide } from '@/services/accounting/bplus'
import { PageHeader, Tabs } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/StatusBadge'
import { Checkbox } from '@/components/form/Choice'
import { InfoBanner } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { formatCurrency, formatDateTH, formatDateTimeTH } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { useExportHistory, useExportToAccounting, usePendingExport } from './hooks'

/** เรียงตามลำดับที่เหตุการณ์เกิดจริง: ส่งของ → รับซื้อ → หักกลบ → จ่ายเงิน */
const KINDS: ExportKind[] = ['DEBT', 'PURCHASE', 'DEDUCTION', 'PAYMENT']

/**
 * ACC-001 — ส่งข้อมูลไปลงบัญชีที่ระบบ BPlus.
 *
 * Three files, one per accounting event: the receivable when the farmer takes
 * the eggs, the offset when their cocoons pay it back, and the voucher for the
 * cash that changes hands. Nothing is posted automatically — a file is cut,
 * accounting imports it, and the rows are stamped so the same document cannot
 * be posted twice.
 */
export function AccountingExportPage() {
  const toast = useToast()
  const [kind, setKind] = useState<ExportKind>('DEBT')
  const [selected, setSelected] = useState<Record<ExportKind, string[]>>({
    DEBT: [],
    PURCHASE: [],
    DEDUCTION: [],
    PAYMENT: [],
  })

  const { data: rows, isPending, error, refetch } = usePendingExport(kind)
  const { data: history } = useExportHistory()
  const exportMutation = useExportToAccounting()

  const ids = selected[kind]
  const setIds = (next: string[]) => setSelected((prev) => ({ ...prev, [kind]: next }))
  const toggle = (id: string) =>
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id])

  const pending = useMemo(() => rows ?? [], [rows])
  const allSelected = pending.length > 0 && ids.length === pending.length
  const selectedTotal = useMemo(
    () => pending.filter((r) => ids.includes(r.id)).reduce((sum, r) => sum + r.amount, 0),
    [pending, ids],
  )

  const columns: Column<PendingExportRow>[] = [
    {
      key: 'select',
      header: (
        <Checkbox
          label=""
          aria-label="เลือกทั้งหมด"
          checked={allSelected}
          onChange={() => setIds(allSelected ? [] : pending.map((r) => r.id))}
        />
      ),
      width: '3rem',
      cell: (row) => (
        <Checkbox
          label=""
          aria-label={`เลือก ${row.docNo}`}
          checked={ids.includes(row.id)}
          onChange={() => toggle(row.id)}
        />
      ),
    },
    {
      key: 'docNo',
      header: 'เลขที่เอกสาร',
      width: '12rem',
      cell: (row) => (
        <span>
          <span className="dash-num block font-semibold text-forest">{row.docNo}</span>
          {row.reference && (
            <span className="dash-num block text-[.76rem] text-ink-faint">{row.reference}</span>
          )}
        </span>
      ),
    },
    {
      key: 'docDate',
      header: 'วันที่',
      width: '8rem',
      hideBelow: 'sm',
      cell: (row) => <span className="dash-num">{formatDateTH(row.docDate)}</span>,
    },
    {
      key: 'farmerName',
      header: 'เกษตรกร',
      cell: (row) => (
        <span>
          <span className="block font-semibold text-ink">{row.farmerName}</span>
          <span className="dash-num block text-[.76rem] text-ink-faint">{row.farmerCode}</span>
        </span>
      ),
    },
    {
      key: 'batchNo',
      header: 'รอบ',
      width: '7rem',
      hideBelow: 'md',
      cell: (row) => <span className="dash-num">{row.batchNo}</span>,
    },
    {
      key: 'amount',
      header: 'จำนวนเงิน',
      align: 'right',
      cell: (row) => (
        <span className="font-semibold">{formatCurrency(row.amount, { digits: 2 })}</span>
      ),
    },
  ]

  const runExport = async () => {
    try {
      const result = await exportMutation.mutateAsync({ kind, ids })
      download(result.batch.fileName, result.content)
      setIds([])
      toast.success(
        `ส่งออกแล้ว ${result.batch.rowCount} รายการ`,
        `${result.batch.fileName} · ${formatCurrency(result.batch.totalAmount)}`,
      )
    } catch (err) {
      toast.error('ส่งออกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title="ส่งข้อมูลไประบบบัญชี BPlus"
        subtitle="ตั้งหนี้ · ซื้อรังไหมสด · ตัดหนี้ · จ่ายเงิน — ส่งออกเป็นไฟล์ CSV เพื่อนำเข้าระบบบัญชี"
        actions={
          <Button
            variant="primary"
            iconLeft="download"
            disabled={ids.length === 0}
            loading={exportMutation.isPending}
            onClick={() => void runExport()}
          >
            ส่งออก {ids.length > 0 ? `${ids.length} รายการ` : ''}
          </Button>
        }
      />

      <InfoBanner tone="info" icon="info" title={KIND_LABEL[kind]} className="mb-4">
        การลงบัญชีของไฟล์นี้คือ <strong>{KIND_ENTRY[kind]}</strong> ·
        รายการที่ส่งออกแล้วจะถูกประทับเลขที่ชุดและไม่ขึ้นในรายการนี้อีก
        เพื่อไม่ให้บัญชีตั้งรายการซ้ำ
      </InfoBanner>

      <Tabs
        className="mb-4"
        active={kind}
        onChange={(id) => setKind(id as ExportKind)}
        tabs={KINDS.map((k) => ({
          id: k,
          label: KIND_LABEL[k],
          count: k === kind ? pending.length : undefined,
        }))}
      />

      <DataTable
        columns={columns}
        rows={pending}
        rowKey={(row) => row.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(row) => toggle(row.id)}
        emptyTitle="ไม่มีรายการค้างส่งออก"
        emptyDescription="ทุกรายการของประเภทนี้ถูกส่งไประบบบัญชีแล้ว"
        footer={
          ids.length > 0 ? (
            <div className="flex items-center justify-between px-1 py-1 text-[.88rem]">
              <span className="text-ink-dim">เลือกไว้ {ids.length} รายการ</span>
              <span className="dash-num font-bold text-forest">
                รวม {formatCurrency(selectedTotal)}
              </span>
            </div>
          ) : undefined
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <ColumnGuide kind={kind} />
        <ExportHistory rows={history ?? []} />
      </div>

      <ReconciliationNote className="mt-4" />
    </>
  )
}

/* ── what the file contains ─────────────────────────────────────────────── */

/**
 * The column list is shown on screen because the import template differs
 * between BPlus installations. Accounting can read this, compare it with their
 * import screen, and say which heading needs renaming — the mapping then
 * changes in one file (`services/accounting/bplus.ts`).
 */
function ColumnGuide({ kind }: Readonly<{ kind: ExportKind }>) {
  return (
    <Card>
      <CardHeader
        title="คอลัมน์ในไฟล์"
        subtitle={`${COLUMNS[kind].length} คอลัมน์ · UTF-8 (BOM) · คั่นด้วยเครื่องหมายจุลภาค`}
        icon="file"
      />
      <div className="px-4 pb-4">
        <ul className="divide-y divide-line-soft">
          {columnGuide(kind).map((c) => (
            <li key={c.header} className="flex items-baseline gap-3 py-1.5">
              <span className="dash-num w-32 shrink-0 text-[.82rem] font-semibold text-ink">
                {c.header}
              </span>
              <span className="text-[.82rem] text-ink-dim">{c.note ?? '—'}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[.8rem] text-ink-faint">
          ชื่อคอลัมน์ชุดนี้ตั้งจากข้อมูลที่ระบบบัญชีต้องใช้เป็นอย่างน้อย
          หากเทมเพลตนำเข้าของ BPlus ที่ใช้จริงใช้ชื่ออื่น แจ้งชื่อคอลัมน์มาได้
          แก้ที่จุดเดียวแล้วทุกไฟล์เปลี่ยนตาม
        </p>
      </div>
    </Card>
  )
}

function ExportHistory({ rows }: Readonly<{ rows: ExportBatch[] }>) {
  return (
    <Card>
      <CardHeader title="ประวัติการส่งออก" subtitle="ใช้กระทบยอดกับฝ่ายบัญชี" icon="history" />
      <div className="px-4 pb-4">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[.86rem] text-ink-faint">ยังไม่เคยส่งออก</p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {rows.map((batch) => (
              <li key={batch.batchNo} className="flex items-center gap-3 py-2.5">
                <Icon name="download" size={16} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="dash-num block truncate text-[.84rem] font-semibold text-ink">
                    {batch.fileName}
                  </span>
                  <span className="block text-[.76rem] text-ink-faint">
                    {formatDateTimeTH(batch.exportedAt)} · {batch.exportedBy}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <Badge tone="neutral">{batch.rowCount} รายการ</Badge>
                  <span className="dash-num mt-1 block text-[.78rem] font-semibold text-ink">
                    {formatCurrency(batch.totalAmount, { digits: 0 })}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

/**
 * Hands the file to the browser.
 *
 * The content already carries the BOM Excel needs for Thai; adding another one
 * here would put a stray character in the first column heading.
 */
function download(fileName: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/* ── ทำไมตัวเลขถึงลงตัว ─────────────────────────────────────────────────── */

/**
 * The question every accountant asks first: if the farmer only receives the
 * difference, how can debit equal credit?
 *
 * Because the netting happens *inside* เจ้าหนี้-เกษตรกร, not inside any one
 * document. Each file is a balanced entry on its own; the payable account
 * collects all three and closes at zero. Spelling that out here is what stops
 * someone "helpfully" exporting the purchase at the net amount, which would
 * understate the raw material and strand the receivable forever.
 */
function ReconciliationNote({ className }: Readonly<{ className?: string }>) {
  const rows: { doc: string; debit: string; credit: string; kind?: ExportKind }[] = [
    { doc: '1. ตั้งหนี้', debit: 'ลูกหนี้การค้า-เกษตรกร  A', credit: 'รายได้ขายวัสดุการเลี้ยง  A', kind: 'DEBT' },
    { doc: '2. ซื้อรังไหมสด', debit: 'วัตถุดิบ-รังไหมสด  B', credit: 'เจ้าหนี้-เกษตรกร  B', kind: 'PURCHASE' },
    { doc: '3. หักกลบลบหนี้', debit: 'เจ้าหนี้-เกษตรกร  A', credit: 'ลูกหนี้การค้า-เกษตรกร  A', kind: 'DEDUCTION' },
    { doc: '4. จ่ายเงิน', debit: 'เจ้าหนี้-เกษตรกร  B−A', credit: 'เงินสด / ธนาคาร  B−A', kind: 'PAYMENT' },
  ]

  return (
    <Card className={className}>
      <CardHeader
        title="ทำไมเดบิตเท่ากับเครดิต"
        icon="scale"
        subtitle="A = ยอดตั้งหนี้ค่าไข่ไหม · B = รวมรายได้ตามใบรับซื้อ"
      />
      <div className="px-[22px] py-4">
        <div className="app-scroll overflow-x-auto">
          <table className="w-full min-w-[34rem] text-[.84rem]">
            <thead>
              <tr className="border-b border-line text-left text-[.74rem] uppercase tracking-[.3px] text-ink-dim">
                <th className="py-2 pr-3 font-semibold">เอกสาร</th>
                <th className="py-2 pr-3 font-semibold">เดบิต</th>
                <th className="py-2 font-semibold">เครดิต</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.doc} className="border-b border-line-faint last:border-b-0">
                  <td className="py-2 pr-3 font-semibold text-ink">{row.doc}</td>
                  <td className="dash-num py-2 pr-3 text-ink-dim">{row.debit}</td>
                  <td className="dash-num py-2 text-ink-dim">{row.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[.84rem] text-ink-dim">
          ทุกใบเดบิตเท่ากับเครดิตอยู่แล้ว ส่วนการลบ <strong>B − A</strong> ไม่ได้เกิดในใบใดใบหนึ่ง
          แต่เกิดในบัญชี <strong>เจ้าหนี้-เกษตรกร</strong> ซึ่งเป็นบัญชีพักที่ปิดตัวเองเมื่อจบรอบ:
          เครดิต B จากการซื้อ แล้วเดบิต A + (B−A) กลับไป เหลือศูนย์พอดี
          ส่วนลูกหนี้ก็ตั้ง A แล้วหักกลบ A เหลือศูนย์เช่นกัน
        </p>
        <p className="mt-2 text-[.84rem] text-danger">
          ห้ามส่งไฟล์ซื้อเป็นยอดสุทธิ (B−A) — ต้นทุนวัตถุดิบจะขาดไป A บาท
          และลูกหนี้ A จะค้างในระบบบัญชีตลอดไปเพราะไม่มีอะไรมาหักกลบ
        </p>
        <p className="mt-2 text-[.8rem] text-ink-faint">
          รายละเอียดพร้อมตัวอย่างตัวเลขจริงและบัญชีแยกประเภทอยู่ที่{' '}
          <code className="dash-num">docs/accounting-bplus.md</code> — ส่งให้ฝ่ายบัญชีได้เลย
        </p>
      </div>
    </Card>
  )
}
