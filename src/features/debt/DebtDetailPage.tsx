import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { DEBT_STATUS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from '@/constants'
import { deductionSchema, type DeductionFormValues } from '@/schemas'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge, StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader, DescriptionList } from '@/components/data-display/PageHeader'
import { SummaryCard } from '@/components/data-display/KpiCard'
import { Field, FormGrid } from '@/components/form/Field'
import { CurrencyInput, Textarea } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { EmptyState, ErrorState, InfoBanner, SkeletonText } from '@/components/feedback/States'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { useToast } from '@/components/feedback/Toast'
import { FullPageLoader } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { useIdempotencyKey } from '@/hooks/useDirtyGuard'
import { formatCurrency, formatDateTH, formatDateTimeTH, formatNumber } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import type { DeductionPreview } from '@/types/domain'
import { usePaymentForPurchase } from '@/features/payments/hooks'
import {
  useConfirmDeduction,
  useDebt,
  useDebtAudit,
  useDebtDeductions,
  useDeductionPreview,
  useDeductionSources,
} from './hooks'

/**
 * DEBT-002 / DEBT-003 / DEBT-004 — one round's debt, and the invoices that can
 * pay it.
 *
 * The debt was raised by a booking, so it is itemised with exactly what the
 * farmer took. It is settled from the รวมรายได้ of a ใบรับซื้อ **from the same
 * รอบ** — the server returns the eligible invoices and the ceiling; the page
 * never derives either (§7.9).
 */
