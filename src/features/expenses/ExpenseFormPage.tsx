import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { PAYMENT_METHODS } from '@/constants'
import { expenseSchema, type ExpenseFormValues } from '@/schemas'
import { PageHeader } from '@/components/data-display/PageHeader'
import { Field, FormGrid, FormRow, FormSection } from '@/components/form/Field'
import { CurrencyInput, DateInput, Input, NumberInput, Textarea } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { RadioGroup, ReadOnlyValue } from '@/components/form/Choice'
import { Button } from '@/components/ui/Button'
import { ErrorState, InfoBanner } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { Can, FullPageLoader } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { useCancelWithConfirm, useDirtyGuard } from '@/hooks/useDirtyGuard'
import { fieldErrors, toUserMessage } from '@/utils/errors'
import { formatCurrency, todayInput } from '@/utils/format'
import { useBankOptions, useBranchOptions } from '@/features/master/hooks'
import { FileUpload } from './FileUpload'
import {
  useExpense,
  useExpenseActions,
  useExpenseCategories,
  useSaveExpense,
} from './hooks'

/**
 * EXP-003 / EXP-004 — the five sections from §8.2.
 *
 * The form is generic on purpose (§8): category and expense type are data, so
 * ค่าน้ำ / ค่าไฟ / ค่าน้ำแข็ง and anything added later all use the same screen.
 */
