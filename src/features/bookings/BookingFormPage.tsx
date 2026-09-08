import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { bookingSchema, type BookingFormValues } from '@/schemas'
import type { Option } from '@/types/common'
import { PageHeader } from '@/components/data-display/PageHeader'
import { Field, FormGrid, FormRow, FormSection } from '@/components/form/Field'
import { DateInput, Input, Textarea } from '@/components/form/Input'
import { AsyncSelect, Select } from '@/components/form/Select'
import { Button } from '@/components/ui/Button'
import { ErrorState, InfoBanner } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { FullPageLoader } from '@/features/auth/guards'
import { useCancelWithConfirm, useDirtyGuard } from '@/hooks/useDirtyGuard'
import { fieldErrors, toUserMessage } from '@/utils/errors'
import { addDaysInput, todayInput } from '@/utils/format'
import { services } from '@/services'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBranchOptions, useProjectOptions } from '@/features/master/hooks'
import { BookingItemsEditor } from './BookingItemsEditor'
import { useBatchOptions, useBooking, useSaveBooking, useSellableProducts } from './hooks'

/**
 * BOOK-002 — the booking as a two-part document.
 *
 * Header: who, where, which batch, when it is due.
 * Detail: the lines being ordered, priced from the product master. The line
 * total is what the backend carries forward to raise the farmer's debt.
 */
