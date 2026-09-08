import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { cn } from '@/utils/cn'
import { COCOON_QTY_UNIT, QUEUE_STATUS } from '@/constants'
import { qualitySchema, queueSchema, type QualityFormValues, type QueueFormValues } from '@/schemas'
import type { FarmerRound } from '@/services/api/contracts'
import type { Option } from '@/types/common'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/data-display/PageHeader'
import { SummaryCard } from '@/components/data-display/KpiCard'
import { Field, FormGrid, FormRow, FormSection } from '@/components/form/Field'
import { Input, NumberInput, Textarea } from '@/components/form/Input'
import { AsyncSelect, Select } from '@/components/form/Select'
import { Checkbox, CheckboxRow, LockedNotice, RadioGroup } from '@/components/form/Choice'
import { ErrorState, InfoBanner } from '@/components/feedback/States'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { useToast } from '@/components/feedback/Toast'
import { Can, FullPageLoader } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { useDirtyGuard } from '@/hooks/useDirtyGuard'
import { formatDateTH, formatNumber } from '@/utils/format'
import { fieldErrors, toUserMessage } from '@/utils/errors'
import { services } from '@/services'
import { useBranchOptions } from '@/features/master/hooks'
import { useFarmerRounds } from '@/features/bookings/hooks'
import { useQuality, useQualityActions, useQueueActions, useTicket } from './hooks'

/**
 * จุดคัดแยก — the ใบคิว as it exists on paper.
 *
 * This is the *first* station: the slip is written here, the queue number is
 * assigned when it is issued, and only then does the farmer carry the cocoons
 * to the scale. Layout follows the printed form top to bottom — header,
 * the six cocoon grades, then the footer tick-boxes.
 */
const COCOON_FIELDS: { name: keyof QualityFormValues; label: string }[] = [
  { name: 'goodCocoonQty', label: '1. รังดี' },
  { name: 'afterScreenQty', label: '2. รังหลังจ่อ' },
  { name: 'damagedCocoonQty', label: '3. รังเสีย' },
  { name: 'doubleCocoonQty', label: '4. รังแฝด' },
  { name: 'thinCocoonQty', label: '5. รังบาง' },
  { name: 'flossQty', label: '6. ปุยไหม' },
]

const EMPTY_QUALITY: QualityFormValues = {
  goodCocoonQty: 0,
  afterScreenQty: 0,
  damagedCocoonQty: 0,
  doubleCocoonQty: 0,
  thinCocoonQty: 0,
  flossQty: 0,
  dryingLevel: undefined,
  deadSilkworm: false,
  notDegummed: false,
  guaranteedGoodPrice: false,
  debtRelief: false,
  julUamJai: false,
  moisturePercent: undefined,
  remark: '',
}

