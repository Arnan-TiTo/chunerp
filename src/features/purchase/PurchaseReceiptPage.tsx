import { useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { COMPANY_NAME } from '@/constants'
import type { PurchaseSummary } from '@/types/domain'
import { Button } from '@/components/ui/Button'
import { QrCode } from '@/components/ui/QrCode'
import { ErrorState } from '@/components/feedback/States'
import { FullPageLoader } from '@/features/auth/guards'
import { useFreshWeighSlip, usePurchaseSummary, useTicket } from '@/features/receiving/hooks'
import { formatDateTH, formatNumber } from '@/utils/format'

/**
 * PUR-002 — ใบรับซื้อรังไหมสด, the paper the farmer walks out with.
 *
 * The layout follows the company's printed form line for line, because that is
 * the document the promotion officers, the farmer and the accounting office
 * already read: the same column set, the same row wording, the วิเคราะห์ปัญหา
 * block under the table, the totals on the baseline, and four signatures.
 *
 * The QR code sits where the paper form carries one, and encodes the
 * transaction number so accounting can scan it to trigger the document check.
 *
 * It renders outside the app shell on purpose: a receipt printed with a
 * sidebar and a top bar around it is not a receipt.
 */
export function PurchaseReceiptPage() {
  const { queueId = '' } = useParams<{ queueId: string }>()
  const [params] = useSearchParams()
  const navigate = useNavigate()

  const { data: ticket, isPending: ticketPending, error: ticketError } = useTicket(queueId)
  const { data: summary, isPending, error, refetch } = usePurchaseSummary(queueId)
  // The weigher signs for the load, so their name belongs on the paper.
  const { data: fresh } = useFreshWeighSlip(queueId)

  const autoPrint = params.get('print') === '1'
  /** `?copies=1` prints the farmer's sheet only. */
  const singleCopy = params.get('copies') === '1'

  useEffect(() => {
    if (!autoPrint || !summary) return
    // One frame for the fonts and the barcode to paint, or the dialog captures
    // a half-drawn page.
    const timer = setTimeout(() => window.print(), 400)
    return () => clearTimeout(timer)
  }, [autoPrint, summary])

  if (ticketPending || isPending) return <FullPageLoader label="กำลังเตรียมใบรับซื้อ..." />
  if (ticketError) return <ErrorState error={ticketError} />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!ticket || !summary) return <ErrorState error={new Error('ไม่พบข้อมูลการรับซื้อ')} />

  return (
    <div className="min-h-screen bg-[#eceee9] py-6 print:bg-white print:py-0">
      {/* Screen-only toolbar — never printed. */}
      <div className="mx-auto mb-5 flex w-[210mm] max-w-[calc(100%-2rem)] flex-wrap items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-[.95rem] font-bold text-ink">ใบรับซื้อรังไหมสด</p>
          <p className="dash-num text-[.8rem] text-ink-dim">
            {summary.transactionNo} · คิว {ticket.queueNo} · {summary.farmerName}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" iconLeft="arrow-left" onClick={() => navigate(-1)}>
            กลับ
          </Button>
          <Button variant="primary" iconLeft="download" onClick={() => window.print()}>
            พิมพ์ใบรับซื้อ
          </Button>
        </div>
      </div>

      <ReceiptSheet
        summary={summary}
        weighedBy={fresh?.weighedBy}
        copy={singleCopy ? undefined : 'ORIGINAL'}
      />
      {!singleCopy && <ReceiptSheet summary={summary} weighedBy={fresh?.weighedBy} copy="COPY" />}
    </div>
  )
}

/* ── One printed sheet ──────────────────────────────────────────────────── */