export function ExpenseFormPage({ mode }: Readonly<{ mode: 'create' | 'edit' }>) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, can } = useAuth()
  const isEdit = mode === 'edit'

  const { data: expense, isPending, error } = useExpense(isEdit ? id : undefined)
  const { data: categories, isPending: categoriesPending } = useExpenseCategories()
  const save = useSaveExpense(isEdit ? id : undefined)
  const { upload, removeAttachment } = useExpenseActions(id ?? '')
  const { options: branchOptions } = useBranchOptions()
  const { options: bankOptions } = useBankOptions()

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      expenseDate: todayInput(),
      branchId: user?.branchId ?? '',
      categoryId: '',
      expenseTypeId: '',
      description: '',
      vendor: '',
      referenceNo: '',
      quantity: 1,
      unit: '',
      unitPrice: 0,
      paymentMethod: 'CASH',
      paidDate: todayInput(),
      bankName: '',
      accountNo: '',
      transferDate: '',
      transferRef: '',
      remark: '',
    },
  })

  const categoryId = watch('categoryId')
  const paymentMethod = watch('paymentMethod')
  const quantity = watch('quantity')
  const unitPrice = watch('unitPrice')

  /** §8.4 — Amount = Quantity × Unit Price, shown live and never editable. */
  const amount = useMemo(() => {
    const q = Number(quantity) || 0
    const p = Number(unitPrice) || 0
    return Math.round(q * p * 100) / 100
  }, [quantity, unitPrice])

  const typeOptions = useMemo(() => {
    const category = categories?.find((c) => c.id === categoryId)
    return (category?.types ?? []).map((t) => ({ value: t.id, label: t.name }))
  }, [categories, categoryId])

  useEffect(() => {
    if (!expense) return
    reset({
      expenseDate: expense.expenseDate.slice(0, 10),
      branchId: expense.branchId,
      categoryId: expense.categoryId,
      expenseTypeId: expense.expenseTypeId ?? '',
      description: expense.description,
      vendor: expense.vendor ?? '',
      referenceNo: expense.referenceNo ?? '',
      quantity: expense.quantity,
      unit: expense.unit ?? '',
      unitPrice: expense.unitPrice,
      paymentMethod: expense.paymentMethod,
      paidDate: expense.paidDate?.slice(0, 10) ?? '',
      bankName: expense.bankName ?? '',
      accountNo: expense.accountNo ?? '',
      transferDate: expense.transferDate?.slice(0, 10) ?? '',
      transferRef: expense.transferRef ?? '',
      remark: expense.remark ?? '',
    })
  }, [expense, reset])

  // A changed category invalidates the dependent type.
  useEffect(() => {
    const current = watch('expenseTypeId')
    if (!current) return
    if (!typeOptions.some((o) => o.value === current)) {
      setValue('expenseTypeId', '')
    }
  }, [typeOptions, setValue, watch])

  const { dialog: guardDialog } = useDirtyGuard(isDirty && !isSubmitting)
  const { requestCancel, dialog: cancelDialog } = useCancelWithConfirm(
    isDirty,
    isEdit && id ? `/expenses/${id}` : '/expenses',
  )

  const submit = (status: 'DRAFT' | 'SUBMITTED') =>
    handleSubmit(async (values) => {
      try {
        /**
         * §8.4 — hidden conditional fields must not carry stale values through
         * to the API, so the branch that is *not* selected is cleared here.
         */
        const isTransfer = values.paymentMethod === 'BANK_TRANSFER'
        const saved = await save.mutateAsync({
          ...values,
          expenseTypeId: values.expenseTypeId || undefined,
          vendor: values.vendor || undefined,
          referenceNo: values.referenceNo || undefined,
          unit: values.unit || undefined,
          remark: values.remark || undefined,
          paidDate: isTransfer ? undefined : values.paidDate || undefined,
          bankName: isTransfer ? values.bankName : undefined,
          accountNo: isTransfer ? values.accountNo : undefined,
          transferDate: isTransfer ? values.transferDate : undefined,
          transferRef: isTransfer ? values.transferRef : undefined,
          status,
        })
        toast.success(
          status === 'DRAFT' ? 'บันทึกร่างแล้ว' : 'ส่งขออนุมัติแล้ว',
          `${saved.expenseNo} · ${formatCurrency(saved.amount)}`,
        )
        reset(values)
        navigate(`/expenses/${saved.id}`)
      } catch (err) {
        const details = fieldErrors(err)
        for (const [field, message] of Object.entries(details)) {
          setError(field as keyof ExpenseFormValues, { message })
        }
        if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
      }
    })

  if (isEdit && isPending) return <FullPageLoader label="กำลังโหลดรายการค่าใช้จ่าย..." />
  if (isEdit && error) return <ErrorState error={error} />
  if (isEdit && !can('expense:edit')) {
    return <InfoBanner tone="warning" title="ไม่มีสิทธิ์แก้ไข">บัญชีของคุณดูรายการได้อย่างเดียว</InfoBanner>
  }
  if (isEdit && expense && ['APPROVED', 'CANCELLED'].includes(expense.status)) {
    return (
      <InfoBanner tone="warning" title="แก้ไขไม่ได้">
        รายการที่อนุมัติหรือยกเลิกแล้วไม่สามารถแก้ไขได้
      </InfoBanner>
    )
  }

  const isTransfer = paymentMethod === 'BANK_TRANSFER'

  return (
    <form onSubmit={submit('SUBMITTED')} noValidate>
      <PageHeader
        title={isEdit ? `แก้ไข ${expense?.expenseNo ?? ''}` : 'บันทึกค่าใช้จ่าย'}
        subtitle="บัญชีและการเงิน"
        backTo={isEdit && id ? `/expenses/${id}` : '/expenses'}
        breadcrumb={[
          { label: 'บันทึกค่าใช้จ่าย', to: '/expenses' },
          { label: isEdit ? 'แก้ไข' : 'บันทึกใหม่' },
        ]}
        actions={
          <>
            <Button variant="ghost" onClick={requestCancel} disabled={isSubmitting}>
              ยกเลิก
            </Button>
            <Can permission="expense:create">
              <Button
                variant="ghost"
                iconLeft="file"
                loading={isSubmitting}
                onClick={() => void submit('DRAFT')()}
              >
                บันทึกร่าง
              </Button>
            </Can>
            <Button type="submit" variant="green" iconLeft="check" loading={isSubmitting}>
              ส่งขออนุมัติ
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-[18px]">
        {/* 1 — เอกสาร */}
        <FormSection step={1} title="ข้อมูลเอกสาร">
          <FormGrid columns={3}>
            <Field label="เลขที่เอกสาร">
              <Input
                readOnly
                value={expense?.expenseNo ?? 'ระบบออกให้อัตโนมัติเมื่อบันทึก'}
                className="text-ink-faint"
              />
            </Field>
            <Field label="วันที่" required error={errors.expenseDate?.message}>
              <DateInput {...register('expenseDate')} max={todayInput()} />
            </Field>
            <Field label="สาขา" required error={errors.branchId?.message}>
              <Select
                {...register('branchId')}
                value={watch('branchId')}
                placeholder="เลือกสาขา"
                options={branchOptions}
              />
            </Field>
            <Field label="ประเภทค่าใช้จ่าย" required error={errors.categoryId?.message}>
              <Select
                {...register('categoryId')}
                value={watch('categoryId')}
                disabled={categoriesPending}
                placeholder={categoriesPending ? 'กำลังโหลด...' : 'เลือกประเภท'}
                options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
              />
            </Field>
            <Field
              label="ประเภทย่อย"
              error={errors.expenseTypeId?.message}
              hint={!categoryId ? 'เลือกประเภทหลักก่อน' : undefined}
            >
              <Select
                {...register('expenseTypeId')}
                value={watch('expenseTypeId')}
                disabled={!categoryId || typeOptions.length === 0}
                placeholder={typeOptions.length === 0 ? 'ไม่มีประเภทย่อย' : 'เลือกประเภทย่อย'}
                options={typeOptions}
              />
            </Field>
          </FormGrid>
        </FormSection>

        {/* 2 — รายละเอียด + จำนวนเงิน */}
        <FormSection step={2} title="รายละเอียดและจำนวนเงิน">
          <FormGrid columns={3}>
            <FormRow span={3}>
              <Field label="รายละเอียด" required error={errors.description?.message}>
                <Textarea
                  {...register('description')}
                  rows={2}
                  placeholder="เช่น ค่าไฟฟ้าโรงเรือน งวดเดือนสิงหาคม 2569"
                />
              </Field>
            </FormRow>
            <Field label="ผู้ขาย / ผู้รับเงิน" error={errors.vendor?.message}>
              <Input {...register('vendor')} placeholder="การไฟฟ้าส่วนภูมิภาค" />
            </Field>
            <Field label="เลขที่อ้างอิง" error={errors.referenceNo?.message}>
              <Input {...register('referenceNo')} placeholder="INV-123456" />
            </Field>
            <div />

            <Field label="จำนวน" required error={errors.quantity?.message}>
              <NumberInput {...register('quantity', { valueAsNumber: true })} step="0.01" min={0} />
            </Field>
            <Field label="หน่วย" error={errors.unit?.message}>
              <Input {...register('unit')} placeholder="หน่วย / ลิตร / ก้อน" />
            </Field>
            <Field label="ราคาต่อหน่วย" required error={errors.unitPrice?.message}>
              <CurrencyInput {...register('unitPrice', { valueAsNumber: true })} />
            </Field>

            <FormRow span={3}>
              <ReadOnlyValue
                label="จำนวนเงินรวม (Amount)"
                value={formatCurrency(amount)}
                emphasis
                hint="คำนวณจาก จำนวน × ราคาต่อหน่วย — แก้ไขโดยตรงไม่ได้"
              />
            </FormRow>
          </FormGrid>
        </FormSection>

        {/* 3 — ชำระเงิน */}
        <FormSection
          step={3}
          title="การชำระเงิน"
          description="ช่องข้อมูลจะเปลี่ยนตามวิธีชำระเงินที่เลือก"
        >
          <div className="flex flex-col gap-5">
            <Field label="วิธีชำระเงิน" required error={errors.paymentMethod?.message}>
              <RadioGroup
                name="paymentMethod"
                variant="cards"
                value={paymentMethod}
                onChange={(v) =>
                  setValue('paymentMethod', v as 'CASH' | 'BANK_TRANSFER', { shouldDirty: true })
                }
                options={PAYMENT_METHODS}
              />
            </Field>

            {isTransfer ? (
              <FormGrid columns={4}>
                <Field label="ธนาคาร" required error={errors.bankName?.message}>
                  <Select {...register('bankName')}
                  value={watch('bankName')} placeholder="เลือกธนาคาร" options={bankOptions} />
                </Field>
                <Field label="เลขที่บัญชี" required error={errors.accountNo?.message}>
                  <Input {...register('accountNo')} inputMode="numeric" placeholder="123-4-56789-0" />
                </Field>
                <Field label="วันที่โอน" required error={errors.transferDate?.message}>
                  <DateInput {...register('transferDate')} />
                </Field>
                <Field label="เลขที่อ้างอิงการโอน" required error={errors.transferRef?.message}>
                  <Input {...register('transferRef')} placeholder="TRF1234567" />
                </Field>
              </FormGrid>
            ) : (
              <FormGrid columns={4}>
                <Field label="วันที่จ่าย" error={errors.paidDate?.message}>
                  <DateInput {...register('paidDate')} />
                </Field>
              </FormGrid>
            )}
          </div>
        </FormSection>

        {/* 4 — เอกสารแนบ */}
        <FormSection
          step={4}
          title="เอกสารแนบ"
          description="ใบเสร็จ / ใบแจ้งหนี้ / เอกสารประกอบ"
        >
          {isEdit && id ? (
            <FileUpload
              attachments={expense?.attachments ?? []}
              onUpload={(file, onProgress) => upload.mutateAsync({ file, onProgress })}
              onRemove={(attachmentId) => removeAttachment.mutateAsync(attachmentId)}
            />
          ) : (
            <InfoBanner tone="info" icon="info">
              บันทึกเอกสารก่อนหนึ่งครั้ง แล้วจึงแนบไฟล์ได้จากหน้ารายละเอียด
            </InfoBanner>
          )}
        </FormSection>

        {/* 5 — หมายเหตุ */}
        <FormSection step={5} title="หมายเหตุ">
          <Field label="หมายเหตุ" error={errors.remark?.message}>
            <Textarea {...register('remark')} rows={3} />
          </Field>
        </FormSection>
      </div>

      {guardDialog}
      {cancelDialog}
    </form>
  )
}
