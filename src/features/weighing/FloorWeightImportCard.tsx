import { useEffect, useState } from 'react'
import { cn } from '@/utils/cn'
import { COCOON_GRADE_LABELS } from '@/constants'
import type { FloorWeightSession } from '@/types/integration'
import type { QueueTicket } from '@/types/domain'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/StatusBadge'
import { Field } from '@/components/form/Field'
import { Input } from '@/components/form/Input'
import { EmptyState, InfoBanner, SkeletonText } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { Can } from '@/features/auth/guards'
import { formatDateTH, formatDateTimeTH, formatNumber } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import {
  useFloorWeightLatestDate,
  useFloorWeightSessions,
  useFloorWeightStatus,
  useImportFloorWeight,
} from '@/features/integration/hooks'

/**
 * INT-001 — pulling the weighing in from Floor Weight Cocoon.
 *
 * The scale at จุดชั่งน้ำหนัก is a separate system with its own database: it
 * weighs each ถุง and records it there. ChunERP does not weigh anything; it
 * fetches the finished slip by รหัสเกษตรกร + วันที่ชั่ง and turns it into the
 * two weigh slips the invoice needs.
 */
export function FloorWeightImportCard({
  ticket,
  disabled,
}: Readonly<{ ticket: QueueTicket; disabled?: boolean }>) {
  const toast = useToast()
  const { data: status } = useFloorWeightStatus()
  const { data: latestDate, isPending: latestPending } = useFloorWeightLatestDate(ticket.farmerCode)

  const [weighDate, setWeighDate] = useState('')
  const [pulled, setPulled] = useState(false)

  // The station almost always wants today's weighing, so the latest weigh date
  // the external system holds for this farmer is the sensible default.
  useEffect(() => {
    if (latestDate && !weighDate) setWeighDate(latestDate)
  }, [latestDate, weighDate])

  const query = { farmerCode: ticket.farmerCode, weighDate: weighDate || undefined }
  const { data: sessions, isFetching, refetch } = useFloorWeightSessions(query, pulled)
  const importSession = useImportFloorWeight(ticket.id)

  const pull = async () => {
    setPulled(true)
    const result = await refetch()
    const found = result.data ?? []
    if (found.length === 0) {
      toast.info(
        'ไม่พบรายการชั่ง',
        `${ticket.farmerCode} · ${weighDate ? formatDateTH(weighDate) : 'วันที่ล่าสุด'}`,
      )
    }
  }

  const doImport = async (session: FloorWeightSession) => {
    try {
      const { fresh } = await importSession.mutateAsync(session.sessionId)
      toast.success(
        'ดึงข้อมูลการชั่งเข้าระบบแล้ว',
        `${session.sessionNo} · ${fresh.lines.length} ถุง · ${formatNumber(
          fresh.totalCocoonWeight + fresh.totalScrapWeight,
          2,
        )} กก.`,
      )
    } catch (err) {
      toast.error('ดึงข้อมูลไม่สำเร็จ', toUserMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader
        title="ดึงข้อมูลจากระบบชั่งน้ำหนัก"
        icon="download"
        iconClassName="bg-indigo-soft text-indigo"
        subtitle={
          status ? (
            <span className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 text-[.76rem] font-semibold',
                  status.connected ? 'text-meadow-deep' : 'text-danger',
                )}
              >
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    status.connected ? 'bg-meadow-deep' : 'bg-danger',
                  )}
                />
                {status.source}
              </span>
              <span className="dash-num text-[.72rem] text-ink-faint">{status.database}</span>
            </span>
          ) : (
            'Floor Weight Cocoon'
          )
        }
      />

      <div className="flex flex-col gap-4 px-[22px] py-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <Field label="รหัสเกษตรกร" hint="ตามคิวใบนี้">
            <Input value={ticket.farmerCode} readOnly className="dash-num" />
          </Field>
          <Field
            label="วันที่ชั่ง"
            hint={
              latestPending
                ? 'กำลังหาวันที่ล่าสุด...'
                : latestDate
                  ? `ล่าสุด ${formatDateTH(latestDate)}`
                  : 'ยังไม่เคยชั่ง'
            }
          >
            <Input type="date" value={weighDate} onChange={(e) => setWeighDate(e.target.value)} />
          </Field>
          {/* Matches the 42px control height so all three line up exactly. */}
          <Can permission="weighing:edit">
            <Button
              variant="primary"
              iconLeft="refresh"
              className="h-[42px]"
              loading={isFetching}
              disabled={disabled}
              onClick={() => void pull()}
            >
              ดึงรายการชั่ง
            </Button>
          </Can>
        </div>

        {disabled && (
          <InfoBanner tone="warning" icon="lock">
            ใบชั่งถูกล็อกแล้ว — ต้องปลดล็อกก่อนจึงจะดึงข้อมูลจากระบบชั่งใหม่ได้
          </InfoBanner>
        )}

        {!pulled && (
          <InfoBanner tone="info" icon="info">
            ระบบกรองด้วย <strong>รหัสเกษตรกร</strong> และ <strong>วันที่ชั่ง</strong> — เว้นวันที่ไว้
            เพื่อเอาการชั่งครั้งล่าสุดของเกษตรกรรายนี้
          </InfoBanner>
        )}

        {pulled && isFetching && <SkeletonText lines={4} />}

        {pulled && !isFetching && (sessions?.length ?? 0) === 0 && (
          <EmptyState
            icon="search"
            title="ไม่พบใบชั่งที่ปิดแล้ว"
            description="ตรวจสอบรหัสเกษตรกรและวันที่ชั่ง — ใบชั่งที่ยังไม่ปิดจะยังดึงเข้าระบบไม่ได้"
          />
        )}

        {sessions?.map((session) => (
          <SessionRow
            key={session.sessionId}
            session={session}
            queueId={ticket.id}
            busy={importSession.isPending}
            disabled={disabled}
            onImport={() => void doImport(session)}
          />
        ))}
      </div>
    </Card>
  )
}