function ReceiptSheet({
  summary,
  weighedBy,
  copy,
}: Readonly<{
  summary: PurchaseSummary
  weighedBy?: string
  copy?: 'ORIGINAL' | 'COPY'
}>) {
  const { analysis } = summary

  return (
    <section className="receipt-sheet mx-auto mb-5 flex min-h-[270mm] w-[210mm] max-w-[calc(100%-2rem)] flex-col bg-white px-[14mm] py-[12mm] text-[12px] leading-[1.5] text-black shadow-[0_2px_10px_rgba(0,0,0,.12)] print:mb-0 print:w-auto print:max-w-none print:px-0 print:py-0 print:shadow-none">
      {/* ── หัวกระดาษ ── */}
      <header className="grid grid-cols-[auto_1fr_auto] items-start gap-4">
        <div className="text-center">
          <QrCode value={summary.documentCode} size={74} caption={summary.documentCode} />
          <p className="text-[8.5px]">สแกนเพื่อตรวจสอบเอกสาร</p>
        </div>

        <div className="pt-1 text-center">
          <p className="text-[17px] font-bold leading-tight">{COMPANY_NAME}</p>
          <p className="mt-1.5 text-[16px] font-bold">ใบรับซื้อรังไหมสด</p>
        </div>

        <table className="text-[12px]">
          <tbody>
            <HeadCell label="วันที่" value={formatDateTH(summary.purchaseDate)} />
            <HeadCell label="รุ่นไหม" value={formatDateTH(summary.hatchDate)} />
            <HeadCell label="รหัส" value={summary.farmerCode} />
          </tbody>
        </table>
      </header>

      {copy && (
        <p className="mt-0.5 text-right text-[9px] tracking-[1px] text-black/60">
          {copy === 'ORIGINAL' ? 'ต้นฉบับ — เกษตรกร' : 'สำเนา — ฝ่ายบัญชี'}
        </p>
      )}

      {/* ── ชื่อ / ที่อยู่ ── */}
      <div className="mt-3 flex flex-col gap-1">
        <p className="flex gap-3">
          <span className="w-[3rem] shrink-0">ชื่อ</span>
          <span className="font-semibold">{summary.farmerName}</span>
        </p>
        <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <span className="flex gap-3">
            <span className="w-[3rem] shrink-0">ที่อยู่</span>
            <span>{summary.farmerAddress ?? '—'}</span>
          </span>
          <span className="ml-auto flex items-baseline gap-6">
            <span>{summary.breedName ?? '—'}</span>
            <span className="dash-num">
              {summary.boxes != null ? formatNumber(summary.boxes, 2) : '—'} กล่อง
            </span>
          </span>
        </p>
      </div>

      {/* ── รายการรับซื้อ ── */}
      <table className="mt-2.5 w-full border-collapse text-[12px]">
        <thead>
          <tr className="border-y border-black">
            <th className="py-1 text-left font-normal">รายการ</th>
            <th className="w-[16%] py-1 text-right font-normal">น้ำหนักรัง</th>
            <th className="w-[16%] py-1 text-right font-normal">น้ำหนักเศษ</th>
            <th className="w-[16%] py-1 text-right font-normal">ราคารังไหม*</th>
            <th className="w-[18%] py-1 text-right font-normal">จำนวนเงิน</th>
          </tr>
        </thead>
        <tbody>
          {summary.lines.map((line) => (
            <tr key={line.key}>
              <td className="py-[3px]">{line.label}</td>
              <td className="dash-num py-[3px] text-right">
                {line.cocoonWeight ? formatNumber(line.cocoonWeight, 2) : '-'}
              </td>
              <td className="dash-num py-[3px] text-right">
                {line.scrapWeight ? formatNumber(line.scrapWeight, 2) : '-'}
              </td>
              <td className="dash-num py-[3px] text-right">
                {line.unitPrice != null ? formatNumber(line.unitPrice, 2) : '-'}
              </td>
              <td className="dash-num py-[3px] text-right">
                {line.amount != null ? formatNumber(line.amount, 2) : '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── วิเคราะห์ปัญหาจากการเลี้ยงไหม ── */}
      <div className="mt-4 text-[11.5px]">
        <p className="text-center font-bold">
          *** วิเคราะห์ปัญหาจากการเลี้ยงไหม ***{' '}
          <span className="font-normal">
            (รายละเอียดเพิ่มเติม สามารถสอบถามได้ที่ เจ้าหน้าที่ส่งเสริมในพื้นที่)
          </span>
        </p>
        <p className="mt-1.5 flex gap-2">
          <span className="shrink-0">ปัญหา -</span>
          <span>{analysis.findings.join(' / ')}</span>
        </p>
        <div className="mt-0.5 flex gap-2">
          <span className="shrink-0">แก้ไขโดย -</span>
          <ol className="m-0 list-none p-0">
            {analysis.recommendations.map((item, i) => (
              <li key={item}>
                {i + 1}.{item}
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/*
        The form leaves the middle of the page open, and the totals sit on the
        baseline — so every sheet folds and files the same way regardless of how
        long the analysis text runs.
      */}
      <div className="grow" />

      {/* ── รวมน้ำหนัก / รวมรายได้ ── */}
      <table className="w-full border-collapse text-[12.5px]">
        <tbody>
          <tr className="border-y border-black">
            <td className="py-1.5 text-right">รวมน้ำหนัก</td>
            <td className="dash-num w-[16%] py-1.5 text-right">
              {formatNumber(summary.totalCocoonWeight, 2)}
            </td>
            <td className="dash-num w-[16%] py-1.5 text-right">
              {formatNumber(summary.totalScrapWeight, 2)}
            </td>
            <td className="w-[16%] py-1.5 text-right font-bold">รวมรายได้</td>
            <td className="dash-num w-[18%] py-1.5 text-right text-[14px] font-bold">
              {formatNumber(summary.grossAmount, 2)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── ค่าวิเคราะห์ตัวอย่าง ── */}
      <div className="mt-2 grid grid-cols-2 gap-x-10 border-b border-black pb-2 text-[12px]">
        <dl className="m-0">
          <Metric label="นน.รังรวม" value={analysis.sampleCocoonWeightG} unit="กรัม" />
          <Metric label="นน.เปลือกรัง" value={analysis.shellWeightG} unit="กรัม" />
          <Metric label="%เปลือกรัง" value={analysis.shellPercent} unit="%" />
          <Metric label="%ความชื้น" value={analysis.moisturePercent} unit="%" />
          <Metric label="จำนวนรังตัวอย่าง" value={analysis.sampleCocoonCount} unit="รัง" />
        </dl>
        <dl className="m-0">
          <Metric label="%เลี้ยงรอด" value={analysis.survivalPercent} unit="%" />
          <Metric label="น้ำหนัก/รัง" value={analysis.weightPerCocoonG} unit="กรัม" />
          <Metric label="น้ำหนัก/กล่อง" value={analysis.weightPerBoxKg} unit="ก.ก." />
          <Metric label="รายได้/กล่อง" value={analysis.incomePerBox} unit="บาท" />
        </dl>
      </div>

      {summary.bonusPerKg != null && (
        <p className="mt-1.5 text-[11px]">
          *ราคารังไหมนี้ ยังไม่รวมเงินเพิ่มพิเศษอีก ก.ก. ละ{' '}
          <span className="dash-num">{formatNumber(summary.bonusPerKg, 0)}</span> บาท
          ซึ่งบริษัทฯจะจ่ายให้เกษตรกรภายในรอบระยะเวลาบัญชีนี้
        </p>
      )}

      {/* ── ลายเซ็น ── */}
      <div className="mt-9 grid grid-cols-4 gap-4 text-center text-[11.5px]">
        {[
          weighedBy ? `ผู้บันทึก (${weighedBy})` : 'ผู้บันทึก',
          'ผู้ตรวจสอบ',
          'ผู้จ่ายเงิน',
          'ผู้รับเงิน',
        ].map((role) => (
          <div key={role}>
            <div className="mb-1 border-b border-black/70 pt-6" />
            <p>{role}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function HeadCell({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <tr>
      <td className="pr-4 align-top">{label}</td>
      <td className="dash-num whitespace-nowrap font-semibold">{value}</td>
    </tr>
  )
}

function Metric({
  label,
  value,
  unit,
}: Readonly<{ label: string; value: number | null; unit: string }>) {
  return (
    <div className="flex items-baseline gap-2 py-[1px]">
      <dt className="w-[9rem] shrink-0">{label}</dt>
      <dd className="dash-num m-0 w-[5.5rem] text-right font-semibold">
        {value != null ? formatNumber(value, 2) : '—'}
      </dd>
      <dd className="m-0">{unit}</dd>
    </div>
  )
}
