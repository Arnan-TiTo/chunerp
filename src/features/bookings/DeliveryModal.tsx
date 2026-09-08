import { useEffect, useState } from 'react'
import type { Booking } from '@/types/domain'
import type { DeliveryPayload } from '@/services/api/contracts'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/feedback/Modal'
import { InfoBanner } from '@/components/feedback/States'
import { Field, FormGrid } from '@/components/form/Field'
import { Input, NumberInput, Textarea } from '@/components/form/Input'
import { useToast } from '@/components/feedback/Toast'
import { formatCurrency, formatNumber, todayInput } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'

/**
 * BOOK-005 — บันทึกส่งของ.
 *
 * The officer confirms what actually went out to the farm, line by line,
 * because the debt is opened from the delivered quantities and not from what
 * was asked for. Prices are shown but never editable — they come from the
 * product master, so a delivery cannot quietly re-price a document.
 */
export function DeliveryModal({
  open,
  booking,
  busy,
  onClose,
  onSubmit,
}: Readonly<{
  open: boolean
  booking: Booking
  busy?: boolean
  onClose: () => void
  onSubmit: (payload: DeliveryPayload) => Promise<unknown>
}>) {
  const toast = useToast()
  const [deliveredAt, setDeliveredAt] = useState(todayInput())
  const [receivedBy, setReceivedBy] = useState(booking.farmerName)
  const [remark, setRemark] = useState('')
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!open) return
    setDeliveredAt(todayInput())
    setReceivedBy(booking.farmerName)
    setRemark('')
    setQuantities(Object.fromEntries(booking.items.map((item) => [item.id, item.quantity])))
  }, [open, booking])

  const lines = booking.items.map((item) => {
    const quantity = quantities[item.id] ?? 0
    return { item, quantity, amount: Math.round(quantity * item.unitPrice * 100) / 100 }
  })
  const total = lines.reduce((sum, line) => sum + line.amount, 0)
  const delivering = lines.filter((line) => line.quantity > 0)
  const changed = lines.some((line) => line.quantity !== line.item.quantity)

  const submit = async () => {
    try {
      await onSubmit({
        deliveredAt,
        receivedBy: receivedBy.trim() || undefined,
        remark: remark.trim() || undefined,
        items: delivering.map((line) => ({
          bookingItemId: line.item.id,
          quantity: line.quantity,
        })),
      })
      toast.success('บันทึกส่งของแล้ว', `ตั้งหนี้ ${formatCurrency(total)}`)
      onClose()
    } catch (err) {
      toast.error('บันทึกส่งของไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="บันทึกส่งของ"
      description={`${booking.bookingNo} · ${booking.farmerName} · รอบ ${booking.batchNo}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            ยกเลิก
          </Button>
          <Button
            variant="green"
            iconLeft="truck"
            disabled={delivering.length === 0}
            loading={busy}
            onClick={() => void submit()}
          >
            บันทึกส่งของ และตั้งหนี้
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <FormGrid columns={2}>
          <Field label="วันที่ส่งของ" required>
            <Input
              type="date"
              value={deliveredAt}
              onChange={(e) => setDeliveredAt(e.target.value)}
            />
          </Field>
          <Field label="ผู้รับของ" hint="ผู้เซ็นรับที่ฟาร์ม">
            <Input value={receivedBy} onChange={(e) => setReceivedBy(e.target.value)} />
          </Field>
        </FormGrid>

        <div className="overflow-hidden rounded border border-line">
          <div className="app-scroll overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse">
              <thead>
                <tr>
                  {['รายการ', 'จองไว้', 'ส่งจริง', 'ราคา', 'รวม'].map((h, i) => (
                    <th
                      key={h}
                      className={`border-b border-forest-dark bg-forest px-4 py-2.5 text-[.72rem] font-bold uppercase tracking-[.5px] text-white ${
                        i === 0 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map(({ item, quantity, amount }) => (
                  <tr key={item.id} className="hover:bg-[#f8faf6]">
                    <td className="border-b border-line-faint px-4 py-2 text-[.86rem]">
                      <span className="block font-semibold text-ink">{item.productName}</span>
                      <span className="dash-num text-[.72rem] text-ink-faint">
                        {item.productCode} · {item.unitName}
                      </span>
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.84rem] text-ink-faint">
                      {formatNumber(item.quantity, item.quantity % 1 === 0 ? 0 : 2)}
                    </td>
                    <td className="border-b border-line-faint px-4 py-2 text-right">
                      <NumberInput
                        value={quantity}
                        step="0.5"
                        min={0}
                        max={item.quantity}
                        aria-label={`จำนวนที่ส่งของ ${item.productName}`}
                        className="h-9 w-24 text-right"
                        onChange={(e) =>
                          setQuantities((prev) => ({
                            ...prev,
                            [item.id]: Number(e.target.value),
                          }))
                        }
                      />
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.84rem] text-ink-dim">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="dash-num border-b border-line-faint px-4 py-2 text-right text-[.86rem] font-bold">
                      {formatCurrency(amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-line-faint">
                  <td colSpan={4} className="px-4 py-3 text-right text-[.86rem] font-bold">
                    ยอดตั้งหนี้
                  </td>
                  <td className="dash-num px-4 py-3 text-right text-[1.05rem] font-bold text-forest">
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {changed && (
          <InfoBanner tone="warning" icon="alert">
            จำนวนที่ส่งไม่ตรงกับที่จองไว้ — ระบบจะตั้งหนี้ตามจำนวนที่ส่งจริง
          </InfoBanner>
        )}

        <Field label="หมายเหตุ">
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            rows={2}
            placeholder="เช่น ส่งที่บ้านเกษตรกร เช้าวันเสาร์"
          />
        </Field>

        <InfoBanner tone="info" icon="coins" title="การส่งของคือการตั้งหนี้">
          เมื่อบันทึกแล้วระบบจะตั้งหนี้ <strong>{formatCurrency(total)}</strong> ให้เกษตรกรในรอบ{' '}
          {booking.batchNo} — หักคืนได้จากใบรับซื้อรังไหมสดของรอบเดียวกัน
        </InfoBanner>
      </div>
    </Modal>
  )
}