export function BookingFormPage({ mode }: Readonly<{ mode: 'create' | 'edit' }>) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, can } = useAuth()
  const isEdit = mode === 'edit'

  const { data: booking, isPending, error } = useBooking(isEdit ? id : undefined)
  const { data: products, isPending: productsPending } = useSellableProducts()
  const save = useSaveBooking(isEdit ? id : undefined)
  const [farmerOption, setFarmerOption] = useState<Option | null>(null)
  const { options: branchOptions } = useBranchOptions()
  const { options: projectOptions } = useProjectOptions()

  const {
    register,
    handleSubmit,
    control,
    reset,
    setError,
    setValue,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      bookingDate: todayInput(),
      farmerId: '',
      branchId: user?.branchId ?? '',
      projectId: '',
      batchNo: '',
      hatchDate: '',
      expectedDeliveryDate: addDaysInput(todayInput(), 21),
      items: [],
      remark: '',
    },
  })

  const items = watch('items')

  /**
   * §7.4 — the batch list depends on the breed, which now comes from whichever
   * EGG line was added to the document.
   */
  const breedId = useMemo(() => {
    const egg = items
      .map((line) => products?.find((p) => p.id === line.productId))
      .find((p) => p?.kind === 'EGG')
    return egg?.breedId ?? ''
  }, [items, products])

  const { data: batchOptions, isFetching: batchesLoading } = useBatchOptions(breedId)

  useEffect(() => {
    if (!booking) return
    reset({
      bookingDate: booking.bookingDate.slice(0, 10),
      farmerId: booking.farmerId,
      branchId: booking.branchId,
      projectId: booking.projectId ?? '',
      batchNo: booking.batchNo,
      hatchDate: booking.hatchDate?.slice(0, 10) ?? '',
      expectedDeliveryDate: booking.expectedDeliveryDate.slice(0, 10),
      items: booking.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      remark: booking.remark ?? '',
    })
    setFarmerOption({
      value: booking.farmerId,
      label: booking.farmerName,
      description: booking.farmerCode,
    })
  }, [booking, reset])

  // A batch that no longer belongs to the chosen breed must not be submitted.
  useEffect(() => {
    const current = watch('batchNo')
    if (!current || !batchOptions) return
    if (!batchOptions.some((o) => o.value === current)) {
      setValue('batchNo', '', { shouldValidate: false })
    }
  }, [batchOptions, setValue, watch])

  const { dialog: guardDialog } = useDirtyGuard(isDirty && !isSubmitting)
  const { requestCancel, dialog: cancelDialog } = useCancelWithConfirm(
    isDirty,
    isEdit && id ? `/bookings/${id}` : '/bookings',
  )

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        ...values,
        projectId: values.projectId || undefined,
        hatchDate: values.hatchDate || undefined,
        remark: values.remark || undefined,
      })
      toast.success(isEdit ? 'บันทึกการแก้ไขแล้ว' : 'สร้างใบจองแล้ว', saved.bookingNo)
      reset(values)
      navigate(`/bookings/${saved.id}`)
    } catch (err) {
      const details = fieldErrors(err)
      for (const [field, message] of Object.entries(details)) {
        setError(field as keyof BookingFormValues, { message })
      }
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  })

  if (isEdit && isPending) return <FullPageLoader label="กำลังโหลดใบจอง..." />
  if (isEdit && error) return <ErrorState error={error} />
  if (isEdit && !can('booking:edit')) {
    return <InfoBanner tone="warning" title="ไม่มีสิทธิ์แก้ไข">บัญชีของคุณดูใบจองได้อย่างเดียว</InfoBanner>
  }
  if (isEdit && booking?.status === 'CANCELLED') {
    return (
      <InfoBanner tone="warning" title="ใบจองถูกยกเลิกแล้ว">
        ใบจองที่ยกเลิกแล้วไม่สามารถแก้ไขได้
      </InfoBanner>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title={isEdit ? `แก้ไขใบจอง ${booking?.bookingNo ?? ''}` : 'สร้างใบจองไข่ไหม'}
        subtitle="จองไข่ไหม"
        backTo={isEdit && id ? `/bookings/${id}` : '/bookings'}
        breadcrumb={[
          { label: 'จองไข่ไหม', to: '/bookings' },
          { label: isEdit ? 'แก้ไข' : 'สร้างใหม่' },
        ]}
        actions={
          <>
            <Button variant="ghost" onClick={requestCancel} disabled={isSubmitting}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="green" iconLeft="check" loading={isSubmitting}>
              {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกใบจอง'}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-[18px]">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <FormSection step={1} title="ข้อมูลเอกสาร">
          <FormGrid columns={3}>
            <Field label="เลขที่ใบจอง">
              <Input
                readOnly
                value={booking?.bookingNo ?? 'ระบบออกให้อัตโนมัติเมื่อบันทึก'}
                className="text-ink-faint"
              />
            </Field>
            <Field label="วันที่จอง" required error={errors.bookingDate?.message}>
              <DateInput {...register('bookingDate')} />
            </Field>
            <Field label="สาขา" required error={errors.branchId?.message}>
              <Select
                {...register('branchId')}
                value={watch('branchId')}
                placeholder="เลือกสาขา"
                options={branchOptions}
              />
            </Field>

            <FormRow span={2}>
              <Field label="เกษตรกร" required error={errors.farmerId?.message}>
                <Controller
                  control={control}
                  name="farmerId"
                  render={({ field }) => (
                    <AsyncSelect
                      value={field.value}
                      selectedOption={farmerOption}
                      loadOptions={services.farmers.search}
                      placeholder="พิมพ์ชื่อหรือรหัสเกษตรกร"
                      onChange={(value, option) => {
                        field.onChange(value)
                        setFarmerOption(option)
                      }}
                    />
                  )}
                />
              </Field>
            </FormRow>
            <Field label="โครงการ" error={errors.projectId?.message}>
              <Select {...register('projectId')}
                value={watch('projectId')} placeholder="ไม่ระบุ" options={projectOptions} />
            </Field>

            <Field
              label="รุ่น"
              required
              error={errors.batchNo?.message}
              hint={!breedId ? 'เพิ่มรายการไข่ไหมก่อน' : undefined}
            >
              <Select
                {...register('batchNo')}
                value={watch('batchNo')}
                disabled={!breedId || batchesLoading}
                placeholder={batchesLoading ? 'กำลังโหลด...' : 'เลือกรุ่น'}
                options={batchOptions ?? []}
              />
            </Field>
            <Field label="รุ่นฟัก" error={errors.hatchDate?.message}>
              <DateInput {...register('hatchDate')} />
            </Field>
            <Field label="กำหนดส่งมอบ" required error={errors.expectedDeliveryDate?.message}>
              <DateInput {...register('expectedDeliveryDate')} />
            </Field>
          </FormGrid>
        </FormSection>

        {/* ── Detail ────────────────────────────────────────────────────── */}
        <FormSection
          step={2}
          title="รายการจอง"
          description="เลือกรายการ ใส่จำนวน แล้วกดเพิ่ม — ราคาดึงจากข้อมูลหลักสินค้า"
        >
          <Controller
            control={control}
            name="items"
            render={({ field }) => (
              <BookingItemsEditor
                lines={field.value}
                products={products ?? []}
                loading={productsPending}
                error={errors.items?.message}
                onChange={field.onChange}
              />
            )}
          />
        </FormSection>

        <FormSection step={3} title="หมายเหตุ">
          <Field label="หมายเหตุ" error={errors.remark?.message}>
            <Textarea {...register('remark')} rows={3} placeholder="เช่น ขอรับที่สาขาเช้าวันเสาร์" />
          </Field>
        </FormSection>
      </div>

      {guardDialog}
      {cancelDialog}
    </form>
  )
}
