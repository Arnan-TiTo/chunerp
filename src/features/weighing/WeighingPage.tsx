import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/utils/cn'
import { COCOON_GRADES, COCOON_GRADE_LABELS, QUEUE_STATUS } from '@/constants'
import type { CocoonGrade, FreshWeighSlip, ShellWeighSlip } from '@/types/domain'
import { shellWeighSchema, type ShellWeighFormValues } from '@/schemas'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, IconButton, LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge, StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader, DescriptionList } from '@/components/data-display/PageHeader'
import { SummaryCard } from '@/components/data-display/KpiCard'
import { Field, FormGrid } from '@/components/form/Field'
import { NumberInput, Textarea } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { LockedNotice } from '@/components/form/Choice'
import { EmptyState, ErrorState, InfoBanner } from '@/components/feedback/States'
import { ConfirmDialog, Modal } from '@/components/feedback/Modal'
import { useToast } from '@/components/feedback/Toast'
import { Can, FullPageLoader } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { formatCurrency, formatDateTimeTH, formatNumber, formatWeight } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import {
  useCompletePurchase,
  useFreshWeighActions,
  useFreshWeighSlip,
  usePurchaseSummary,
  useShellWeighActions,
  useShellWeighSlip,
  useTicket,
} from '@/features/receiving/hooks'
import { getScaleAdapter, type ScaleReading } from './scaleAdapter'
import { FloorWeightImportCard } from './FloorWeightImportCard'

/**
 * WEIGH-001 — จุดชั่งน้ำหนัก, which issues two slips.
 *
 * The weighing itself happens in Floor Weight Cocoon, a separate system that
 * records every bag in its own database. This page pulls that slip in by
 * รหัสเกษตรกร + วันที่ชั่ง; manual entry stays only as a correction path for
 * when the link is down. Every subtotal, the รังไหม/เศษ split and %เปลือกรัง
 * come back from the server — this page adds nothing up itself (§7.6, §20).
 */
