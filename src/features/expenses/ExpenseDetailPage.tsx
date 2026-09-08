import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { EXPENSE_STATUS, PAYMENT_METHODS } from '@/constants'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { DescriptionList, PageHeader } from '@/components/data-display/PageHeader'
import { SummaryCard } from '@/components/data-display/KpiCard'
import { EmptyState, ErrorState, InfoBanner, SkeletonText } from '@/components/feedback/States'
import { ConfirmDialog, Modal } from '@/components/feedback/Modal'
import { Field } from '@/components/form/Field'
import { Textarea } from '@/components/form/Input'
import { useToast } from '@/components/feedback/Toast'
import { Can, FullPageLoader } from '@/features/auth/guards'
import { formatCurrency, formatDateTH, formatDateTimeTH, formatNumber } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { FileUpload } from './FileUpload'
import { useExpense, useExpenseActions, useExpenseAudit } from './hooks'

/** EXP-006 / EXP-007 — read-only detail, attachments, audit and status actions. */
export function ExpenseDetailPage() {
  const { id = '' } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [approveOpen, setApproveOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [decisionNote, setDecisionNote] = useState('')

  const { data: expense, isPending, error, refetch } = useExpense(id)
  const { data: audit, isPending: auditPending } = useExpenseAudit(id)
  const { cancel, approve, reject, duplicate, upload, removeAttachment } = useExpenseActions(id)

  if (isPending) return <FullPageLoader label="กำลังโหลดรายการค่าใช้จ่าย..." />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!expense) return <ErrorState error={new Error('ไม่พบรายการค่าใช้จ่าย')} />

  const editable = !['APPROVED', 'CANCELLED'].includes(expense.status)
  const isTransfer = expense.paymentMethod === 'BANK_TRANSFER'
  /** Only a submitted item is waiting on anyone — §8. */
  const awaitingDecision = expense.status === 'SUBMITTED'

  const doCancel = async () => {
    try {
      await cancel.mutateAsync(reason.trim() || 'ไม่ระบุเหตุผล')
      toast.success('ยกเลิกรายการแล้ว', expense.expenseNo)
      setCancelOpen(false)
      setReason('')
    } catch (err) {
      toast.error('ยกเลิกไม่สำเร็จ', toUserMessage(err))
    }
  }

  const doApprove = async () => {
    try {
      await approve.mutateAsync(decisionNote.trim() || undefined)
      toast.success('อนุมัติแล้ว', expense.expenseNo)
      setApproveOpen(false)
      setDecisionNote('')
    } catch (err) {
      toast.error('อนุมัติไม่สำเร็จ', toUserMessage(err))
    }
  }

  const doReject = async () => {
    try {
      await reject.mutateAsync(decisionNote.trim())
      toast.success('ไม่อนุมัติรายการนี้', expense.expenseNo)
      setRejectOpen(false)
      setDecisionNote('')
    } catch (err) {
      toast.error('บันทึกไม่สำเร็จ', toUserMessage(err))
    }
  }

  const doDuplicate = async () => {
    try {
      const copy = await duplicate.mutateAsync()
      toast.success('คัดลอกรายการแล้ว', copy.expenseNo)
      navigate(`/expenses/${copy.id}/edit`)
    } catch (err) {
      toast.error('คัดลอกไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <>
      <PageHeader
        title={expense.expenseNo}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span>{expense.categoryName}</span>
            <span className="text-ink-faint">· {expense.branchName}</span>
            <StatusBadge status={EXPENSE_STATUS[expense.status]} />
          </span>
        }
        backTo="/expenses"
        breadcrumb={[{ label: 'บันทึกค่าใช้จ่าย', to: '/expenses' }, { label: expense.expenseNo }]}
        actions={
          <>
            {awaitingDecision && (
              <Can permission="expense:approve">
                <>
                  <Button
                    variant="ghost"
                    iconLeft="x-circle"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => {
                      setDecisionNote('')
                      setRejectOpen(true)
                    }}
                  >
                    ไม่อนุมัติ
                  </Button>
                  <Button
                    variant="green"
                    iconLeft="check-circle"
                    onClick={() => {
                      setDecisionNote('')
                      setApproveOpen(true)
                    }}
                  >
                    อนุมัติ
                  </Button>
                </>
              </Can>
            )}
            <Can permission="expense:create">
              <Button
                variant="ghost"
                iconLeft="archive"
                onClick={() => void doDuplicate()}
                loading={duplicate.isPending}
              >
                คัดลอก
              </Button>
            </Can>
            {editable && (
              <Can permission="expense:cancel">
                <Button variant="ghost" iconLeft="x-circle" onClick={() => setCancelOpen(true)}>
                  ยกเลิก
                </Button>
              </Can>
            )}
            {editable && (
              <Can permission="expense:edit">
                <LinkButton to={`/expenses/${expense.id}/edit`} variant="primary" iconLeft="edit">
                  แก้ไข
                </LinkButton>
              </Can>
            )}
          </>
        }
      />

      {awaitingDecision && (
        <Can
          permission="expense:approve"
          fallback={
            <InfoBanner tone="info" icon="clock" className="mb-[18px]">
              รายการนี้ส่งขออนุมัติแล้ว รออนุมัติจากผู้มีสิทธิ์ — บัญชีของคุณไม่มีสิทธิ์อนุมัติค่าใช้จ่าย
            </InfoBanner>
          }
        >
          <InfoBanner tone="warning" icon="clock" title="รายการนี้รออนุมัติจากคุณ" className="mb-[18px]">
            ตรวจรายละเอียดและเอกสารแนบ แล้วกด <strong>อนุมัติ</strong> หรือ{' '}
            <strong>ไม่อนุมัติ</strong> ที่มุมขวาบน
          </InfoBanner>
        </Can>
      )}

      {expense.status === 'REJECTED' && expense.rejectedReason && (
        <InfoBanner tone="danger" icon="x-circle" title="ไม่อนุมัติ" className="mb-[18px]">
          {expense.rejectedReason}
          {expense.approvedByName && (
            <span className="text-ink-faint">
              {' '}
              — {expense.approvedByName} · {formatDateTimeTH(expense.approvedAt)}
            </span>
          )}
        </InfoBanner>
      )}

      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="จำนวนเงิน" value={formatCurrency(expense.amount)} tone="info" emphasis />
        <SummaryCard
          label="จำนวน × ราคา/หน่วย"
          value={`${formatNumber(expense.quantity, 2)}${expense.unit ? ` ${expense.unit}` : ''} × ${formatCurrency(expense.unitPrice)}`}
          emphasis
        />
        <SummaryCard label="วันที่" value={formatDateTH(expense.expenseDate)} emphasis />
        <SummaryCard
          label="วิธีชำระเงิน"
          value={PAYMENT_METHODS.find((m) => m.value === expense.paymentMethod)?.label ?? '—'}
          emphasis
        />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-12">
        <div className="flex flex-col gap-[18px] lg:col-span-7">
          <Card>
            <CardHeader title="รายละเอียด" icon="file" />
            <div className="px-[22px] py-5">
              <DescriptionList
                columns={2}
                items={[
                  { label: 'เลขที่เอกสาร', value: <span className="dash-num">{expense.expenseNo}</span> },
                  { label: 'วันที่', value: formatDateTH(expense.expenseDate) },
                  { label: 'ประเภท', value: expense.categoryName },
                  { label: 'ประเภทย่อย', value: expense.expenseTypeName ?? '—' },
                  { label: 'สาขา', value: expense.branchName },
                  { label: 'ผู้ขาย / ผู้รับเงิน', value: expense.vendor ?? '—' },
                  { label: 'เลขที่อ้างอิง', value: expense.referenceNo ?? '—' },
                  { label: 'ผู้บันทึก', value: expense.createdByName },
                  ...(expense.approvedByName
                    ? [
                        {
                          label: expense.status === 'REJECTED' ? 'ผู้ไม่อนุมัติ' : 'ผู้อนุมัติ',
                          value: (
                            <span>
                              <span className="block">{expense.approvedByName}</span>
                              <span className="dash-num block text-[.76rem] text-ink-faint">
                                {formatDateTimeTH(expense.approvedAt)}
                              </span>
                            </span>
                          ),
                        },
                      ]
                    : []),
                  { label: 'รายละเอียด', span: true, value: expense.description },
                  { label: 'หมายเหตุ', span: true, value: expense.remark ?? '—' },
                ]}
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="ข้อมูลการชำระเงิน"
              icon={isTransfer ? 'building' : 'wallet'}
              iconClassName="bg-meadow-soft text-meadow-deep"
            />
            <div className="px-[22px] py-5">
              <DescriptionList
                columns={2}
                items={
                  isTransfer
                    ? [
                        { label: 'ธนาคาร', value: expense.bankName ?? '—' },
                        { label: 'เลขที่บัญชี', value: <span className="dash-num">{expense.accountNo ?? '—'}</span> },
                        { label: 'วันที่โอน', value: formatDateTH(expense.transferDate) },
                        { label: 'เลขที่อ้างอิงการโอน', value: <span className="dash-num">{expense.transferRef ?? '—'}</span> },
                      ]
                    : [
                        { label: 'วิธีชำระเงิน', value: 'เงินสด' },
                        { label: 'วันที่จ่าย', value: formatDateTH(expense.paidDate) },
                      ]
                }
              />
            </div>
          </Card>

          <Card>
            <CardHeader
              title="เอกสารแนบ"
              icon="archive"
              subtitle={`${expense.attachments.length} ไฟล์`}
            />
            <div className="px-[22px] py-5">
              <Can
                permission="expense:edit"
                fallback={
                  expense.attachments.length === 0 ? (
                    <EmptyState icon="archive" title="ยังไม่มีเอกสารแนบ" />
                  ) : (
                    <FileUpload
                      attachments={expense.attachments}
                      onUpload={async () => undefined}
                      disabled
                    />
                  )
                }
              >
                <FileUpload
                  attachments={expense.attachments}
                  disabled={!editable}
                  onUpload={(file, onProgress) => upload.mutateAsync({ file, onProgress })}
                  onRemove={editable ? (attachmentId) => removeAttachment.mutateAsync(attachmentId) : undefined}
                />
              </Can>
            </div>
          </Card>
        </div>

        <Card className="lg:col-span-5">
          <CardHeader title="ประวัติการใช้งาน" icon="history" />
          {auditPending ? (
            <div className="px-[22px] py-5">
              <SkeletonText lines={5} />
            </div>
          ) : (audit?.length ?? 0) === 0 ? (
            <EmptyState icon="history" title="ยังไม่มีประวัติ" />
          ) : (
            <ul className="max-h-[36rem] overflow-y-auto app-scroll">
              {audit?.map((entry) => (
                <li key={entry.id} className="border-b border-line-faint px-[22px] py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-start gap-2.5">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-forest-soft text-forest">
                        <Icon name="edit" size={14} />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[.85rem] font-semibold text-ink">
                          {entry.action}
                        </span>
                        <span className="block text-[.75rem] text-ink-faint">{entry.actorName}</span>
                      </span>
                    </span>
                    <span className="dash-num shrink-0 text-[.72rem] text-ink-faint">
                      {formatDateTimeTH(entry.at)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="ยกเลิกรายการค่าใช้จ่าย"
        description={`${expense.expenseNo} · ${formatCurrency(expense.amount)}`}
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
            placeholder="เช่น บันทึกซ้ำกับเอกสาร EX-2569-0012"
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={doApprove}
        title="อนุมัติค่าใช้จ่าย"
        message={
          <>
            อนุมัติ <strong className="dash-num">{expense.expenseNo}</strong> จำนวน{' '}
            <strong className="dash-num">{formatCurrency(expense.amount)}</strong>?
            <br />
            {expense.attachments.length === 0 ? (
              <span className="font-semibold text-tan-dark">
                รายการนี้ยังไม่มีเอกสารแนบ — ตรวจสอบก่อนอนุมัติ
              </span>
            ) : (
              <span className="text-ink-faint">
                เอกสารแนบ {expense.attachments.length} ไฟล์
              </span>
            )}
            <br />
            <span className="text-ink-faint">เมื่ออนุมัติแล้วจะแก้ไขหรือยกเลิกรายการไม่ได้</span>
          </>
        }
        confirmLabel="ยืนยันอนุมัติ"
        icon="check-circle"
        loading={approve.isPending}
      />

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="ไม่อนุมัติค่าใช้จ่าย"
        description={`${expense.expenseNo} · ${formatCurrency(expense.amount)}`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRejectOpen(false)} disabled={reject.isPending}>
              ย้อนกลับ
            </Button>
            <Button
              variant="danger"
              disabled={decisionNote.trim().length < 4}
              onClick={() => void doReject()}
              loading={reject.isPending}
            >
              ยืนยันไม่อนุมัติ
            </Button>
          </>
        }
      >
        {/* The submitter has to be able to fix it, so a reason is required. */}
        <Field
          label="เหตุผลที่ไม่อนุมัติ"
          required
          hint="ผู้บันทึกจะเห็นข้อความนี้ และถูกบันทึกลงประวัติการใช้งาน"
        >
          <Textarea
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            rows={3}
            placeholder="เช่น ยังไม่แนบใบเสร็จตัวจริง / จำนวนเงินไม่ตรงกับใบเสนอราคา"
            autoFocus
          />
        </Field>
      </Modal>
    </>
  )
}