export function DebtDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const toast = useToast()
  const { can } = useAuth()

  const { data: debt, isPending, error, refetch } = useDebt(id)
  const { data: sources, isPending: sourcesPending } = useDeductionSources(id)
  const { data: applied } = useDebtDeductions(id)
  // The money the farmer leaves with belongs to the invoice that paid this
  // debt down, so the pay-out is looked up from the latest deduction.
  const paidFrom = applied?.[0]?.purchaseId
  const { data: payment } = usePaymentForPurchase(paidFrom)
  const { data: audit, isPending: auditPending } = useDebtAudit(id)
  const preview = useDeductionPreview(id)
  const confirmMutation = useConfirmDeduction(id)

  const [previewResult, setPreviewResult] = useState<DeductionPreview | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DeductionFormValues>({
    // The real ceiling is per invoice, so the resolver is rebuilt below once a
    // source is picked; this bound only keeps the field from going unbounded.
    resolver: zodResolver(deductionSchema(debt?.remainingBalance ?? 0)),
    defaultValues: { purchaseId: '', currentDeduction: 0, remark: '' },
  })

  const amount = watch('currentDeduction')
  const purchaseId = watch('purchaseId')
  const source = sources?.find((s) => s.purchaseId === purchaseId)

  // A new amount or a different invoice invalidates the previous server preview.
  useEffect(() => {
    setPreviewResult(null)
  }, [amount, purchaseId])

  // One eligible invoice is the common case — pick it so the form is ready.
  useEffect(() => {
    if (sources?.length === 1 && !purchaseId) {
      setValue('purchaseId', sources[0].purchaseId)
    }
  }, [sources, purchaseId, setValue])

  const idempotencyKey = useIdempotencyKey(`${purchaseId}:${previewResult?.currentDeduction}`)

  if (isPending) return <FullPageLoader label="กำลังโหลดรายการหนี้..." />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!debt) return <ErrorState error={new Error('ไม่พบรายการหนี้')} />

  const settled = debt.status === 'SETTLED'
  const onHold = debt.status === 'HOLD'
  const hasSource = (sources?.length ?? 0) > 0
  const canDeduct = can('debt:deduct') && !settled && !onHold && hasSource
  const ceiling = source ? Math.min(debt.remainingBalance, source.availableAmount) : 0

  const runPreview = handleSubmit(async (values) => {
    try {
      const result = await preview.mutateAsync({
        purchaseId: values.purchaseId,
        currentDeduction: values.currentDeduction,
        remark: values.remark || undefined,
      })
      setPreviewResult(result)
    } catch (err) {
      const message = toUserMessage(err)
      setError('currentDeduction', { message })
      toast.error('คำนวณตัวอย่างไม่สำเร็จ', message)
    }
  })

  const doConfirm = async () => {
    if (!previewResult || !source) return
    try {
      await confirmMutation.mutateAsync({
        payload: {
          purchaseId: source.purchaseId,
          currentDeduction: previewResult.currentDeduction,
          remark: watch('remark') || undefined,
        },
        idempotencyKey,
      })
      toast.success(
        'ตัดหนี้สำเร็จ',
        `${source.transactionNo} · ${formatCurrency(previewResult.currentDeduction)}`,
      )
      setConfirmOpen(false)
      setPreviewResult(null)
      reset({ purchaseId: '', currentDeduction: 0, remark: '' })
    } catch (err) {
      toast.error('ตัดหนี้ไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={`หนี้จากใบจอง ${debt.sourceNo}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{debt.farmerName}</span>
            <span className="dash-num text-ink-faint">
              {debt.farmerCode} · {debt.branchName}
            </span>
            <Badge tone="info">รอบ {debt.batchNo}</Badge>
            <StatusBadge status={DEBT_STATUS[debt.status]} />
          </span>
        }
        backTo="/debts"
        breadcrumb={[{ label: 'ตัดหนี้รังไหมสด', to: '/debts' }, { label: debt.sourceNo }]}
      />

      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="หนี้ตั้งต้น" value={formatCurrency(debt.originalAmount)} emphasis />
        <SummaryCard
          label="ตัดไปแล้ว"
          value={formatCurrency(debt.deductedAmount)}
          tone="info"
          emphasis
        />
        <SummaryCard
          label="คงเหลือ"
          value={formatCurrency(debt.remainingBalance)}
          tone={debt.remainingBalance > 0 ? 'danger' : 'success'}
          emphasis
        />
        <SummaryCard
          label="รายได้ที่ตัดได้ในรอบนี้"
          value={formatCurrency(
            (sources ?? []).reduce((sum, s) => sum + s.availableAmount, 0),
          )}
          tone="warning"
          emphasis
          hint={`${sources?.length ?? 0} ใบรับซื้อ`}
        />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-12">
        <div className="flex flex-col gap-[18px] lg:col-span-7">
          <Card>
            <CardHeader
              title="บันทึกการตัดหนี้"
              icon="coins"
              iconClassName="bg-tan-soft text-tan"
              subtitle={`หักจากรวมรายได้ของใบรับซื้อในรอบ ${debt.batchNo}`}
            />
            <div className="flex flex-col gap-4 px-[22px] py-5">
              {settled && (
                <InfoBanner tone="success" icon="check-circle">
                  รายการนี้ปิดยอดหนี้เรียบร้อยแล้ว
                </InfoBanner>
              )}
              {onHold && (
                <InfoBanner tone="warning" icon="pause">
                  รายการนี้ถูกระงับ — ต้องปลดระงับก่อนจึงจะตัดหนี้ได้
                </InfoBanner>
              )}
              {!can('debt:deduct') && !settled && (
                <InfoBanner tone="info" icon="lock">
                  บัญชีของคุณดูข้อมูลได้อย่างเดียว การตัดหนี้ต้องมีสิทธิ์ debt:deduct
                </InfoBanner>
              )}
              {!settled && !onHold && !sourcesPending && !hasSource && (
                <InfoBanner tone="warning" icon="alert" title="ยังไม่มีใบรับซื้อของรอบนี้">
                  หนี้รอบ {debt.batchNo} จะตัดได้ก็ต่อเมื่อมีใบรับซื้อรังไหมสดของรอบเดียวกันที่ปิดรายการแล้ว
                  — รายได้ของรอบอื่นนำมาหักไม่ได้
                </InfoBanner>
              )}

              {canDeduct && (
                <form onSubmit={runPreview} noValidate className="flex flex-col gap-4">
                  <Field
                    label="ใบรับซื้อที่นำมาหักหนี้"
                    required
                    error={errors.purchaseId?.message}
                    hint="เฉพาะใบรับซื้อของเกษตรกรรายนี้ ในรอบเดียวกัน ที่ยังมียอดคงเหลือ"
                  >
                    <Select
                      {...register('purchaseId')}
                      value={purchaseId}
                      placeholder="เลือกใบรับซื้อ"
                      options={(sources ?? []).map((s) => ({
                        value: s.purchaseId,
                        label: `${s.transactionNo} · ${formatCurrency(s.availableAmount)}`,
                        description: `${formatDateTH(s.purchaseDate)} · รวมรายได้ ${formatCurrency(s.grossAmount)}`,
                      }))}
                    />
                  </Field>

                  <FormGrid columns={2}>
                    <Field
                      label="จำนวนที่ต้องการตัด"
                      required
                      error={errors.currentDeduction?.message}
                      hint={
                        source
                          ? `ตัดได้สูงสุด ${formatCurrency(ceiling)}`
                          : 'เลือกใบรับซื้อก่อนจึงจะทราบเพดาน'
                      }
                    >
                      <CurrencyInput
                        {...register('currentDeduction', { valueAsNumber: true })}
                        max={ceiling || undefined}
                        disabled={!source}
                        emphasis
                      />
                    </Field>
                    <Field label="หมายเหตุ" error={errors.remark?.message}>
                      <Textarea
                        {...register('remark')}
                        rows={3}
                        placeholder="เหตุผล / เอกสารอ้างอิง"
                      />
                    </Field>
                  </FormGrid>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="submit"
                      variant="ghost"
                      iconLeft="chart"
                      loading={isSubmitting || preview.isPending}
                    >
                      คำนวณตัวอย่าง
                    </Button>
                    <Button
                      variant="green"
                      iconLeft="check-circle"
                      disabled={!previewResult}
                      onClick={() => setConfirmOpen(true)}
                    >
                      ยืนยันตัดหนี้
                    </Button>
                    {!previewResult && (
                      <span className="text-[.78rem] text-ink-faint">
                        ต้องคำนวณตัวอย่างก่อนจึงจะยืนยันได้
                      </span>
                    )}
                  </div>

                  {previewResult && (
                    <div className="rounded border border-line bg-sunken px-4 py-4">
                      <p className="mb-3 flex items-center gap-1.5 text-[.86rem] font-bold text-ink">
                        <Icon name="info" size={15} className="text-forest" />
                        ผลการคำนวณจากระบบหลังบ้าน
                      </p>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <SummaryCard
                          label="ตัดครั้งนี้"
                          value={formatCurrency(previewResult.currentDeduction)}
                          tone="warning"
                          emphasis
                        />
                        <SummaryCard
                          label="หนี้คงเหลือหลังตัด"
                          value={formatCurrency(previewResult.remainingBalance)}
                          tone={previewResult.remainingBalance > 0 ? 'danger' : 'success'}
                          emphasis
                        />
                        <SummaryCard
                          label="ยอดจ่ายเกษตรกร"
                          value={formatCurrency(previewResult.netPayable)}
                          tone="success"
                          emphasis
                          hint="รวมรายได้ที่เหลือของใบรับซื้อ"
                        />
                      </div>
                      {previewResult.warnings.length > 0 && (
                        <ul className="mt-3 flex flex-col gap-1.5">
                          {previewResult.warnings.map((w) => (
                            <li
                              key={w}
                              className="flex items-start gap-1.5 text-[.8rem] text-[#7d5629]"
                            >
                              <Icon name="alert" size={14} className="mt-px" />
                              {w}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </form>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader
              title="รายการหนี้ที่รับไปตอนจอง"
              icon="package"
              subtitle={`ใบจอง ${debt.sourceNo}`}
            />
            <div className="app-scroll overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse">
                <thead>
                  <tr>
                    {['รายการ', 'จำนวน', 'หน่วย', 'ราคา', 'รวม'].map((h, i) => (
                      <th
                        key={h}
                        className={`bg-forest px-[22px] py-[11px] text-[.72rem] font-bold uppercase tracking-[.5px] text-white ${
                          i === 0 ? 'text-left' : 'text-right'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {debt.items.map((item) => (
                    <tr key={item.id} className="hover:bg-[#f8faf6]">
                      <td className="border-b border-line-faint px-[22px] py-[11px] text-[.86rem] font-semibold">
                        {item.productName}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[11px] text-right text-[.86rem]">
                        {formatNumber(item.quantity, item.quantity % 1 === 0 ? 0 : 2)}
                      </td>
                      <td className="border-b border-line-faint px-[22px] py-[11px] text-right text-[.86rem] text-ink-dim">
                        {item.unitName}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[11px] text-right text-[.86rem] text-ink-dim">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[11px] text-right text-[.86rem] font-bold">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-line-faint">
                    <td colSpan={4} className="px-[22px] py-3 text-right text-[.86rem] font-bold">
                      ยอดหนี้ตั้งต้น
                    </td>
                    <td className="dash-num px-[22px] py-3 text-right text-[1.05rem] font-bold text-forest">
                      {formatCurrency(debt.originalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="ข้อมูลรายการ" icon="file" />
            <div className="px-[22px] py-5">
              <DescriptionList
                columns={2}
                items={[
                  {
                    label: 'ใบจองต้นทาง',
                    value: <span className="dash-num">{debt.sourceNo}</span>,
                  },
                  { label: 'รอบ', value: debt.batchNo },
                  { label: 'รุ่นฟัก', value: formatDateTH(debt.hatchDate) },
                  { label: 'สายพันธุ์', value: debt.breedName ?? '—' },
                  { label: 'เกษตรกร', value: debt.farmerName },
                  {
                    label: 'รหัสเกษตรกร',
                    value: <span className="dash-num">{debt.farmerCode}</span>,
                  },
                  { label: 'สาขา', value: debt.branchName },
                  { label: 'ตั้งหนี้เมื่อ', value: formatDateTH(debt.createdAt) },
                  { label: 'อัปเดตล่าสุด', value: formatDateTimeTH(debt.updatedAt) },
                  { label: 'หมายเหตุ', span: true, value: debt.remark ?? '—' },
                ]}
              />
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-[18px] lg:col-span-5">
          {payment && (
            <Card>
              <CardHeader
                title="ยอดจ่ายเกษตรกร"
                icon="banknote"
                iconClassName="bg-meadow-soft text-meadow-deep"
                subtitle={`${payment.paymentNo} · ตามใบรับซื้อ ${payment.transactionNo}`}
                actions={<StatusBadge status={PAYMENT_STATUS[payment.status]} />}
              />
              <div className="px-[22px] py-4">
                <div className="flex items-baseline justify-between text-[.88rem]">
                  <span className="text-ink-dim">รวมรายได้</span>
                  <span className="dash-num font-semibold text-ink">
                    {formatCurrency(payment.grossAmount)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between text-[.88rem]">
                  <span className="text-ink-dim">หักหนี้รอบ {payment.batchNo ?? '—'}</span>
                  <span className="dash-num font-semibold text-danger">
                    −{formatCurrency(payment.deductedAmount)}
                  </span>
                </div>
                <div className="mt-2.5 flex items-baseline justify-between border-t border-line pt-2.5">
                  <span className="font-semibold text-ink">ส่วนต่างที่ต้องจ่าย</span>
                  <span className="dash-num text-[1.1rem] font-bold text-meadow-deep">
                    {formatCurrency(payment.netAmount)}
                  </span>
                </div>

                {payment.status === 'PAID' ? (
                  <p className="dash-num mt-3 text-[.78rem] text-ink-faint">
                    จ่ายแล้ว {formatDateTH(payment.paidDate)}
                    {payment.method && ` · ${PAYMENT_METHOD_LABEL[payment.method]}`}
                    {payment.bankName && ` · ${payment.bankName}`}
                    {payment.transferRef && ` · ${payment.transferRef}`}
                  </p>
                ) : (
                  <Link
                    to="/payments"
                    className="mt-3 inline-flex items-center gap-1.5 text-[.84rem] font-semibold text-forest hover:underline"
                  >
                    ไปบันทึกการจ่ายเงิน
                    <Icon name="arrow-right" size={14} />
                  </Link>
                )}
              </div>
            </Card>
          )}

          <Card>
            <CardHeader title="ประวัติการตัดหนี้" icon="coins" />
            {(applied?.length ?? 0) === 0 ? (
              <EmptyState icon="coins" title="ยังไม่มีการตัดหนี้" />
            ) : (
              <ul>
                {applied?.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex items-start justify-between gap-3 border-b border-line-faint px-[22px] py-3 last:border-b-0"
                  >
                    <div className="min-w-0">
                      <p className="dash-num text-[.86rem] font-semibold text-ink">
                        {entry.transactionNo ?? 'ตัดหนี้'}
                      </p>
                      <p className="text-[.76rem] text-ink-faint">
                        {entry.actorName}
                        {entry.remark && ` · ${entry.remark}`}
                      </p>
                      <p className="dash-num text-[.72rem] text-ink-faint">
                        {formatDateTimeTH(entry.at)}
                        {entry.exportBatchNo && ` · ส่งบัญชีแล้ว ${entry.exportBatchNo}`}
                      </p>
                    </div>
                    <span className="dash-num shrink-0 text-[.9rem] font-bold text-danger">
                      −{formatCurrency(entry.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="ประวัติการทำรายการ" icon="history" />
            {auditPending ? (
              <div className="px-[22px] py-5">
                <SkeletonText lines={5} />
              </div>
            ) : (audit?.length ?? 0) === 0 ? (
              <EmptyState icon="history" title="ยังไม่มีประวัติ" />
            ) : (
              <ul className="app-scroll max-h-[34rem] overflow-y-auto">
                {audit?.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-b border-line-faint px-[22px] py-3 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[.86rem] font-semibold text-ink">{entry.action}</p>
                        <p className="text-[.76rem] text-ink-faint">
                          {entry.actorName}
                          {entry.reference && ` · ${entry.reference}`}
                        </p>
                      </div>
                      <span className="dash-num shrink-0 text-[.72rem] text-ink-faint">
                        {formatDateTimeTH(entry.at)}
                      </span>
                    </div>
                    {(entry.before || entry.after) && (
                      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[.76rem]">
                        <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">
                          {JSON.stringify(entry.before)}
                        </span>
                        <Icon name="arrow-right" size={12} className="text-ink-faint" />
                        <span className="rounded bg-meadow-soft px-1.5 py-0.5 text-meadow-deep">
                          {JSON.stringify(entry.after)}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={doConfirm}
        title="ยืนยันการตัดหนี้"
        message={
          previewResult && source ? (
            <>
              ตัดหนี้{' '}
              <strong className="dash-num">
                {formatCurrency(previewResult.currentDeduction)}
              </strong>{' '}
              จากใบรับซื้อ <strong className="dash-num">{source.transactionNo}</strong> (รอบ{' '}
              {debt.batchNo})
              <br />
              หนี้คงเหลือหลังตัด:{' '}
              <strong className="dash-num">
                {formatCurrency(previewResult.remainingBalance)}
              </strong>
              <br />
              <span className="text-ink-faint">การยืนยันจะถูกบันทึกลงประวัติการใช้งาน</span>
            </>
          ) : (
            ''
          )
        }
        confirmLabel="ยืนยันตัดหนี้"
        loading={confirmMutation.isPending}
      />
    </>
  )
}