export function SortingSlipPage({ mode }: Readonly<{ mode: 'create' | 'edit' }>) {
  const { queueId } = useParams<{ queueId: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const isEdit = mode === 'edit'

  const { data: ticket, isPending: ticketPending, error: ticketError } = useTicket(
    isEdit ? queueId : undefined,
  )
  const { data: quality, isPending: qualityPending } = useQuality(isEdit ? queueId : undefined)
  const { create, update, issue } = useQueueActions()
  const { save } = useQualityActions(queueId ?? '')

  const [farmerOption, setFarmerOption] = useState<Option | null>(null)
  const [confirmIssue, setConfirmIssue] = useState(false)
  const { options: branchOptions } = useBranchOptions()

  const header = useForm<QueueFormValues>({
    resolver: zodResolver(queueSchema),
    defaultValues: {
      farmerId: '',
      branchId: user?.branchId ?? '',
      bookingId: '',
      remark: '',
    },
  })

  const detail = useForm<QualityFormValues>({
    resolver: zodResolver(qualitySchema),
    defaultValues: EMPTY_QUALITY,
  })

  useEffect(() => {
    if (!ticket) return
    header.reset({
      farmerId: ticket.farmerId,
      branchId: ticket.branchId,
      bookingId: ticket.bookingId ?? '',
      splitFromBoxes: ticket.splitFromBoxes,
      remark: ticket.remark ?? '',
    })
    setFarmerOption({
      value: ticket.farmerId,
      label: ticket.farmerName,
      description: ticket.farmerCode,
    })
  }, [ticket, header])

  useEffect(() => {
    if (!quality) return
    detail.reset({
      goodCocoonQty: quality.goodCocoonQty,
      afterScreenQty: quality.afterScreenQty,
      damagedCocoonQty: quality.damagedCocoonQty,
      doubleCocoonQty: quality.doubleCocoonQty,
      thinCocoonQty: quality.thinCocoonQty,
      flossQty: quality.flossQty,
      dryingLevel: quality.dryingLevel,
      deadSilkworm: quality.deadSilkworm ?? false,
      notDegummed: quality.notDegummed ?? false,
      guaranteedGoodPrice: quality.guaranteedGoodPrice ?? false,
      debtRelief: quality.debtRelief ?? false,
      julUamJai: quality.julUamJai ?? false,
      moisturePercent: quality.moisturePercent,
      remark: quality.remark ?? '',
    })
  }, [quality, detail])

  const headerValues = header.watch()
  const { data: allRounds, isPending: roundsPending } = useFarmerRounds(
    headerValues.farmerId || undefined,
    ticket?.bookingId,
  )
  const rounds = useMemo(() => (allRounds ?? []).filter((r) => r.eligible), [allRounds])
  /** Everything on the header below comes from this round. */
  const round = rounds.find((r) => r.booking.id === headerValues.bookingId)?.booking

  // One eligible round is the common case, so pick it rather than making the
  // counter choose from a list of one.
  useEffect(() => {
    if (rounds.length === 1 && !headerValues.bookingId) {
      header.setValue('bookingId', rounds[0].booking.id, { shouldValidate: true })
    }
  }, [rounds, headerValues.bookingId, header])

  const values = detail.watch()
  const issued = ticket?.queueNo != null
  const cancelled = ticket?.status === 'CANCELLED'
  const readOnly = issued || cancelled

  const dirty = header.formState.isDirty || detail.formState.isDirty
  const { dialog: guardDialog } = useDirtyGuard(dirty && !readOnly)

  const totalQty = COCOON_FIELDS.reduce((sum, f) => sum + (Number(values[f.name]) || 0), 0)
  const goodShare = totalQty > 0 ? ((Number(values.goodCocoonQty) || 0) / totalQty) * 100 : 0

  const farmerCode = farmerOption?.description ?? ticket?.farmerCode ?? '—'
  const branchName = useMemo(
    () => branchOptions.find((b) => b.value === headerValues.branchId)?.label ?? '—',
    [branchOptions, headerValues.branchId],
  )

  /** Persists the header and the sorting detail together. */
  const saveSlip = async (): Promise<string | null> => {
    const headerOk = await header.trigger()
    if (!headerOk) {
      toast.error('กรอกหัวใบคิวให้ครบก่อน')
      return null
    }
    const h = header.getValues()
    const payload = {
      farmerId: h.farmerId,
      branchId: h.branchId,
      bookingId: h.bookingId,
      splitFromBoxes: h.splitFromBoxes,
      remark: h.remark || undefined,
    }

    try {
      const saved = isEdit && queueId
        ? await update.mutateAsync({ queueId, payload })
        : await create.mutateAsync(payload)

      // The detail section needs a slip id, so it is written second.
      await services.receiving.saveQuality(saved.id, {
        ...detail.getValues(),
        queueId: saved.id,
      } as never)

      header.reset(h)
      detail.reset(detail.getValues())
      return saved.id
    } catch (err) {
      const details = fieldErrors(err)
      for (const [field, message] of Object.entries(details)) {
        header.setError(field as keyof QueueFormValues, { message })
      }
      if (Object.keys(details).length === 0) toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
      return null
    }
  }

  const onSaveDraft = async () => {
    const id = await saveSlip()
    if (!id) return
    toast.success('บันทึกใบคิวแล้ว', 'ยังแก้ไขได้จนกว่าจะกดออกใบคิว')
    if (!isEdit) navigate(`/receiving/sorting/${id}`, { replace: true })
  }

  const onIssue = async () => {
    const detailOk = await detail.trigger()
    if (!detailOk) {
      setConfirmIssue(false)
      toast.error('กรอกจำนวนรังไหมก่อนออกใบคิว', 'ต้องระบุอย่างน้อย 1 ประเภท')
      return
    }
    const id = await saveSlip()
    if (!id) {
      setConfirmIssue(false)
      return
    }
    try {
      const result = await issue.mutateAsync(id)
      toast.success(`ออกใบคิวหมายเลข ${result.queueNo}`, `${result.farmerName} — ส่งต่อจุดชั่งน้ำหนัก`)
      setConfirmIssue(false)
      navigate(`/receiving/sorting/${id}`, { replace: true })
    } catch (err) {
      setConfirmIssue(false)
      toast.error('ออกใบคิวไม่สำเร็จ', toUserMessage(err))
    }
  }

  if (isEdit && (ticketPending || qualityPending)) {
    return <FullPageLoader label="กำลังโหลดใบคิว..." />
  }
  if (isEdit && ticketError) return <ErrorState error={ticketError} />

  const busy = create.isPending || update.isPending || save.isPending || issue.isPending

  return (
    <>
      <PageHeader
        title={issued ? `ใบคิว ${ticket?.queueNo}` : 'ออกใบคิวรับซื้อ'}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>จุดคัดแยก</span>
            {ticket && <StatusBadge status={QUEUE_STATUS[ticket.status]} />}
            {issued && (
              <span className="text-ink-faint">· ออกใบเมื่อ {formatDateTH(ticket?.issuedAt)}</span>
            )}
          </span>
        }
        backTo="/receiving/sorting"
        breadcrumb={[
          { label: 'จุดคัดแยก', to: '/receiving/sorting' },
          { label: issued ? `คิว ${ticket?.queueNo}` : 'ออกใบคิวใหม่' },
        ]}
        actions={
          !readOnly && (
            <Can permission="queue:create">
              <Button variant="ghost" iconLeft="file" loading={busy} onClick={() => void onSaveDraft()}>
                บันทึกร่าง
              </Button>
              <Button
                variant="green"
                iconLeft="check"
                disabled={totalQty <= 0}
                onClick={() => setConfirmIssue(true)}
              >
                ออกใบคิว
              </Button>
            </Can>
          )
        }
      />

      {issued && (
        <LockedNotice>
          ใบคิวถูกออกแล้ว (คิว {ticket?.queueNo}) — ข้อมูลคัดแยกถูกล็อก
          เกษตรกรนำรังไหมไปที่จุดชั่งน้ำหนักได้เลย
        </LockedNotice>
      )}

      <div className={cn('grid gap-[18px] lg:grid-cols-12', issued && 'mt-4')}>
        <div className="flex flex-col gap-[18px] lg:col-span-8">
          {/* ── Header — matches the top block of the paper slip ─────────── */}
          <FormSection step={1} title="หัวใบคิว" description="ข้อมูลเกษตรกรและไข่ไหมที่จองไป">
            <FormGrid columns={3}>
              <FormRow span={2}>
                <Field label="ชื่อเกษตรกร" required error={header.formState.errors.farmerId?.message}>
                  <Controller
                    control={header.control}
                    name="farmerId"
                    render={({ field }) => (
                      <AsyncSelect
                        value={field.value}
                        selectedOption={farmerOption}
                        loadOptions={services.farmers.search}
                        placeholder="พิมพ์ชื่อหรือรหัสเกษตรกร"
                        disabled={readOnly}
                        onChange={(value, option) => {
                          field.onChange(value)
                          setFarmerOption(option)
                        }}
                      />
                    )}
                  />
                </Field>
              </FormRow>
              <Field label="รหัสเกษตรกร">
                <Input readOnly value={farmerCode} className="dash-num" />
              </Field>

              <Field
                label="สาขา (จุดรับซื้อ)"
                required
                error={header.formState.errors.branchId?.message}
              >
                <Select
                  {...header.register('branchId')}
                  value={headerValues.branchId}
                  disabled={readOnly}
                  placeholder="เลือกจุดรับซื้อ"
                  options={branchOptions}
                />
              </Field>

              {/*
                The round is the only thing chosen here. สายพันธุ์ · โครงการ ·
                รุ่นฟัก · จำนวนไข่ไหมที่จองไป all describe what the farmer was
                actually delivered, so they are read back from it.
              */}
              <FormRow span={2}>
                <Field
                  label="รอบที่รับไข่ไหมไป"
                  required
                  error={header.formState.errors.bookingId?.message}
                  hint={
                    headerValues.farmerId
                      ? 'เฉพาะรอบที่เจ้าหน้าที่ส่งเสริมบันทึกส่งของแล้ว และยังไม่มีใบคิว'
                      : 'เลือกเกษตรกรก่อน'
                  }
                >
                  <Select
                    {...header.register('bookingId')}
                    value={headerValues.bookingId}
                    disabled={readOnly || !headerValues.farmerId || roundsPending}
                    placeholder={
                      !headerValues.farmerId
                        ? 'เลือกเกษตรกรก่อน'
                        : roundsPending
                          ? 'กำลังค้นหารอบ...'
                          : 'เลือกรอบ'
                    }
                    options={rounds.map(({ booking }) => ({
                      value: booking.id,
                      label: `${booking.batchNo} · ${booking.bookingNo}`,
                      description: `${booking.breedName ?? '—'} · ส่งของ ${formatDateTH(
                        booking.delivery?.deliveredAt,
                      )} · ${formatNumber(booking.quantity, 1)} กล่อง`,
                    }))}
                  />
                </Field>
              </FormRow>

              <Field label="สายพันธุ์" hint="จากรอบที่รับไป">
                <Input readOnly value={round?.breedName ?? '—'} />
              </Field>
              <Field label="รุ่นฟัก" hint="จากรอบที่รับไป">
                <Input readOnly value={formatDateTH(round?.hatchDate)} className="dash-num" />
              </Field>
              <Field label="จำนวนไข่ไหมที่จองไป" hint="ตามจำนวนที่ส่งจริง">
                <Input
                  readOnly
                  className="dash-num"
                  value={round ? `${formatNumber(round.quantity, 1)} กล่อง` : '—'}
                />
              </Field>
              <Field label="โครงการ" hint="ประเภทไข่ไหมที่จองไป เช่น ไหมจุลอุ่นใจ">
                <Input readOnly value={round?.projectName ?? 'ไม่ระบุ'} />
              </Field>
              <Field
                label="แบ่งไหมจาก"
                error={header.formState.errors.splitFromBoxes?.message}
                hint="กรณีแบ่งไข่ไหมมาจากเกษตรกรรายอื่น"
              >
                <NumberInput
                  {...header.register('splitFromBoxes', {
                    setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                  })}
                  step="0.5"
                  min={0}
                  unit="กล่อง"
                  readOnly={readOnly}
                />
              </Field>
            </FormGrid>

            {headerValues.farmerId && !roundsPending && rounds.length === 0 && (
              <NoRoundNotice rounds={allRounds ?? []} />
            )}

            {round?.delivery && (
              <div className="mt-4 rounded border border-line bg-sunken px-4 py-3">
                <p className="mb-2 flex items-center gap-1.5 text-[.82rem] font-semibold text-ink">
                  <Icon name="truck" size={14} className="text-forest" />
                  ของที่รับไปในรอบ {round.batchNo} — ตั้งหนี้{' '}
                  <span className="dash-num">
                    ฿{round.delivery.totalAmount.toLocaleString('th-TH')}
                  </span>
                </p>
                <ul className="flex flex-wrap gap-x-5 gap-y-1 text-[.78rem] text-ink-dim">
                  {round.delivery.items.map((item) => (
                    <li key={item.bookingItemId}>
                      {item.productName}{' '}
                      <strong className="dash-num text-ink">
                        {formatNumber(item.quantity, item.quantity % 1 === 0 ? 0 : 2)}
                      </strong>{' '}
                      {item.unitName}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </FormSection>

          {/* ── Detail — the six cocoon grades, unit ถุง ──────────────────── */}
          <FormSection
            step={2}
            title="ผลคัดแยกรังไหมสด"
            description={`หน่วยนับตามใบรับ: ${COCOON_QTY_UNIT} (การแปลงเป็นกิโลกรัมรอยืนยันจากฝ่ายผลิต)`}
          >
            <FormGrid columns={3}>
              {COCOON_FIELDS.map((f) => (
                <Field
                  key={f.name}
                  label={f.label}
                  error={detail.formState.errors[f.name]?.message as string | undefined}
                >
                  <NumberInput
                    {...detail.register(f.name, { valueAsNumber: true })}
                    emphasis
                    step="1"
                    min={0}
                    unit={COCOON_QTY_UNIT}
                    readOnly={readOnly}
                  />
                </Field>
              ))}
            </FormGrid>
          </FormSection>

          {/* ── Footer — the printed tick-boxes ──────────────────────────── */}
          <FormSection step={3} title="ส่วนท้ายใบคิว">
            <div className="flex flex-col gap-5">
              <CheckboxRow title="ตากดักแด้">
                <RadioGroup
                  name="dryingLevel"
                  variant="ticks"
                  disabled={readOnly}
                  value={values.dryingLevel}
                  onChange={(v) =>
                    detail.setValue('dryingLevel', v as 'OLD' | 'MEDIUM', { shouldDirty: true })
                  }
                  options={[
                    { value: 'OLD', label: 'แก่' },
                    { value: 'MEDIUM', label: 'กลาง' },
                  ]}
                />
              </CheckboxRow>

              <CheckboxRow title="คุณภาพรังไหม">
                <Checkbox
                  label="ไหมตาย"
                  disabled={readOnly}
                  checked={values.deadSilkworm ?? false}
                  onChange={(e) =>
                    detail.setValue('deadSilkworm', e.target.checked, { shouldDirty: true })
                  }
                />
                <Checkbox
                  label="ไม่ลอกปุย"
                  disabled={readOnly}
                  checked={values.notDegummed ?? false}
                  onChange={(e) =>
                    detail.setValue('notDegummed', e.target.checked, { shouldDirty: true })
                  }
                />
              </CheckboxRow>

              <FormGrid columns={3}>
                <Field
                  label="ความชื้น"
                  error={detail.formState.errors.moisturePercent?.message}
                  hint="ช่วงที่รับได้ตั้งค่าที่ ตั้งค่าระบบ → คุณภาพ"
                >
                  <NumberInput
                    {...detail.register('moisturePercent', {
                      setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                    })}
                    emphasis
                    step="0.1"
                    min={0}
                    max={100}
                    unit="%"
                    readOnly={readOnly}
                  />
                </Field>
              </FormGrid>

              <div className="grid gap-2.5 sm:grid-cols-3">
                <Checkbox
                  emphasis
                  label="ประกันราคารังดี 200 บาท/กก."
                  disabled={readOnly}
                  checked={values.guaranteedGoodPrice ?? false}
                  onChange={(e) =>
                    detail.setValue('guaranteedGoodPrice', e.target.checked, { shouldDirty: true })
                  }
                />
                <Checkbox
                  emphasis
                  label="บรรเทาหนี้"
                  disabled={readOnly}
                  checked={values.debtRelief ?? false}
                  onChange={(e) =>
                    detail.setValue('debtRelief', e.target.checked, { shouldDirty: true })
                  }
                />
                <Checkbox
                  emphasis
                  label="ไหมจุล-อุ่นใจ"
                  disabled={readOnly}
                  checked={values.julUamJai ?? false}
                  onChange={(e) =>
                    detail.setValue('julUamJai', e.target.checked, { shouldDirty: true })
                  }
                />
              </div>

              <Field label="หมายเหตุ" error={detail.formState.errors.remark?.message}>
                <Textarea {...detail.register('remark')} rows={2} readOnly={readOnly} />
              </Field>
            </div>
          </FormSection>
        </div>

        {/* ── Live preview of the slip ──────────────────────────────────── */}
        <div className="lg:col-span-4">
          <Card className="lg:sticky lg:top-[calc(var(--topbar-h)+1.5rem)]">
            <CardHeader
              title={issued ? `คิวหมายเลข ${ticket?.queueNo}` : 'ตัวอย่างใบคิว'}
              icon="file"
              iconClassName="bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
            />
            <div className="flex flex-col gap-3 px-[22px] py-5">
              {issued ? (
                <div className="rounded-lg bg-[color:var(--accent-soft)] py-5 text-center">
                  <p className="text-[.72rem] font-bold uppercase tracking-[.5px] text-ink-dim">
                    เลขคิว
                  </p>
                  <p className="dash-num text-[3.2rem] font-bold leading-none text-[color:var(--accent)]">
                    {ticket?.queueNo}
                  </p>
                </div>
              ) : (
                <InfoBanner tone="info" icon="info">
                  เลขคิวจะออกให้อัตโนมัติเมื่อกด &ldquo;ออกใบคิว&rdquo;
                </InfoBanner>
              )}

              <SummaryCard label="เกษตรกร" value={farmerOption?.label ?? '—'} />
              <SummaryCard label="จุดรับซื้อ" value={branchName} />
              <SummaryCard
                label={`รวมทุกประเภท (${COCOON_QTY_UNIT})`}
                value={formatNumber(totalQty)}
                emphasis
              />
              <SummaryCard
                label="สัดส่วนรังดี"
                value={`${formatNumber(goodShare, 1)}%`}
                tone={goodShare >= 70 ? 'success' : goodShare >= 40 ? 'warning' : 'danger'}
                emphasis
              />

              {issued && (
                <Can permission="weighing:edit">
                  <Button
                    variant="primary"
                    fullWidth
                    iconRight="arrow-right"
                    onClick={() => navigate('/receiving/weighing')}
                  >
                    ไปจุดชั่งน้ำหนัก
                  </Button>
                </Can>
              )}

              <p className="flex items-start gap-1.5 text-[.74rem] leading-relaxed text-ink-faint">
                <Icon name="info" size={13} className="mt-0.5" />
                ใบคิวนี้ออกที่จุดคัดแยก ก่อนนำรังไหมทั้งหมดไปที่จุดชั่ง
                ราคาและยอดเงินคำนวณโดยระบบหลังบ้านหลังชั่งเสร็จ
              </p>
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmIssue}
        onClose={() => setConfirmIssue(false)}
        onConfirm={onIssue}
        title="ออกใบคิว"
        message={
          <>
            ระบบจะออกเลขคิวและล็อกผลคัดแยก แก้ไขไม่ได้อีก
            <br />
            เกษตรกร: <strong>{farmerOption?.label ?? '—'}</strong>
            <br />
            รวมทุกประเภท:{' '}
            <strong className="dash-num">
              {formatNumber(totalQty)} {COCOON_QTY_UNIT}
            </strong>
            {' · '}สัดส่วนรังดี <strong className="dash-num">{formatNumber(goodShare, 1)}%</strong>
          </>
        }
        confirmLabel="ออกใบคิว"
        loading={busy}
      />

      {guardDialog}
    </>
  )
}

/**
 * Why this farmer has no round to write a slip against.
 *
 * "ไม่มีรอบ" has several causes and a different next action for each — the
 * officer has not delivered yet, a slip is already open, or the round was sold
 * and the farmer must book again. Showing only the first of those sent the
 * counter to the wrong screen, so each round says its own reason.
 */
function NoRoundNotice({ rounds }: Readonly<{ rounds: FarmerRound[] }>) {
  if (rounds.length === 0) {
    return (
      <InfoBanner tone="warning" icon="alert" title="เกษตรกรรายนี้ยังไม่มีใบจอง">
        ต้องมีใบจอง และเจ้าหน้าที่ส่งเสริมบันทึกส่งของก่อน จึงจะออกใบคิวได้
      </InfoBanner>
    )
  }

  const REASONS: Record<
    NonNullable<FarmerRound['blockedReason']>,
    { title: string; detail: (round: FarmerRound) => React.ReactNode }
  > = {
    NOT_DELIVERED: {
      title: 'ยังไม่ได้บันทึกส่งของ',
      detail: () => (
        <>
          รอบนี้จองไว้แล้วแต่ยังไม่ได้ส่งของ — ให้เจ้าหน้าที่ส่งเสริม{' '}
          <strong>บันทึกส่งของ</strong> ที่ใบจองก่อน
        </>
      ),
    },
    ALREADY_QUEUED: {
      title: 'รอบนี้ออกใบคิวไปแล้ว',
      detail: (round) => (
        <>
          มีใบคิว{round.queueNo != null ? ` หมายเลข ${round.queueNo}` : ''}อยู่แล้ว —
          ให้ไปทำต่อที่ใบคิวเดิม ไม่ต้องออกใบใหม่
        </>
      ),
    },
    ALREADY_PURCHASED: {
      title: 'รอบนี้ขายรังไหมเรียบร้อยแล้ว',
      detail: () => (
        <>
          เกษตรกรเลี้ยงหนึ่งรอบต่อครั้ง — ต้อง <strong>จองรอบใหม่</strong> และส่งของก่อน
          จึงจะนำรังไหมมาขายได้อีก
        </>
      ),
    },
  }

  return (
    <div className="mt-4 flex flex-col gap-2">
      {rounds.map((round) => {
        const reason = round.blockedReason ? REASONS[round.blockedReason] : undefined
        if (!reason) return null
        return (
          <InfoBanner
            key={round.booking.id}
            tone={round.blockedReason === 'ALREADY_PURCHASED' ? 'info' : 'warning'}
            icon={round.blockedReason === 'ALREADY_PURCHASED' ? 'check-circle' : 'alert'}
            title={`รอบ ${round.booking.batchNo} — ${reason.title}`}
          >
            {reason.detail(round)}
          </InfoBanner>
        )
      })}
    </div>
  )
}
