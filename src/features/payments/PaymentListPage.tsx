import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS } from '@/constants'
import type { FarmerPayment } from '@/types/domain'
import { paymentSchema, type PaymentFormValues } from '@/schemas'
import { PageHeader } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import {
  FilterBar,
  FilterField,
  PaginationFor,
  SearchBox,
} from '@/components/data-display/FilterBar'
import { Select } from '@/components/form/Select'
import { DateInput, DateRangeInput, Input, Textarea } from '@/components/form/Input'
import { Field, FormGrid } from '@/components/form/Field'
import { RadioGroup } from '@/components/form/Choice'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Modal } from '@/components/feedback/Modal'
import { InfoBanner } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBankMaster, useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { useIdempotencyKey } from '@/hooks/useDirtyGuard'
import { formatCurrency, formatDateTH, toDateInput } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { usePayFarmer, usePaymentList } from './hooks'

/**
 * PAY-001 — the money the farmer actually leaves with.
 *
 * A row appears here the moment a purchase is closed and disappears from the
 * "รอจ่ายเงิน" tab when it is handed over. The three figures are always shown
 * together: the invoice total, what the round's debt took, and the difference —
 * because that difference is the number the farmer came for, and it is the one
 * they will ask about.
 */
export function PaymentListPage() {
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'createdAt',
  })
  const { data, isPending, error, refetch } = usePaymentList(params)
  const { options: branchOptions } = useBranchOptions()
  const { can } = useAuth()

  const [paying, setPaying] = useState<FarmerPayment | null>(null)

  const columns: Column<FarmerPayment>[] = [
    {
      key: 'paymentNo',
      header: 'เลขที่ใบสำคัญจ่าย',
      sortable: true,
      width: '11rem',
      cell: (p) => (
        <span>
          <span className="dash-num block font-semibold text-forest">{p.paymentNo}</span>
          <span className="dash-num block text-[.76rem] text-ink-faint">{p.transactionNo}</span>
        </span>
      ),
    },
    {
      key: 'farmerName',
      header: 'เกษตรกร',
      sortable: true,
      cell: (p) => (
        <span>
          <span className="block font-semibold text-ink">{p.farmerName}</span>
          <span className="dash-num block text-[.76rem] text-ink-faint">
            {p.farmerCode} · {p.branchName}
          </span>
        </span>
      ),
    },
    {
      key: 'batchNo',
      header: 'รอบ',
      hideBelow: 'lg',
      width: '7rem',
      cell: (p) => <span className="dash-num">{p.batchNo ?? '—'}</span>,
    },
    {
      key: 'grossAmount',
      header: 'รวมรายได้',
      align: 'right',
      sortable: true,
      hideBelow: 'md',
      cell: (p) => formatCurrency(p.grossAmount, { digits: 0 }),
    },
    {
      key: 'deductedAmount',
      header: 'หักหนี้',
      align: 'right',
      hideBelow: 'md',
      cell: (p) =>
        p.deductedAmount > 0 ? (
          <span className="text-danger">−{formatCurrency(p.deductedAmount, { digits: 0 })}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'netAmount',
      header: 'จ่ายเกษตรกร',
      align: 'right',
      sortable: true,
      cell: (p) => (
        <span className="font-bold text-meadow-deep">
          {formatCurrency(p.netAmount, { digits: 0 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      width: '11rem',
      cell: (p) => (
        <span>
          <StatusBadge status={PAYMENT_STATUS[p.status]} />
          {p.status === 'PAID' && (
            <span className="dash-num mt-1 block text-[.72rem] text-ink-faint">
              {p.method ? PAYMENT_METHOD_LABEL[p.method] : ''} · {formatDateTH(p.paidDate)}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '8rem',
      cell: (p) =>
        p.status === 'PENDING' && can('payment:pay') ? (
          <Button size="sm" variant="green" iconLeft="wallet" onClick={() => setPaying(p)}>
            จ่ายเงิน
          </Button>
        ) : p.exportedAt ? (
          <span className="dash-num text-[.72rem] text-ink-faint">ส่ง {p.exportBatchNo}</span>
        ) : null,
    },
  ]

  const pendingTotal = (data?.items ?? [])
    .filter((p) => p.status === 'PENDING')
    .reduce((sum, p) => sum + p.netAmount, 0)

  return (
    <>
      <PageHeader
        title="จ่ายเงินเกษตรกร"
        subtitle={`${data?.total ?? 0} รายการ · รอจ่ายในหน้านี้ ${formatCurrency(pendingTotal, { digits: 0 })}`}
      />

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="เลขที่ใบสำคัญจ่าย / ใบรับซื้อ / เกษตรกร"
          />
        </FilterField>
        <FilterField label="สาขา" className="sm:w-44">
          <Select
            placeholder="ทุกสาขา"
            value={params.branchId ?? ''}
            options={branchOptions}
            onChange={(e) => update({ branchId: e.target.value })}
          />
        </FilterField>
        <FilterField label="สถานะ" className="sm:w-40">
          <Select
            placeholder="ทุกสถานะ"
            value={params.status ?? ''}
            options={Object.entries(PAYMENT_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            onChange={(e) => update({ status: e.target.value })}
          />
        </FilterField>
        <FilterField label="ช่วงวันที่">
          <DateRangeInput
            from={params.dateFrom ?? ''}
            to={params.dateTo ?? ''}
            onChange={({ from, to }) => update({ dateFrom: from, dateTo: to })}
          />
        </FilterField>
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
        emptyTitle="ยังไม่มีรายการจ่ายเงิน"
        emptyDescription="รายการจะขึ้นเองเมื่อปิดการรับซื้อรังไหมสด"
        footer={
          <PaginationFor
            data={data}
            onPageChange={(page) => update({ page }, false)}
            onPageSizeChange={(pageSize) => update({ pageSize })}
          />
        }
      />

      <PayDialog payment={paying} onClose={() => setPaying(null)} />
    </>
  )
}

/* ── บันทึกจ่ายเงิน ─────────────────────────────────────────────────────── */

function PayDialog({
  payment,
  onClose,
}: Readonly<{ payment: FarmerPayment | null; onClose: () => void }>) {
  const toast = useToast()
  const { data: banks } = useBankMaster()
  const payMutation = usePayFarmer(payment?.id ?? '')
  const idempotencyKey = useIdempotencyKey(payment?.id)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentSchema),
    defaultValues: { method: 'BANK_TRANSFER', paidDate: toDateInput(new Date().toISOString()) },
  })

  // Re-opening the dialog for another farmer must not inherit the last one's
  // bank reference.
  useEffect(() => {
    if (payment) {
      reset({ method: 'BANK_TRANSFER', paidDate: toDateInput(new Date().toISOString()) })
    }
  }, [payment, reset])

  const method = watch('method')

  if (!payment) return null

  const submit = handleSubmit(async (values) => {
    try {
      await payMutation.mutateAsync({ payload: values, idempotencyKey })
      toast.success(
        'บันทึกการจ่ายเงินแล้ว',
        `${payment.farmerName} · ${formatCurrency(payment.netAmount)}`,
      )
      onClose()
    } catch (err) {
      toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  })

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`จ่ายเงินเกษตรกร · ${payment.farmerName}`}
      description={`${payment.paymentNo} · ตามใบรับซื้อ ${payment.transactionNo}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            ยกเลิก
          </Button>
          <Button
            variant="green"
            iconLeft="check"
            loading={payMutation.isPending}
            onClick={() => void submit()}
          >
            ยืนยันจ่าย {formatCurrency(payment.netAmount)}
          </Button>
        </>
      }
    >
      <div className="mb-5 rounded border border-line bg-sunken px-4 py-3">
        <div className="flex items-baseline justify-between text-[.9rem]">
          <span className="text-ink-dim">รวมรายได้ตามใบรับซื้อ</span>
          <span className="dash-num font-semibold text-ink">
            {formatCurrency(payment.grossAmount)}
          </span>
        </div>
        <div className="mt-1.5 flex items-baseline justify-between text-[.9rem]">
          <span className="text-ink-dim">หักหนี้รอบ {payment.batchNo ?? '—'}</span>
          <span className="dash-num font-semibold text-danger">
            −{formatCurrency(payment.deductedAmount)}
          </span>
        </div>
        <div className="mt-2.5 flex items-baseline justify-between border-t border-line pt-2.5">
          <span className="font-semibold text-ink">ยอดจ่ายเกษตรกร</span>
          <span className="dash-num text-[1.15rem] font-bold text-meadow-deep">
            {formatCurrency(payment.netAmount)}
          </span>
        </div>
      </div>

      <FormGrid columns={2}>
        <Field label="วิธีจ่าย" required error={errors.method?.message} className="sm:col-span-2">
          <RadioGroup
            name="method"
            value={method}
            onChange={(value) =>
              setValue('method', value as PaymentFormValues['method'], { shouldValidate: true })
            }
            options={[
              { value: 'BANK_TRANSFER', label: 'โอนเข้าบัญชี' },
              { value: 'CASH', label: 'เงินสด' },
            ]}
          />
        </Field>

        <Field label="วันที่จ่าย" required error={errors.paidDate?.message}>
          <DateInput {...register('paidDate')} />
        </Field>

        {method === 'BANK_TRANSFER' && (
          <>
            <Field label="ธนาคาร" required error={errors.bankName?.message}>
              <Select
                placeholder="เลือกธนาคาร"
                options={(banks ?? []).map((b) => ({ value: b.name, label: b.name }))}
                {...register('bankName')}
              />
            </Field>
            <Field label="เลขที่บัญชี" error={errors.accountNo?.message}>
              <Input placeholder="xxx-x-xxxxx-x" {...register('accountNo')} />
            </Field>
            <Field
              label="เลขที่อ้างอิงการโอน"
              hint="ใช้กระทบยอดกับ statement ของธนาคาร"
              error={errors.transferRef?.message}
            >
              <Input placeholder="TRF..." {...register('transferRef')} />
            </Field>
          </>
        )}

        {method === 'CASH' && (
          <InfoBanner tone="info" icon="info" className="sm:col-span-2">
            จ่ายเงินสดต้องให้เกษตรกรลงชื่อรับเงินในใบรับซื้อรังไหมสด
            แล้วเก็บใบเป็นหลักฐานแนบใบสำคัญจ่าย
          </InfoBanner>
        )}

        <Field label="หมายเหตุ" error={errors.remark?.message} className="sm:col-span-2">
          <Textarea rows={2} {...register('remark')} />
        </Field>
      </FormGrid>
    </Modal>
  )
}
