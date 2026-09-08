import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { BOOKING_STATUS } from '@/constants'
import type { BookingStatus } from '@/types/domain'
import { PRODUCT_KIND_LABELS } from '@/types/product'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button, LinkButton } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/StatusBadge'
import { DescriptionList, PageHeader } from '@/components/data-display/PageHeader'
import { EmptyState, ErrorState, InfoBanner } from '@/components/feedback/States'
import { Modal } from '@/components/feedback/Modal'
import { Field } from '@/components/form/Field'
import { Textarea } from '@/components/form/Input'
import { useToast } from '@/components/feedback/Toast'
import { Can, FullPageLoader } from '@/features/auth/guards'
import { formatCurrency, formatDateTH, formatDateTimeTH, formatNumber } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { useBooking, useCancelBooking, useRecordDelivery } from './hooks'
import { DeliveryModal } from './DeliveryModal'

/** BOOK-003 — read-only summary, status timeline and permitted actions. */
const TIMELINE: { status: BookingStatus; label: string }[] = [
  { status: 'DRAFT', label: 'สร้างใบจอง' },
  { status: 'CONFIRMED', label: 'ยืนยันใบจอง' },
  { status: 'PREPARING', label: 'เตรียมไข่ไหม' },
  { status: 'DELIVERED', label: 'ส่งมอบแล้ว' },
]

