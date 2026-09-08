import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { QUEUE_STATUS } from '@/constants'
import type { PurchaseAnalysis } from '@/types/domain'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge, StatusBadge } from '@/components/ui/StatusBadge'
import { QrCode } from '@/components/ui/QrCode'
import { PageHeader, DescriptionList } from '@/components/data-display/PageHeader'
import { SummaryCard } from '@/components/data-display/KpiCard'
import { ErrorState, InfoBanner } from '@/components/feedback/States'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { useToast } from '@/components/feedback/Toast'
import { Can, FullPageLoader } from '@/features/auth/guards'
import {
  formatCurrency,
  formatDateTH,
  formatDateTimeTH,
  formatNumber,
  formatWeight,
} from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { useCompletePurchase, usePurchaseSummary, useTicket } from '@/features/receiving/hooks'

/**
 * PUR-001 — ใบรับซื้อรังไหมสด, a read-only calculation surface.
 *
 * Weights come from the two weigh slips, prices from the purchase price list,
 * and every derived figure — the รวมรายได้, the analysis block, the findings —
 * is produced by the backend (§7.8, §20). The page formats and nothing else.
 */
export function PurchaseSummaryPage() {
  const { queueId = '' } = useParams<{ queueId: string }>()
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: ticket, isPending: ticketPending, error: ticketError } = useTicket(queueId)
  const { data: summary, isPending, error, refetch } = usePurchaseSummary(queueId)
  const complete = useCompletePurchase(queueId)

  if (ticketPending || isPending) return <FullPageLoader label="กำลังโหลดใบรับซื้อ..." />
  if (ticketError) return <ErrorState error={ticketError} />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!ticket || !summary) return <ErrorState error={new Error('ไม่พบข้อมูลการรับซื้อ')} />

  const done = summary.status === 'COMPLETED'
  const totalWeight = summary.totalCocoonWeight + summary.totalScrapWeight

  const doComplete = async () => {
    try {
      await complete.mutateAsync()
      toast.success('ปิดรายการรับซื้อแล้ว', summary.transactionNo)
      setConfirmOpen(false)
    } catch (err) {
      toast.error('ปิดรายการไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={`ใบรับซื้อรังไหมสด · คิว ${ticket.queueNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="dash-num font-semibold text-forest">{summary.transactionNo}</span>
            <span>{summary.farmerName}</span>
            <StatusBadge status={QUEUE_STATUS[ticket.status]} />
          </span>
        }
        backTo={`/receiving/${queueId}/weighing`}
        breadcrumb={[
          { label: 'จุดชั่งน้ำหนัก', to: '/receiving/weighing' },
          { label: `คิว ${ticket.queueNo}` },
          { label: 'ใบรับซื้อรังไหมสด' },
        ]}
        actions={
          <>
            <LinkButton
              to={`/receiving/${queueId}/receipt?print=1`}
              target="_blank"
              variant="ghost"
              iconLeft="download"
            >
              พิมพ์ใบรับซื้อ
            </LinkButton>
            {done ? (
              <LinkButton to="/receiving/weighing" variant="ghost" iconLeft="arrow-left">
                กลับจุดชั่ง
              </LinkButton>
            ) : (
              <Can permission="purchase:complete">
                <Button variant="green" iconLeft="check-circle" onClick={() => setConfirmOpen(true)}>
                  ปิดรายการรับซื้อ
                </Button>
              </Can>
            )}
          </>
        }
      />

      {done && (
        <InfoBanner tone="success" icon="check-circle" className="mb-[18px]">
          ปิดรายการเมื่อ {formatDateTimeTH(summary.completedAt)} — เอกสารพร้อมส่งต่อฝ่ายบัญชี
        </InfoBanner>
      )}

      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="รวมน้ำหนัก" value={formatWeight(totalWeight)} emphasis />
        <SummaryCard
          label="น้ำหนักรัง / เศษ"
          value={`${formatNumber(summary.totalCocoonWeight, 2)} / ${formatNumber(summary.totalScrapWeight, 2)}`}
          hint="กิโลกรัม"
          emphasis
        />
        <SummaryCard
          label="รวมรายได้"
          value={formatCurrency(summary.grossAmount)}
          tone="info"
          emphasis
          hint="ยอดที่นำไปหักหนี้ได้"
        />
        <SummaryCard
          label="คงเหลือจ่าย"
          value={formatCurrency(summary.netPayable)}
          tone="success"
          emphasis
          hint={
            summary.deductionAmount > 0
              ? `หักหนี้แล้ว ${formatCurrency(summary.deductionAmount)}`
              : undefined
          }
        />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-12">
        <div className="flex flex-col gap-[18px] lg:col-span-8">
          <Card>
            <CardHeader
              title="รายการรับซื้อ"
              icon="coins"
              subtitle="น้ำหนักจากใบชั่ง · ราคาจากตารางราคารับซื้อ"
            />

            {/* Document header, as printed on the paper form. */}
            <div className="border-b border-line px-[22px] py-4">
              <DescriptionList
                columns={3}
                items={[
                  { label: 'ชื่อเกษตรกร', value: summary.farmerName },
                  {
                    label: 'รหัสเกษตรกร',
                    value: <span className="dash-num">{summary.farmerCode}</span>,
                  },
                  { label: 'สาขา', value: summary.branchName },
                  { label: 'สายพันธุ์', value: summary.breedName ?? '—' },
                  { label: 'รุ่น', value: summary.batchNo ?? '—' },
                  { label: 'รุ่นฟัก', value: formatDateTH(summary.hatchDate) },
                  {
                    label: 'จำนวนไข่ไหมที่จองไป',
                    value:
                      summary.boxes != null ? `${formatNumber(summary.boxes, 1)} กล่อง` : '—',
                  },
                  { label: 'วันที่รับซื้อ', value: formatDateTH(summary.purchaseDate) },
                  { label: 'ที่อยู่', value: summary.farmerAddress ?? '—' },
                ]}
              />
            </div>

            <div className="app-scroll overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse">
                <thead>
                  <tr>
                    {[
                      { label: 'รายการ', align: 'left' },
                      { label: 'น้ำหนักรัง (กก.)', align: 'right' },
                      { label: 'น้ำหนักเศษ (กก.)', align: 'right' },
                      { label: 'ราคารังไหม', align: 'right' },
                      { label: 'จำนวนเงิน', align: 'right' },
                    ].map((col) => (
                      <th
                        key={col.label}
                        className={`bg-forest px-[22px] py-[11px] text-[.72rem] font-bold uppercase tracking-[.5px] text-white ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        }`}
                      >
                        {col.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {summary.lines.map((line) => (
                    <tr key={line.key} className="hover:bg-[#f8faf6]">
                      <td className="border-b border-line-faint px-[22px] py-[13px] text-[.86rem] font-semibold">
                        {line.label}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem]">
                        {line.cocoonWeight != null ? formatNumber(line.cocoonWeight, 2) : '—'}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem]">
                        {line.scrapWeight != null ? formatNumber(line.scrapWeight, 2) : '—'}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem] text-ink-dim">
                        {line.unitPrice != null ? formatNumber(line.unitPrice, 2) : '—'}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem] font-semibold">
                        {line.amount != null ? formatCurrency(line.amount) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-line-faint">
                    <td className="px-[22px] py-3 text-[.86rem] font-bold">รวมน้ำหนัก</td>
                    <td className="dash-num px-[22px] py-3 text-right text-[.92rem] font-bold">
                      {formatNumber(summary.totalCocoonWeight, 2)}
                    </td>
                    <td className="dash-num px-[22px] py-3 text-right text-[.92rem] font-bold">
                      {formatNumber(summary.totalScrapWeight, 2)}
                    </td>
                    <td />
                    <td />
                  </tr>
                  <tr className="bg-line-faint">
                    <td colSpan={4} className="px-[22px] py-3.5 text-right text-[.86rem] font-bold">
                      รวมรายได้
                    </td>
                    <td className="dash-num px-[22px] py-3.5 text-right text-[1.05rem] font-bold text-forest">
                      {formatCurrency(summary.grossAmount)}
                    </td>
                  </tr>
                  {summary.deductionAmount > 0 && (
                    <>
                      <tr className="bg-line-faint">
                        <td colSpan={4} className="px-[22px] py-2.5 text-right text-[.86rem]">
                          หักตัดหนี้
                        </td>
                        <td className="dash-num px-[22px] py-2.5 text-right text-[.86rem] font-semibold text-danger">
                          −{formatCurrency(summary.deductionAmount)}
                        </td>
                      </tr>
                      <tr className="bg-line-faint">
                        <td
                          colSpan={4}
                          className="px-[22px] py-3.5 text-right text-[.86rem] font-bold"
                        >
                          คงเหลือจ่าย
                        </td>
                        <td className="dash-num px-[22px] py-3.5 text-right text-[1.05rem] font-bold text-sage">
                          {formatCurrency(summary.netPayable)}
                        </td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>
            </div>

            {summary.bonusPerKg != null && (
              <p className="border-t border-line px-[22px] py-3 text-[.78rem] text-ink-dim">
                * เกษตรกรจะได้รับเงินเพิ่มพิเศษอีก{' '}
                <strong className="dash-num text-ink">
                  {formatNumber(summary.bonusPerKg, 2)} บาท/กก.
                </strong>{' '}
                ภายในงวดบัญชี
              </p>
            )}

            <div className="px-[22px] pb-5 pt-4">
              <InfoBanner tone="info">
                ทุกตัวเลขในเอกสารนี้คำนวณและตรวจสอบโดยระบบหลังบ้าน หน้าจอนี้แสดงผลอย่างเดียว
              </InfoBanner>
            </div>
          </Card>

          <AnalysisCard analysis={summary.analysis} />
        </div>

        <div className="flex flex-col gap-[18px] lg:col-span-4">
          <Card>
            <CardHeader title="QR Code เอกสาร" icon="grid" subtitle="สำหรับบัญชีสแกนตรวจสอบเอกสาร" />
            <div className="flex flex-col items-center gap-2 px-[22px] py-5">
              <QrCode value={summary.documentCode} size={132} caption={summary.documentCode} />
              <p className="text-center text-[.75rem] leading-relaxed text-ink-faint">
                สแกน QR นี้เพื่อเรียกกระบวนการตรวจสอบเอกสารทั้งชุด
                <br />
                (ใบคิว · ใบชั่ง 2 ใบ · ใบรับซื้อ)
              </p>
            </div>
          </Card>

          {summary.debtPreview && (
            <Card>
              <CardHeader title="หนี้ของรอบนี้" icon="alert" iconClassName="bg-tan-soft text-tan" />
              <div className="flex flex-col gap-3 px-[22px] py-5">
                <SummaryCard
                  label={`หนี้คงค้าง รอบ ${summary.batchNo ?? '—'}`}
                  value={formatCurrency(summary.debtPreview.outstandingDebt)}
                  tone="danger"
                  emphasis
                />
                <SummaryCard
                  label="ตัดได้จากใบรับซื้อนี้"
                  value={formatCurrency(summary.debtPreview.eligibleDeduction)}
                  tone="warning"
                  emphasis
                  hint="ไม่เกินรวมรายได้ที่ยังไม่ถูกใช้"
                />
                <Can permission="debt:view">
                  <LinkButton
                    to={`/debts?search=${encodeURIComponent(summary.farmerCode)}`}
                    variant="ghost"
                    size="sm"
                    iconRight="arrow-right"
                    fullWidth
                  >
                    ไปหน้าตัดหนี้
                  </LinkButton>
                </Can>
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="เอกสารอ้างอิง" icon="archive" />
            <ul className="px-[22px] py-4">
              {summary.documents.map((doc) => (
                <li
                  key={doc.ref}
                  className="flex items-center justify-between gap-3 border-b border-line-faint py-2.5"
                >
                  <span className="flex items-center gap-2 text-[.86rem] text-ink">
                    <Icon name="file" size={15} className="text-ink-faint" />
                    {doc.label}
                  </span>
                  <Badge tone="info">{doc.ref}</Badge>
                </li>
              ))}
              <li className="flex items-center justify-between gap-3 py-2.5">
                <span className="flex items-center gap-2 text-[.86rem] text-ink">
                  <Icon name="scale" size={15} className="text-ink-faint" />
                  เปิดใบคิว (ผลคัดแยก)
                </span>
                <Link
                  to={`/receiving/sorting/${queueId}`}
                  className="text-[.8rem] font-semibold text-forest hover:underline"
                >
                  เปิดดู
                </Link>
              </li>
            </ul>
          </Card>

          <Card>
            <CardHeader title="ผู้ลงนาม" icon="users" />
            <div className="grid grid-cols-2 gap-4 px-[22px] py-6">
              {['ผู้รับซื้อ', 'เกษตรกร'].map((role) => (
                <div key={role} className="text-center">
                  <div className="mt-6 border-b border-dashed border-line-strong" />
                  <p className="mt-2 text-[.78rem] text-ink-dim">{role}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doComplete}
        title="ปิดรายการรับซื้อ"
        message={
          <>
            ยืนยันปิดรายการ <strong className="dash-num">{summary.transactionNo}</strong> ของ{' '}
            {summary.farmerName}?
            <br />
            รวมรายได้ <strong className="dash-num">{formatCurrency(summary.grossAmount)}</strong>
            <br />
            <span className="text-ink-faint">
              เมื่อปิดแล้วยอดนี้จะพร้อมนำไปหักหนี้ของรอบ {summary.batchNo ?? '—'}
            </span>
          </>
        }
        confirmLabel="ปิดรายการ"
        loading={complete.isPending}
      />
    </>
  )
}

/* ── ผลการตรวจสอบเอกสาร ─────────────────────────────────────────────────── */

function AnalysisCard({ analysis }: Readonly<{ analysis: PurchaseAnalysis }>) {
  const rows: { label: string; value: string }[] = [
    {
      label: 'จำนวนรังตัวอย่าง',
      value: analysis.sampleCocoonCount != null ? `${analysis.sampleCocoonCount} รัง` : '—',
    },
    {
      label: 'นน.รังรวม',
      value:
        analysis.sampleCocoonWeightG != null
          ? `${formatNumber(analysis.sampleCocoonWeightG, 2)} กรัม`
          : '—',
    },
    {
      label: 'นน.เปลือกรัง',
      value:
        analysis.shellWeightG != null ? `${formatNumber(analysis.shellWeightG, 2)} กรัม` : '—',
    },
    {
      label: '%เปลือกรัง',
      value: analysis.shellPercent != null ? `${formatNumber(analysis.shellPercent, 2)}%` : '—',
    },
    {
      label: '%ความชื้น',
      value:
        analysis.moisturePercent != null ? `${formatNumber(analysis.moisturePercent, 2)}%` : '—',
    },
    {
      label: '%เลี้ยงรอด',
      value:
        analysis.survivalPercent != null ? `${formatNumber(analysis.survivalPercent, 2)}%` : '—',
    },
    {
      label: 'น้ำหนัก/รัง',
      value:
        analysis.weightPerCocoonG != null
          ? `${formatNumber(analysis.weightPerCocoonG, 2)} กรัม`
          : '—',
    },
    {
      label: 'น้ำหนัก/กล่อง',
      value:
        analysis.weightPerBoxKg != null ? `${formatNumber(analysis.weightPerBoxKg, 2)} กก.` : '—',
    },
    {
      label: 'รายได้/กล่อง',
      value: analysis.incomePerBox != null ? formatCurrency(analysis.incomePerBox) : '—',
    },
  ]

  return (
    <Card>
      <CardHeader
        title="ผลการตรวจสอบเอกสาร"
        icon="chart"
        subtitle="วิเคราะห์โดยระบบหลังบ้านจากใบชั่งทั้ง 2 ใบ"
      />
      <div className="grid gap-3 px-[22px] py-5 sm:grid-cols-3">
        {rows.map((row) => (
          <SummaryCard key={row.label} label={row.label} value={row.value} />
        ))}
      </div>

      <div className="grid gap-4 border-t border-line px-[22px] py-5 md:grid-cols-2">
        <NoteList
          title="ปัญหาที่ตรวจพบ"
          icon="alert"
          tone="warning"
          items={analysis.findings}
        />
        <NoteList
          title="แนวทางแก้ไข"
          icon="check-circle"
          tone="success"
          items={analysis.recommendations}
        />
      </div>
    </Card>
  )
}

function NoteList({
  title,
  icon,
  tone,
  items,
}: Readonly<{
  title: string
  icon: 'alert' | 'check-circle'
  tone: 'warning' | 'success'
  items: string[]
}>) {
  return (
    <div>
      <p
        className={`mb-2 flex items-center gap-1.5 text-[.84rem] font-bold ${
          tone === 'warning' ? 'text-tan-dark' : 'text-meadow-deep'
        }`}
      >
        <Icon name={icon} size={15} />
        {title}
      </p>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item} className="flex gap-2 text-[.84rem] leading-relaxed text-ink-dim">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-faint" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  )
}
