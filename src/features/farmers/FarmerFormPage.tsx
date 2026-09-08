import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FARMER_STATUS } from '@/constants'
import { farmerSchema, type FarmerFormValues } from '@/schemas'
import { PageHeader } from '@/components/data-display/PageHeader'
import { Field, FormGrid, FormRow, FormSection } from '@/components/form/Field'
import { Input } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { Checkbox } from '@/components/form/Choice'
import { Button } from '@/components/ui/Button'
import { ErrorState, InfoBanner } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { FullPageLoader } from '@/features/auth/guards'
import { useCancelWithConfirm, useDirtyGuard } from '@/hooks/useDirtyGuard'
import { fieldErrors, toUserMessage } from '@/utils/errors'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBranchOptions } from '@/features/master/hooks'
import { useFarmer, useSaveFarmer } from './hooks'

const EMPTY: FarmerFormValues = {
  code: '',
  firstName: '',
  lastName: '',
  nationalId: '',
  phone: '',
  address: '',
  subDistrict: '',
  district: '',
  province: '',
  branchId: '',
  status: 'ACTIVE',
  programs: { julUamJai: false, debtRelief: false, guaranteedGoodPrice: false },
}

/** FAR-002 — create / edit with schema validation and a dirty guard. */
export function FarmerFormPage({ mode }: Readonly<{ mode: 'create' | 'edit' }>) {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, can } = useAuth()
  const isEdit = mode === 'edit'

  const { data: farmer, isPending, error } = useFarmer(isEdit ? id : undefined)
  const save = useSaveFarmer(isEdit ? id : undefined)
  const { options: branchOptions } = useBranchOptions()

  const form = useForm<FarmerFormValues>({
    resolver: zodResolver(farmerSchema),
    defaultValues: { ...EMPTY, branchId: user?.branchId ?? '' },
  })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = form

  useEffect(() => {
    if (!farmer) return
    reset({
      code: farmer.code,
      firstName: farmer.firstName,
      lastName: farmer.lastName,
      nationalId: farmer.nationalId ?? '',
      phone: farmer.phone ?? '',
      address: farmer.address ?? '',
      subDistrict: farmer.subDistrict ?? '',
      district: farmer.district ?? '',
      province: farmer.province ?? '',
      branchId: farmer.branchId,
      status: farmer.status,
      programs: farmer.programs,
    })
  }, [farmer, reset])

  const { dialog: guardDialog } = useDirtyGuard(isDirty && !isSubmitting)
  const { requestCancel, dialog: cancelDialog } = useCancelWithConfirm(
    isDirty,
    isEdit && id ? `/farmers/${id}` : '/farmers',
  )

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await save.mutateAsync({
        ...values,
        nationalId: values.nationalId || undefined,
        phone: values.phone || undefined,
      })
      toast.success(
        isEdit ? 'บันทึกการแก้ไขแล้ว' : 'เพิ่มเกษตรกรใหม่แล้ว',
        `${saved.fullName} · ${saved.code}`,
      )
      reset(values)
      navigate(`/farmers/${saved.id}`)
    } catch (err) {
      const details = fieldErrors(err)
      for (const [field, message] of Object.entries(details)) {
        setError(field as keyof FarmerFormValues, { message })
      }
      if (Object.keys(details).length === 0) {
        toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
      }
    }
  })

  if (isEdit && isPending) return <FullPageLoader label="กำลังโหลดข้อมูลเกษตรกร..." />
  if (isEdit && error) return <ErrorState error={error} />
  if (isEdit && !can('farmer:edit')) {
    return <InfoBanner tone="warning" title="ไม่มีสิทธิ์แก้ไข">บัญชีของคุณดูข้อมูลได้อย่างเดียว</InfoBanner>
  }

  const programs = watch('programs')

  return (
    <form onSubmit={onSubmit} noValidate>
      <PageHeader
        title={isEdit ? `แก้ไข: ${farmer?.fullName ?? ''}` : 'เพิ่มเกษตรกรใหม่'}
        subtitle="ส่งเสริมเกษตรกร"
        backTo={isEdit && id ? `/farmers/${id}` : '/farmers'}
        breadcrumb={[
          { label: 'ส่งเสริมเกษตรกร', to: '/farmers' },
          { label: isEdit ? 'แก้ไข' : 'เพิ่มใหม่' },
        ]}
        actions={
          <>
            <Button variant="ghost" onClick={requestCancel} disabled={isSubmitting}>
              ยกเลิก
            </Button>
            <Button type="submit" variant="green" iconLeft="check" loading={isSubmitting}>
              {isEdit ? 'บันทึกการแก้ไข' : 'บันทึกเกษตรกร'}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-[18px]">
        <FormSection step={1} title="ข้อมูลเกษตรกร">
          <FormGrid columns={3}>
            <Field label="รหัสเกษตรกร" required error={errors.code?.message} hint="ตัวเลข 5–10 หลัก ตามใบรับรังไหม">
              <Input {...register('code')} placeholder="3606609" inputMode="numeric" />
            </Field>
            <Field label="ชื่อ" required error={errors.firstName?.message}>
              <Input {...register('firstName')} placeholder="ทรงกรด" />
            </Field>
            <Field label="นามสกุล" required error={errors.lastName?.message}>
              <Input {...register('lastName')} placeholder="บัวหลวง" />
            </Field>

            <Field
              label="เลขบัตรประชาชน"
              error={errors.nationalId?.message}
              hint="ข้อมูลอ่อนไหว — แสดงเฉพาะผู้มีสิทธิ์"
            >
              <Input {...register('nationalId')} inputMode="numeric" maxLength={13} />
            </Field>
            <Field label="เบอร์โทรศัพท์" error={errors.phone?.message}>
              <Input {...register('phone')} inputMode="tel" placeholder="0812345678" />
            </Field>
            <Field label="สาขา" required error={errors.branchId?.message}>
              <Select
                {...register('branchId')}
                value={watch('branchId')}
                placeholder="เลือกสาขา"
                options={branchOptions}
              />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection step={2} title="ที่อยู่">
          <FormGrid columns={4}>
            <FormRow span={2}>
              <Field label="บ้านเลขที่ / หมู่" error={errors.address?.message}>
                <Input {...register('address')} placeholder="128 หมู่ 4" />
              </Field>
            </FormRow>
            <Field label="ตำบล" error={errors.subDistrict?.message}>
              <Input {...register('subDistrict')} />
            </Field>
            <Field label="อำเภอ" error={errors.district?.message}>
              <Input {...register('district')} />
            </Field>
            <Field label="จังหวัด" error={errors.province?.message}>
              <Input {...register('province')} />
            </Field>
          </FormGrid>
        </FormSection>

        <FormSection
          step={3}
          title="สถานะและโครงการ"
          description="โครงการที่ติ๊กไว้จะถูกดึงมาเป็นค่าตั้งต้นในหน้าคัดคุณภาพ"
        >
          <FormGrid columns={2}>
            <Field label="สถานะ" required error={errors.status?.message}>
              <Select
                {...register('status')}
                value={watch('status')}
                placeholder="เลือกสถานะ"
                options={Object.entries(FARMER_STATUS).map(([value, meta]) => ({
                  value,
                  label: meta.label,
                }))}
              />
            </Field>
            <FormRow>
              <span className="mb-1.5 block text-[.78rem] font-semibold uppercase tracking-[.2px] text-ink-dim">
                โครงการที่เข้าร่วม
              </span>
              <div className="grid gap-2 sm:grid-cols-1">
                <Checkbox
                  emphasis
                  label="ไหมจุลอุ่นใจ"
                  checked={programs.julUamJai}
                  onChange={(e) => setValue('programs.julUamJai', e.target.checked, { shouldDirty: true })}
                />
                <Checkbox
                  emphasis
                  label="บรรเทาหนี้"
                  checked={programs.debtRelief}
                  onChange={(e) => setValue('programs.debtRelief', e.target.checked, { shouldDirty: true })}
                />
                <Checkbox
                  emphasis
                  label="ประกันราคารังดี 200 บาท/กก."
                  description="อัตราประกันตั้งค่าได้ที่ ตั้งค่าระบบ → โครงการ"
                  checked={programs.guaranteedGoodPrice}
                  onChange={(e) =>
                    setValue('programs.guaranteedGoodPrice', e.target.checked, { shouldDirty: true })
                  }
                />
              </div>
            </FormRow>
          </FormGrid>
        </FormSection>
      </div>

      {guardDialog}
      {cancelDialog}
    </form>
  )
}