export function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()
  const toast = useToast()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [deliverOpen, setDeliverOpen] = useState(false)
  const [reason, setReason] = useState('')

  const { data: booking, isPending, error, refetch } = useBooking(id)
  const cancel = useCancelBooking(id ?? '')
  const deliver = useRecordDelivery(id ?? '')

  if (isPending) return <FullPageLoader label="กำลังโหลดใบจอง..." />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!booking) return <ErrorState error={new Error('ไม่พบใบจอง')} />

  const cancelled = booking.status === 'CANCELLED'
  const currentStep = TIMELINE.findIndex((s) => s.status === booking.status)
  /** Nothing is owed until the goods are handed over — §7.4. */
  const canDeliver = !cancelled && !booking.delivery && booking.status !== 'DRAFT'

  const doCancel = async () => {
    try {
      await cancel.mutateAsync(reason.trim() || 'ไม่ระบุเหตุผล')
      toast.success('ยกเลิกใบจองแล้ว', booking.bookingNo)
      setCancelOpen(false)
      setReason('')
    } catch (err) {
      toast.error('ยกเลิกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={booking.bookingNo}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{booking.farmerName}</span>
            <span className="text-ink-faint">· {booking.branchName}</span>
            <StatusBadge status={BOOKING_STATUS[booking.status]} />
          </span>
        }
        backTo="/bookings"
        breadcrumb={[{ label: 'จองไข่ไหม', to: '/bookings' }, { label: booking.bookingNo }]}
        actions={
          <>
            {canDeliver && (
              <Can permission="booking:deliver">
                <Button variant="green" iconLeft="truck" onClick={() => setDeliverOpen(true)}>
                  บันทึกส่งของ
                </Button>
              </Can>
            )}
            {!cancelled && (
              <Can permission="booking:cancel">
                <Button variant="ghost" iconLeft="x-circle" onClick={() => setCancelOpen(true)}>
                  ยกเลิกใบจอง
                </Button>
              </Can>
            )}
            {!cancelled && (
              <Can permission="booking:edit">
                <LinkButton to={`/bookings/${booking.id}/edit`} variant="primary" iconLeft="edit">
                  แก้ไข
                </LinkButton>
              </Can>
            )}
          </>
        }
      />

      <div className="grid gap-[18px] lg:grid-cols-12">
        <div className="flex flex-col gap-[18px] lg:col-span-8">
        <Card>
          <CardHeader title="รายละเอียดใบจอง" icon="package" />
          <div className="px-[22px] py-5">
            <DescriptionList
              columns={3}
              items={[
                { label: 'เลขที่ใบจอง', value: <span className="dash-num">{booking.bookingNo}</span> },
                { label: 'วันที่จอง', value: formatDateTH(booking.bookingDate) },
                { label: 'สาขา', value: booking.branchName },
                {
                  label: 'เกษตรกร',
                  value: (
                    <>
                      {booking.farmerName}
                      <span className="dash-num ml-2 text-[.78rem] font-normal text-ink-faint">
                        {booking.farmerCode}
                      </span>
                    </>
                  ),
                },
                { label: 'โครงการ', value: booking.projectName ?? '—' },
                { label: 'สายพันธุ์', value: booking.breedName ?? '—' },
                { label: 'รุ่น', value: booking.batchNo },
                { label: 'รุ่นฟัก', value: formatDateTH(booking.hatchDate) },
                { label: 'กำหนดส่งมอบ', value: formatDateTH(booking.expectedDeliveryDate) },
                {
                  label: 'ไข่ไหมที่จอง',
                  value: `${formatNumber(booking.quantity, booking.quantity % 1 === 0 ? 0 : 2)} ${booking.unit}`,
                },
                { label: 'อัปเดตล่าสุด', value: formatDateTimeTH(booking.updatedAt) },
                { label: 'หมายเหตุ', span: true, value: booking.remark ?? '—' },
              ]}
            />
          </div>
        </Card>

        {/* ── Document body ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader
            title="รายการจอง"
            icon="archive"
            subtitle={`${booking.items.length} รายการ`}
          />
          {booking.items.length === 0 ? (
            <EmptyState icon="archive" title="ใบจองนี้ยังไม่มีรายการ" />
          ) : (
            <div className="app-scroll overflow-x-auto">
              <table className="w-full min-w-[38rem] border-collapse">
                <thead>
                  <tr>
                    {(['รายการ', 'จำนวน', 'หน่วย', 'ราคา', 'รวม'] as const).map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          'border-b border-forest-dark bg-forest px-[22px] py-[11px] text-[.72rem] font-bold uppercase tracking-[.5px] text-white',
                          i === 0 ? 'text-left' : 'text-right',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {booking.items.map((line) => (
                    <tr key={line.id} className="hover:bg-[#f8faf6]">
                      <td className="border-b border-line-faint px-[22px] py-[13px] text-[.86rem]">
                        <span className="block font-semibold text-ink">{line.productName}</span>
                        <span className="flex items-center gap-1.5">
                          <span className="dash-num text-[.72rem] text-ink-faint">
                            {line.productCode}
                          </span>
                          <Badge tone={line.kind === 'EGG' ? 'active' : 'neutral'}>
                            {PRODUCT_KIND_LABELS[line.kind]}
                          </Badge>
                        </span>
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem]">
                        {formatNumber(line.quantity, line.quantity % 1 === 0 ? 0 : 2)}
                      </td>
                      <td className="border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem] text-ink-dim">
                        {line.unitName}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem] text-ink-dim">
                        {formatCurrency(line.unitPrice)}
                      </td>
                      <td className="dash-num border-b border-line-faint px-[22px] py-[13px] text-right text-[.86rem] font-bold">
                        {formatCurrency(line.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-line-faint">
                    <td colSpan={4} className="px-[22px] py-3.5 text-right text-[.86rem] font-bold">
                      ยอดรวมทั้งหมด
                    </td>
                    <td className="dash-num px-[22px] py-3.5 text-right text-[1.05rem] font-bold text-forest">
                      {formatCurrency(booking.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <div className="px-[22px] py-4">
            {booking.delivery ? (
              <InfoBanner tone="success" icon="check-circle" title="ส่งของและตั้งหนี้แล้ว">
                ตั้งหนี้{' '}
                <strong className="dash-num">
                  {formatCurrency(booking.delivery.totalAmount)}
                </strong>{' '}
                ตามจำนวนที่ส่งจริง เมื่อ {formatDateTH(booking.delivery.deliveredAt)}
              </InfoBanner>
            ) : (
              <InfoBanner tone="warning" icon="coins" title="ยังไม่ได้ตั้งหนี้">
                หนี้จะถูกตั้งเมื่อเจ้าหน้าที่ส่งเสริม <strong>บันทึกส่งของ</strong> — ตามจำนวนที่ส่งจริง
                ไม่ใช่ยอดที่จองไว้ ราคาต่อหน่วยมาจากข้อมูลหลักสินค้า แก้ไขได้ที่เมนูตั้งราคาสินค้าเท่านั้น
              </InfoBanner>
            )}
          </div>
        </Card>

        {booking.delivery && (
          <Card>
            <CardHeader
              title="บันทึกส่งของ"
              icon="truck"
              subtitle={`ตั้งหนี้ ${booking.delivery.debtId}`}
              actions={
                <Can permission="debt:view">
                  <LinkButton
                    to={`/debts/${booking.delivery.debtId}`}
                    variant="ghost"
                    size="sm"
                    iconRight="arrow-right"
                  >
                    ดูรายการหนี้
                  </LinkButton>
                </Can>
              }
            />
            <div className="px-[22px] py-5">
              <DescriptionList
                columns={3}
                items={[
                  { label: 'วันที่ส่งของ', value: formatDateTH(booking.delivery.deliveredAt) },
                  { label: 'ผู้ส่งของ', value: booking.delivery.deliveredByName },
                  { label: 'ผู้รับของ', value: booking.delivery.receivedBy ?? '—' },
                ]}
              />
            </div>
            <div className="app-scroll overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse">
                <thead>
                  <tr>
                    {['รายการที่ส่ง', 'จำนวน', 'หน่วย', 'ราคา', 'รวม'].map((h, i) => (
                      <th
                        key={h}
                        className={cn(
                          'border-y border-line bg-sunken px-4 py-2 text-[.72rem] font-bold uppercase tracking-[.5px] text-ink-dim',
                          i === 0 ? 'text-left' : 'text-right',
                        )}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {booking.delivery.items.map((item) => (
                    <tr key={item.bookingItemId}>
                      <td className="border-b border-line-faint px-4 py-2 text-[.86rem] font-semibold">
                        {item.productName}
                      </td>
                      <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.86rem]">
                        {formatNumber(item.quantity, item.quantity % 1 === 0 ? 0 : 2)}
                      </td>
                      <td className="border-b border-line-faint px-4 py-2 text-right text-[.86rem] text-ink-dim">
                        {item.unitName}
                      </td>
                      <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.86rem] text-ink-dim">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.86rem] font-bold">
                        {formatCurrency(item.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-line-faint">
                    <td colSpan={4} className="px-4 py-2.5 text-right text-[.86rem] font-bold">
                      ยอดหนี้ที่ตั้ง
                    </td>
                    <td className="dash-num px-4 py-2.5 text-right text-[1rem] font-bold text-forest">
                      {formatCurrency(booking.delivery.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
        )}

        </div>

        <Card className="lg:col-span-4">
          <CardHeader title="สถานะดำเนินการ" icon="history" />
          <div className="px-[22px] py-5">
            {cancelled ? (
              <p className="flex items-start gap-2 rounded bg-danger-soft px-3 py-2.5 text-[.84rem] text-danger">
                <Icon name="x-circle" size={16} className="mt-px" />
                ใบจองนี้ถูกยกเลิกแล้ว
              </p>
            ) : (
              <ol className="relative pl-6">
                <span
                  aria-hidden="true"
                  className="absolute bottom-3 left-[6px] top-2 w-0.5 bg-line"
                />
                {TIMELINE.map((step, i) => {
                  const done = i <= currentStep
                  const active = i === currentStep
                  return (
                    <li key={step.status} className="relative pb-6 last:pb-0">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'absolute -left-6 top-0.5 z-10 h-3.5 w-3.5 rounded-full border-2 bg-white',
                          active && 'border-meadow bg-meadow shadow-[0_0_0_4px_#e4efd0]',
                          done && !active && 'border-forest bg-forest',
                          !done && 'border-line',
                        )}
                      />
                      <p
                        className={cn(
                          'text-[.87rem]',
                          done ? 'font-semibold text-ink' : 'text-ink-faint',
                        )}
                      >
                        {step.label}
                      </p>
                      {active && (
                        <p className="text-[.74rem] text-ink-faint">
                          สถานะปัจจุบัน · {formatDateTimeTH(booking.updatedAt)}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ol>
            )}
          </div>
        </Card>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="ยกเลิกใบจอง"
        description={`${booking.bookingNo} · ${booking.farmerName}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancel.isPending}>
              ไม่ยกเลิก
            </Button>
            <Button variant="danger" onClick={() => void doCancel()} loading={cancel.isPending}>
              ยืนยันยกเลิก
            </Button>
          </>
        }
      >
        <Field label="เหตุผลในการยกเลิก" hint="บันทึกลงประวัติการใช้งาน">
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="เช่น เกษตรกรขอเลื่อนรอบเลี้ยง"
          />
        </Field>
      </Modal>

      <DeliveryModal
        open={deliverOpen}
        booking={booking}
        busy={deliver.isPending}
        onClose={() => setDeliverOpen(false)}
        onSubmit={(payload) => deliver.mutateAsync(payload)}
      />
    </>
  )
}