export function WeighingPage() {
  const { queueId = '' } = useParams<{ queueId: string }>()
  const navigate = useNavigate()
  const { can } = useAuth()

  const toast = useToast()
  const { data: ticket, isPending: ticketPending, error: ticketError } = useTicket(queueId)
  const { data: fresh, isPending, error, refetch } = useFreshWeighSlip(queueId)
  const { data: shell } = useShellWeighSlip(queueId)
  // The counter closes the purchase from here, so the invoice it is about to
  // close has to be on screen — the amount is what they read out to the farmer.
  const { data: summary } = usePurchaseSummary(queueId)
  const complete = useCompletePurchase(queueId)
  const [completeOpen, setCompleteOpen] = useState(false)

  if (ticketPending || isPending) return <FullPageLoader label="กำลังโหลดข้อมูลการชั่ง..." />
  if (ticketError) return <ErrorState error={ticketError} />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!ticket || !fresh) return <ErrorState error={new Error('ไม่พบคิว')} />

  const totalWeight = fresh.totalCocoonWeight + fresh.totalScrapWeight
  const done = ticket.status === 'COMPLETED'

  const doComplete = async () => {
    try {
      await complete.mutateAsync()
      toast.success(
        'ปิดรายการรับซื้อแล้ว',
        `${summary?.transactionNo ?? ''} — ส่งยอดไปรอตัดหนี้และเบิกจ่ายแล้ว`,
      )
      setCompleteOpen(false)
    } catch (err) {
      toast.error('ปิดรายการไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={`ชั่งน้ำหนัก · คิว ${ticket.queueNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{ticket.farmerName}</span>
            <span className="dash-num text-ink-faint">{ticket.farmerCode}</span>
            <StatusBadge status={QUEUE_STATUS[ticket.status]} />
          </span>
        }
        backTo="/receiving/weighing"
        breadcrumb={[
          { label: 'จุดชั่งน้ำหนัก', to: '/receiving/weighing' },
          { label: `คิว ${ticket.queueNo}` },
          { label: 'ชั่งน้ำหนัก' },
        ]}
        actions={
          fresh.locked && (
            <>
              <LinkButton
                to={`/receiving/${queueId}/summary`}
                variant="ghost"
                iconLeft="file"
              >
                ดูใบรับซื้อ
              </LinkButton>
              <Can permission="purchase:view">
                <LinkButton
                  to={`/receiving/${queueId}/receipt?print=1`}
                  target="_blank"
                  variant={done ? 'primary' : 'ghost'}
                  iconLeft="download"
                >
                  พิมพ์ใบรับซื้อ
                </LinkButton>
              </Can>
              {/* ปิดรายการคือขั้นที่ทำให้ยอดไปโผล่ที่ตัดหนี้และเบิกจ่าย
                  เดิมอยู่แต่ในหน้าใบรับซื้อ ซึ่งจุดชั่งไม่ได้เปิด */}
              {!done && (
                <Can permission="purchase:complete">
                  <Button
                    variant="green"
                    iconLeft="check-circle"
                    onClick={() => setCompleteOpen(true)}
                  >
                    ปิดรายการรับซื้อ
                  </Button>
                </Can>
              )}
            </>
          )
        }
      />

      {fresh.locked && !done && (
        <InfoBanner
          tone="warning"
          icon="alert"
          title="ล็อกน้ำหนักแล้ว — เหลือปิดรายการรับซื้อ"
          className="mb-[18px]"
        >
          พิมพ์ใบรับซื้อให้เกษตรกร แล้วกด <strong>ปิดรายการรับซื้อ</strong> เพื่อส่งยอด
          {summary?.grossAmount ? ` ${formatCurrency(summary.grossAmount)} ` : ' '}
          ไปรอตัดหนี้และเบิกจ่ายของรอบนี้ — ถ้ายังไม่กด ยอดจะค้างอยู่ที่จุดชั่ง
          ฝ่ายบัญชีจะยังตัดหนี้และจ่ายเงินให้เกษตรกรไม่ได้
        </InfoBanner>
      )}

      {done && (
        <InfoBanner
          tone="success"
          icon="check-circle"
          title="ปิดรายการรับซื้อแล้ว — ส่งไปรอตัดหนี้และเบิกจ่าย"
          className="mb-[18px]"
        >
          มอบใบรับซื้อรังไหมสดให้เกษตรกรนำไปติดต่อฝ่ายบัญชี — ระบบพิมพ์ 2 ชุด:
          ต้นฉบับสำหรับเกษตรกร และสำเนาสำหรับฝ่ายบัญชี
        </InfoBanner>
      )}

      <ConfirmDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => void doComplete()}
        loading={complete.isPending}
        title="ปิดรายการรับซื้อ"
        icon="check-circle"
        confirmLabel="ปิดรายการ"
        message={
          <span>
            ปิดใบรับซื้อ{' '}
            <strong className="dash-num">{summary?.transactionNo ?? ''}</strong> ของ{' '}
            <strong>{ticket.farmerName}</strong>
            {summary?.grossAmount ? (
              <>
                {' '}
                รวมรายได้ <strong>{formatCurrency(summary.grossAmount)}</strong>
              </>
            ) : null}
            <br />
            ยอดนี้จะถูกส่งไปรอตัดหนี้ของรอบนี้และตั้งรายการจ่ายเงินให้เกษตรกร
            หลังจากนี้แก้ไขน้ำหนักไม่ได้
          </span>
        }
      />

      <div className="grid gap-[18px] lg:grid-cols-12">
        <div className="flex flex-col gap-[18px] lg:col-span-8">
          <FloorWeightImportCard
            ticket={ticket}
            disabled={fresh.locked && !can('weighing:override')}
          />
          <FreshWeighCard
            queueId={queueId}
            slip={fresh}
            onLocked={() => navigate(`/receiving/${queueId}/summary`)}
          />
          <ShellWeighCard queueId={queueId} slip={shell} />
        </div>

        <div className="flex flex-col gap-[18px] lg:col-span-4">
          <Card>
            <CardHeader title="รวมน้ำหนัก" icon="scale" />
            <div className="px-[22px] py-6 text-center">
              <p className="dash-num text-[2.8rem] font-bold leading-none text-forest">
                {formatNumber(totalWeight, 2)}
              </p>
              <p className="mt-1 text-[.82rem] text-ink-dim">กิโลกรัม (รวมโดยระบบหลังบ้าน)</p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <SummaryCard label="น้ำหนักรัง" value={formatWeight(fresh.totalCocoonWeight)} />
                <SummaryCard label="น้ำหนักเศษ" value={formatWeight(fresh.totalScrapWeight)} />
                <SummaryCard label="จำนวนถุง" value={`${fresh.lines.length} ถุง`} />
                <SummaryCard
                  label="เฉลี่ย/กล่อง"
                  value={
                    fresh.avgWeightPerBox != null ? formatWeight(fresh.avgWeightPerBox) : '—'
                  }
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="ข้อมูลคิว" icon="user" />
            <div className="px-[22px] py-5">
              <DescriptionList
                columns={1}
                items={[
                  { label: 'เกษตรกร', value: ticket.farmerName },
                  { label: 'รหัส', value: <span className="dash-num">{ticket.farmerCode}</span> },
                  { label: 'ใบจอง', value: ticket.bookingNo ?? '—' },
                  { label: 'สายพันธุ์', value: ticket.breedName ?? '—' },
                  {
                    label: 'จำนวนที่จองไป',
                    value:
                      ticket.expectedBoxes != null
                        ? `${formatNumber(ticket.expectedBoxes, 1)} กล่อง`
                        : '—',
                  },
                  {
                    label: 'แบ่งไหมจาก',
                    value:
                      ticket.splitFromBoxes != null
                        ? `${formatNumber(ticket.splitFromBoxes, 1)} กล่อง`
                        : '—',
                  },
                  { label: 'ผู้ชั่ง', value: fresh.weighedBy ?? '—' },
                ]}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

/* ── Slip 1: ใบชั่งน้ำหนักรังไหมสด ──────────────────────────────────────── */

const GRADE_OPTIONS = COCOON_GRADES.map(({ grade, label, column }) => ({
  value: grade,
  label,
  description: column === 'COCOON' ? 'คิดเป็นน้ำหนักรัง' : 'คิดเป็นน้ำหนักเศษ',
}))

function FreshWeighCard({
  queueId,
  slip,
  onLocked,
}: Readonly<{ queueId: string; slip: FreshWeighSlip; onLocked: () => void }>) {
  const toast = useToast()
  const { can } = useAuth()
  const { addBag, removeBag, lock, unlock } = useFreshWeighActions(queueId)

  const [grade, setGrade] = useState<CocoonGrade>('GOOD')
  const [weight, setWeight] = useState<number | ''>('')
  const [confirmLock, setConfirmLock] = useState(false)
  const [scaleOpen, setScaleOpen] = useState(false)

  const canOverride = can('weighing:override')
  const readOnly = slip.locked && !canOverride
  const weightValue = typeof weight === 'number' ? weight : 0

  const add = async (source: 'MANUAL' | 'SCALE' = 'MANUAL') => {
    if (weightValue <= 0) return
    try {
      const saved = await addBag.mutateAsync({ grade, weightKg: weightValue, source })
      toast.success(
        `บันทึกถุงที่ ${saved.lines.length}`,
        `${COCOON_GRADE_LABELS[grade]} ${formatWeight(weightValue)}`,
      )
      setWeight('')
    } catch (err) {
      toast.error('บันทึกน้ำหนักถุงไม่สำเร็จ', toUserMessage(err))
    }
  }

  const doLock = async () => {
    try {
      await lock.mutateAsync()
      toast.success('ล็อกใบชั่งน้ำหนักแล้ว', 'ไปยังใบรับซื้อรังไหมสด')
      setConfirmLock(false)
      onLocked()
    } catch (err) {
      toast.error('ล็อกใบชั่งไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader
        title="ใบชั่งน้ำหนักรังไหมสด"
        icon="scale"
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="dash-num">{slip.slipNo}</span>
            <Badge tone={slip.source === 'SCALE' ? 'active' : 'neutral'}>
              {slip.source === 'SCALE' ? 'ดึงจากระบบชั่ง' : 'คีย์เอง'}
            </Badge>
          </span>
        }
        actions={
          !readOnly && (
            <Button variant="ghost" iconLeft="scale" onClick={() => setScaleOpen(true)}>
              อ่านค่าจากเครื่องชั่ง
            </Button>
          )
        }
      />
      <div className="px-[22px] py-5">
        {slip.locked && (
          <LockedNotice>
            ใบชั่งถูกล็อกแล้วเมื่อ {formatDateTimeTH(slip.weighedAt)}
            {canOverride
              ? ' — คุณมีสิทธิ์ปลดล็อกเพื่อแก้ไข'
              : ' — ต้องมีสิทธิ์ override จึงจะแก้ไขได้'}
          </LockedNotice>
        )}

        {!readOnly && (
          <div className={cn('rounded border border-line bg-sunken px-4 py-4', slip.locked && 'mt-4')}>
            <p className="mb-3 flex items-center gap-1.5 text-[.82rem] font-semibold text-ink-dim">
              <Icon name="edit" size={14} />
              เพิ่มถุงด้วยมือ — ใช้เมื่อดึงจากระบบชั่งไม่ได้ หรือต้องแก้ไขรายถุง
            </p>
            {/*
              One ถุง, its grade, then เพิ่มถุง. Keeping the hint on a
              fixed-height line below the row is what keeps the three controls
              on one baseline.
            */}
            <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] sm:items-end">
              <Field label="ชั้นคุณภาพ">
                <Select
                  value={grade}
                  onChange={(e) => setGrade(e.target.value as CocoonGrade)}
                  options={GRADE_OPTIONS}
                />
              </Field>
              <Field label="น้ำหนักถุง">
                <NumberInput
                  value={weight}
                  emphasis
                  step="0.01"
                  min={0}
                  unit="กก."
                  autoFocus
                  onChange={(e) => setWeight(e.target.value === '' ? '' : Number(e.target.value))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      void add()
                    }
                  }}
                />
              </Field>
              {/* Matches the 42px control height so all three line up exactly. */}
              <Can permission="weighing:edit">
                <Button
                  variant="green"
                  iconLeft="plus"
                  className="h-[42px]"
                  disabled={weightValue <= 0}
                  loading={addBag.isPending}
                  onClick={() => void add()}
                >
                  เพิ่มถุง
                </Button>
              </Can>
            </div>
            <p className="mt-2.5 flex min-h-[1.25rem] flex-wrap items-center gap-x-4 gap-y-1 text-[.78rem] text-ink-faint">
              ชั่งทีละถุง — ระบบรวมน้ำหนักแยกตามชั้นคุณภาพให้เอง กด Enter เพื่อเพิ่มถุงถัดไป
            </p>
          </div>
        )}

        <div className="mt-4 overflow-hidden rounded border border-line">
          {slip.lines.length === 0 ? (
            <EmptyState
              icon="scale"
              title="ยังไม่มีถุงที่ชั่ง"
              description={
                readOnly ? undefined : 'กด "ดึงรายการชั่ง" ด้านบน หรือเพิ่มถุงด้วยมือ'
              }
            />
          ) : (
            <div className="app-scroll max-h-[22rem] overflow-y-auto">
              <table className="w-full border-collapse">
                <thead className="sticky top-0">
                  <tr>
                    {['ถุงที่', 'ชั้นคุณภาพ', 'น้ำหนัก (กก.)', ''].map((h, i) => (
                      <th
                        key={h || 'sp'}
                        className={cn(
                          'border-b border-forest-dark bg-forest px-4 py-2.5 text-[.72rem] font-bold uppercase tracking-[.5px] text-white',
                          i === 2 ? 'text-right' : 'text-left',
                          i === 3 && 'w-12',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slip.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-[#f8faf6]">
                      <td className="dash-num border-b border-line-faint px-4 py-2 text-[.86rem] text-ink-dim">
                        {line.seq}
                      </td>
                      <td className="border-b border-line-faint px-4 py-2 text-[.86rem] font-semibold">
                        {COCOON_GRADE_LABELS[line.grade]}
                      </td>
                      <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.86rem] font-bold">
                        {formatNumber(line.weightKg, 2)}
                      </td>
                      <td className="border-b border-line-faint px-2 py-2 text-right">
                        {!readOnly && (
                          <IconButton
                            icon="trash"
                            label={`ลบถุงที่ ${line.seq}`}
                            variant="ghost"
                            size="sm"
                            className="text-danger hover:bg-danger-soft"
                            onClick={() => void removeBag.mutateAsync(line.id)}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {slip.gradeTotals.length > 0 && (
          <div className="mt-4 overflow-hidden rounded border border-line">
            <table className="w-full border-collapse">
              <tbody>
                {slip.gradeTotals.map((total) => (
                  <tr key={total.grade}>
                    <td className="border-b border-line-faint px-4 py-2 text-[.84rem]">
                      {COCOON_GRADE_LABELS[total.grade]}
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.8rem] text-ink-faint">
                      {total.bags} ถุง
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.86rem] font-bold">
                      {formatNumber(total.weightKg, 2)} กก.
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-line-faint">
                  <td className="px-4 py-2.5 text-[.84rem] font-bold">รวมน้ำหนักรัง</td>
                  <td />
                  <td className="dash-num px-4 py-2.5 text-right text-[.92rem] font-bold text-forest">
                    {formatNumber(slip.totalCocoonWeight, 2)} กก.
                  </td>
                </tr>
                <tr className="bg-line-faint">
                  <td className="px-4 py-2.5 text-[.84rem] font-bold">รวมน้ำหนักเศษ</td>
                  <td />
                  <td className="dash-num px-4 py-2.5 text-right text-[.92rem] font-bold text-tan-dark">
                    {formatNumber(slip.totalScrapWeight, 2)} กก.
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <InfoBanner tone="info" className="mt-4">
          น้ำหนักรวมและการแยกรัง/เศษ คำนวณโดยระบบหลังบ้าน หน้าจอนี้แสดงค่าที่ได้รับกลับมาเท่านั้น
        </InfoBanner>

        {!readOnly && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Can permission="weighing:edit">
              <Button
                variant="green"
                size="lg"
                iconLeft="lock"
                disabled={slip.lines.length === 0}
                onClick={() => setConfirmLock(true)}
              >
                ล็อกใบชั่ง แล้วไปใบรับซื้อ
              </Button>
            </Can>
            {slip.lines.length === 0 && (
              <span className="text-[.78rem] text-ink-faint">ต้องชั่งอย่างน้อย 1 ถุง</span>
            )}
          </div>
        )}

        {slip.locked && canOverride && (
          <UnlockPanel
            title="ปลดล็อกใบชั่งน้ำหนักรังไหมสด"
            placeholder="เช่น ชั่งซ้ำเนื่องจากบันทึกถุงผิดชั้นคุณภาพ"
            onUnlock={unlock.mutateAsync}
          />
        )}
      </div>

      <ConfirmDialog
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        onConfirm={doLock}
        title="ล็อกใบชั่งน้ำหนัก"
        message={
          <>
            เมื่อล็อกแล้วจะแก้ไขน้ำหนักไม่ได้ หากไม่มีสิทธิ์ override
            <br />
            {slip.lines.length} ถุง · น้ำหนักรัง{' '}
            <strong className="dash-num">{formatWeight(slip.totalCocoonWeight)}</strong> · น้ำหนักเศษ{' '}
            <strong className="dash-num">{formatWeight(slip.totalScrapWeight)}</strong>
          </>
        }
        confirmLabel="ล็อกและไปใบรับซื้อ"
        icon="lock"
        loading={lock.isPending}
      />

      <ScaleModal
        open={scaleOpen}
        onClose={() => setScaleOpen(false)}
        onAccept={(w) => {
          setWeight(w)
          setScaleOpen(false)
          toast.info('รับค่าจากเครื่องชั่งแล้ว', `${formatWeight(w)} — ตรวจสอบก่อนเพิ่มถุง`)
        }}
      />
    </Card>
  )
}

/* ── Slip 2: ใบชั่งน้ำหนักเปลือกรัง ─────────────────────────────────────── */

function ShellWeighCard({
  queueId,
  slip,
}: Readonly<{ queueId: string; slip?: ShellWeighSlip }>) {
  const toast = useToast()
  const { can } = useAuth()
  const { save, lock, unlock } = useShellWeighActions(queueId)
  const [confirmLock, setConfirmLock] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ShellWeighFormValues>({
    resolver: zodResolver(shellWeighSchema),
    defaultValues: {
      sampleCocoonCount: 0,
      sampleCocoonWeightG: 0,
      shellWeightG: 0,
      moisturePercent: 0,
    },
  })

  useEffect(() => {
    if (!slip) return
    reset({
      sampleCocoonCount: slip.sampleCocoonCount ?? 0,
      sampleCocoonWeightG: slip.sampleCocoonWeightG ?? 0,
      shellWeightG: slip.shellWeightG ?? 0,
      moisturePercent: slip.moisturePercent ?? 0,
    })
  }, [slip, reset])

  const canOverride = can('weighing:override')
  const locked = slip?.locked ?? false
  const readOnly = locked && !canOverride

  const onSave = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync(values)
      toast.success(
        'บันทึกใบชั่งเปลือกรังแล้ว',
        saved.shellPercent != null ? `%เปลือกรัง ${formatNumber(saved.shellPercent, 2)}%` : undefined,
      )
      reset(values)
    } catch (err) {
      toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  })

  return (
    <Card>
      <CardHeader
        title="ใบชั่งน้ำหนักเปลือกรัง"
        icon="file"
        subtitle={<span className="dash-num">{slip?.slipNo ?? "—"}</span>}
      />
      <div className="px-[22px] py-5">
        {locked && (
          <LockedNotice>
            ใบชั่งเปลือกรังถูกล็อกแล้วเมื่อ {formatDateTimeTH(slip?.weighedAt)}
            {canOverride ? ' — คุณมีสิทธิ์ปลดล็อกเพื่อแก้ไข' : ''}
          </LockedNotice>
        )}

        <form onSubmit={onSave} noValidate className={cn(locked && 'mt-4')}>
          <FormGrid columns={4}>
            <Field
              label="จำนวนรังตัวอย่าง"
              required
              error={errors.sampleCocoonCount?.message}
              hint="รัง"
            >
              <NumberInput
                {...register('sampleCocoonCount', { valueAsNumber: true })}
                emphasis
                step="1"
                min={0}
                readOnly={readOnly}
              />
            </Field>
            <Field label="นน.รังรวม" required error={errors.sampleCocoonWeightG?.message}>
              <NumberInput
                {...register('sampleCocoonWeightG', { valueAsNumber: true })}
                emphasis
                step="0.01"
                min={0}
                unit="กรัม"
                readOnly={readOnly}
              />
            </Field>
            <Field label="นน.เปลือกรัง" required error={errors.shellWeightG?.message}>
              <NumberInput
                {...register('shellWeightG', { valueAsNumber: true })}
                emphasis
                step="0.01"
                min={0}
                unit="กรัม"
                readOnly={readOnly}
              />
            </Field>
            <Field label="ความชื้น" required error={errors.moisturePercent?.message}>
              <NumberInput
                {...register('moisturePercent', { valueAsNumber: true })}
                emphasis
                step="0.1"
                min={0}
                unit="%"
                readOnly={readOnly}
              />
            </Field>
          </FormGrid>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <SummaryCard
              label="%เปลือกรัง (คำนวณโดยระบบ)"
              value={slip?.shellPercent != null ? `${formatNumber(slip.shellPercent, 2)}%` : '—'}
            />
            <SummaryCard
              label="น้ำหนัก/รัง"
              value={
                slip?.sampleCocoonCount && slip.sampleCocoonWeightG
                  ? `${formatNumber(slip.sampleCocoonWeightG / slip.sampleCocoonCount, 2)} กรัม`
                  : '—'
              }
            />
          </div>

          {!readOnly && (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <Can permission="weighing:edit">
                <Button
                  type="submit"
                  variant="primary"
                  iconLeft="check"
                  loading={isSubmitting || save.isPending}
                >
                  บันทึกใบชั่งเปลือกรัง
                </Button>
              </Can>
              <Can permission="weighing:edit">
                <Button
                  variant="ghost"
                  iconLeft="lock"
                  disabled={slip?.shellPercent == null || isDirty}
                  onClick={() => setConfirmLock(true)}
                >
                  ล็อกใบชั่งเปลือกรัง
                </Button>
              </Can>
              {isDirty && (
                <span className="text-[.78rem] text-ink-faint">บันทึกก่อนจึงจะล็อกได้</span>
              )}
            </div>
          )}

          {locked && canOverride && (
            <UnlockPanel
              title="ปลดล็อกใบชั่งเปลือกรัง"
              placeholder="เช่น สุ่มตัวอย่างใหม่เนื่องจากชั่งผิดพลาด"
              onUnlock={unlock.mutateAsync}
            />
          )}
        </form>
      </div>

      <ConfirmDialog
        open={confirmLock}
        onClose={() => setConfirmLock(false)}
        onConfirm={async () => {
          try {
            await lock.mutateAsync()
            toast.success('ล็อกใบชั่งเปลือกรังแล้ว')
            setConfirmLock(false)
          } catch (err) {
            toast.error('ล็อกไม่สำเร็จ', toUserMessage(err))
          }
        }}
        title="ล็อกใบชั่งเปลือกรัง"
        message="เมื่อล็อกแล้วจะแก้ไขค่าตัวอย่างไม่ได้ หากไม่มีสิทธิ์ override"
        confirmLabel="ล็อกใบชั่ง"
        icon="lock"
        loading={lock.isPending}
      />
    </Card>
  )
}

function UnlockPanel({
  title,
  placeholder,
  onUnlock,
}: Readonly<{
  title: string
  placeholder: string
  onUnlock: (reason: string) => Promise<unknown>
}>) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="mt-6 rounded border border-dashed border-tan/50 bg-tan-soft px-4 py-4">
      <p className="mb-2 flex items-center gap-1.5 text-[.84rem] font-semibold text-[#7d5629]">
        <Icon name="shield" size={15} />
        {title} (ต้องมีสิทธิ์ override)
      </p>
      <Field label="เหตุผล" hint="บันทึกลงประวัติการใช้งานทุกครั้ง">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder={placeholder}
        />
      </Field>
      <Button
        variant="ghost"
        size="sm"
        className="mt-2"
        iconLeft="lock"
        disabled={reason.trim().length < 4}
        loading={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await onUnlock(reason.trim())
            toast.success('ปลดล็อกแล้ว')
            setReason('')
          } catch (err) {
            toast.error('ปลดล็อกไม่สำเร็จ', toUserMessage(err))
          } finally {
            setBusy(false)
          }
        }}
      >
        ปลดล็อกเพื่อแก้ไข
      </Button>
    </div>
  )
}

/* ── WEIGH-002 — scale adapter UI ───────────────────────────────────────── */

function ScaleModal({
  open,
  onClose,
  onAccept,
}: Readonly<{ open: boolean; onClose: () => void; onAccept: (weight: number) => void }>) {
  const adapter = useMemo(() => getScaleAdapter(), [])
  const [reading, setReading] = useState<ScaleReading | null>(null)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'reading' | 'error'>('idle')
  const unsubscribe = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!open) {
      unsubscribe.current?.()
      unsubscribe.current = null
      setReading(null)
      setStatus('idle')
      return
    }
    let cancelled = false
    setStatus('connecting')
    adapter
      .connect()
      .then(() => {
        if (cancelled) return
        setStatus('reading')
        unsubscribe.current = adapter.subscribe(setReading)
      })
      .catch(() => !cancelled && setStatus('error'))

    return () => {
      cancelled = true
      unsubscribe.current?.()
      unsubscribe.current = null
      void adapter.disconnect()
    }
  }, [open, adapter])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="อ่านค่าจากเครื่องชั่ง"
      description={adapter.label}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            iconLeft="check"
            disabled={!reading?.stable}
            onClick={() => reading && onAccept(reading.weight)}
          >
            ใช้ค่านี้
          </Button>
        </>
      }
    >
      <div className="py-4 text-center">
        <p
          className={cn(
            'dash-num text-[3rem] font-bold leading-none',
            reading?.stable ? 'text-forest' : 'text-ink-faint',
          )}
        >
          {reading ? formatNumber(reading.weight, 2) : '—'}
        </p>
        <p className="mt-1 text-sm text-ink-dim">กิโลกรัม</p>
        <p className="mt-4 text-[.82rem]">
          {status === 'connecting' && <span className="text-ink-faint">กำลังเชื่อมต่อ...</span>}
          {status === 'error' && <span className="text-danger">เชื่อมต่อเครื่องชั่งไม่สำเร็จ</span>}
          {status === 'reading' && !reading?.stable && (
            <span className="text-tan">ค่ายังไม่นิ่ง กรุณารอสักครู่</span>
          )}
          {reading?.stable && (
            <span className="font-semibold text-meadow-deep">ค่านิ่งแล้ว พร้อมใช้งาน</span>
          )}
        </p>
        <p className="mt-4 text-[.75rem] leading-relaxed text-ink-faint">
          วิธีเชื่อมต่อเครื่องชั่งจริงยังรอการยืนยัน (§20) — ขณะนี้ใช้ตัวจำลองผ่าน Scale Adapter
          interface เดียวกัน
        </p>
      </div>
    </Modal>
  )
}