function SessionRow({
  session,
  queueId,
  busy,
  disabled,
  onImport,
}: Readonly<{
  session: FloorWeightSession
  queueId: string
  busy?: boolean
  disabled?: boolean
  onImport: () => void
}>) {
  const claimedElsewhere = session.importedQueueId != null && session.importedQueueId !== queueId
  const alreadyHere = session.importedQueueId === queueId

  // The grade breakdown is what the operator checks against the paper slip
  // before accepting the pull, so it is shown before importing, not after.
  const byGrade = session.bags.reduce<Record<string, { bags: number; weight: number }>>(
    (acc, bag) => {
      const entry = acc[bag.erpGrade] ?? { bags: 0, weight: 0 }
      acc[bag.erpGrade] = { bags: entry.bags + 1, weight: entry.weight + bag.weightKg }
      return acc
    },
    {},
  )

  return (
    <div className="rounded border border-line bg-sunken px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <span className="dash-num text-[.92rem] font-bold text-forest">
              {session.sessionNo}
            </span>
            {alreadyHere && <Badge tone="active">ดึงเข้าคิวนี้แล้ว</Badge>}
            {claimedElsewhere && <Badge tone="warning">ถูกดึงไปคิวอื่น</Badge>}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[.78rem] text-ink-dim">
            <span className="dash-num">{formatDateTH(session.weighDate)}</span>
            <span>
              {session.stationCode}
              {session.scaleNo && ` · ${session.scaleNo}`}
            </span>
            {session.operatorName && <span>ผู้ชั่ง {session.operatorName}</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="dash-num text-[1.15rem] font-bold text-ink">
            {formatNumber(session.totalWeightKg, 2)}
            <span className="ml-1 text-[.78rem] font-normal text-ink-faint">กก.</span>
          </p>
          <p className="dash-num text-[.76rem] text-ink-faint">{session.bags.length} ถุง</p>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
        {Object.entries(byGrade).map(([grade, total]) => (
          <li key={grade} className="text-[.78rem] text-ink-dim">
            {COCOON_GRADE_LABELS[grade as keyof typeof COCOON_GRADE_LABELS]}{' '}
            <strong className="dash-num text-ink">{formatNumber(total.weight, 2)}</strong>
            <span className="text-ink-faint"> กก. / {total.bags} ถุง</span>
          </li>
        ))}
      </ul>

      {session.shellSample && (
        <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[.76rem] text-ink-faint">
          <span className="flex items-center gap-1">
            <Icon name="info" size={12} />
            ตัวอย่างเปลือกรัง
          </span>
          <span className="dash-num">{session.shellSample.cocoonCount} รัง</span>
          <span className="dash-num">นน.รังรวม {session.shellSample.cocoonWeightG} ก.</span>
          <span className="dash-num">เปลือก {session.shellSample.shellWeightG} ก.</span>
          <span className="dash-num">ความชื้น {session.shellSample.moisturePercent}%</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Can permission="weighing:edit">
          <Button
            variant={alreadyHere ? 'ghost' : 'green'}
            size="sm"
            iconLeft="download"
            loading={busy}
            disabled={disabled || claimedElsewhere}
            onClick={onImport}
          >
            {alreadyHere ? 'ดึงข้อมูลซ้ำ' : 'ดึงเข้าระบบ'}
          </Button>
        </Can>
        {session.importedAt && (
          <span className="dash-num text-[.74rem] text-ink-faint">
            ดึงเมื่อ {formatDateTimeTH(session.importedAt)}
          </span>
        )}
        {claimedElsewhere && (
          <span className="text-[.74rem] text-tan-dark">
            ใบชั่งนี้ผูกกับคิว {session.importedQueueId} แล้ว
          </span>
        )}
      </div>
    </div>
  )
}
