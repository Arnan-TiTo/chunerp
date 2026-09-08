import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { QUEUE_STATUS } from '@/constants'
import type { QueueStatus, QueueTicket } from '@/types/domain'
import { PageHeader, Tabs } from '@/components/data-display/PageHeader'
import { FilterBar, FilterField, SearchBox } from '@/components/data-display/FilterBar'
import { Select } from '@/components/form/Select'
import { Button, IconButton } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { EmptyState, ErrorState, Skeleton } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { Can } from '@/features/auth/guards'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatDuration, formatNumber, formatTime, todayInput } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { useQueue, useQueueActions } from './hooks'

/**
 * จุดชั่งน้ำหนัก — station 2.
 *
 * Only slips that already carry a queue number reach this board; the sorting
 * station has done its part. The queue number is the largest element on every
 * card so it can be read across the counter (§7.5).
 */
const TABS: { id: string; label: string; statuses: QueueStatus[] }[] = [
  { id: 'active', label: 'รอชั่ง / กำลังชั่ง', statuses: ['WAITING_WEIGH', 'CALLED', 'WEIGHING'] },
  { id: 'WAITING_WEIGH', label: 'รอชั่ง', statuses: ['WAITING_WEIGH'] },
  { id: 'WEIGHING', label: 'กำลังชั่ง', statuses: ['CALLED', 'WEIGHING'] },
  { id: 'COMPLETED', label: 'เสร็จสิ้น', statuses: ['COMPLETED'] },
]

export function WeighStationPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { branchId } = useBranchContext()
  const { params, update, reset, activeFilterCount } = useListParams({ defaultPageSize: 100 })
  const [tab, setTab] = useState(params.status ?? 'active')
  const [cancelTarget, setCancelTarget] = useState<QueueTicket | null>(null)

  const queryParams = useMemo(
    () => ({
      ...params,
      branchId: params.branchId ?? (branchId === 'ALL' ? undefined : branchId),
      dateFrom: params.dateFrom ?? todayInput(),
      dateTo: params.dateTo ?? todayInput(),
      status: undefined,
    }),
    [params, branchId],
  )

  const { data, isPending, error, refetch, isFetching } = useQueue(queryParams)
  const { options: branchOptions } = useBranchOptions()
  const actions = useQueueActions()

  const statuses = TABS.find((t) => t.id === tab)?.statuses ?? []
  const tickets = (data?.items ?? [])
    .filter((t) => t.queueNo != null && statuses.includes(t.status))
    .sort((a, b) => (a.queueNo ?? 0) - (b.queueNo ?? 0))

  const counts = useMemo(() => {
    const all = (data?.items ?? []).filter((t) => t.queueNo != null)
    return Object.fromEntries(
      TABS.map((t) => [t.id, all.filter((x) => t.statuses.includes(x.status)).length]),
    )
  }, [data])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn()
      toast.success(label)
    } catch (err) {
      toast.error(`${label}ไม่สำเร็จ`, toUserMessage(err))
    }
  }

  let body: React.ReactNode
  if (error) {
    body = <ErrorState error={error} onRetry={() => void refetch()} />
  } else if (isPending) {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-44 rounded-lg" />
        ))}
      </div>
    )
  } else if (tickets.length === 0) {
    body = (
      <div className="rounded-lg bg-white shadow-md">
        <EmptyState
          icon="check-circle"
          title="ไม่มีคิวในหมวดนี้"
          description="คิวจะปรากฏที่นี่หลังจากจุดคัดแยกออกใบคิวให้เกษตรกรแล้ว"
          action={
            <Button variant="ghost" iconLeft="check-square" onClick={() => navigate('/receiving/sorting')}>
              ไปจุดคัดแยก
            </Button>
          }
        />
      </div>
    )
  } else {
    body = (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tickets.map((ticket) => (
          <WeighCard
            key={ticket.id}
            ticket={ticket}
            busy={actions.call.isPending || actions.start.isPending}
            onCall={() => void run('เรียกคิวแล้ว', () => actions.call.mutateAsync(ticket.id))}
            onRecall={() => void run('เรียกซ้ำแล้ว', () => actions.recall.mutateAsync(ticket.id))}
            onStart={async () => {
              await run('เริ่มชั่งน้ำหนัก', () => actions.start.mutateAsync(ticket.id))
              navigate(`/receiving/${ticket.id}/weighing`)
            }}
            onCancel={() => setCancelTarget(ticket)}
            onOpen={() =>
              navigate(
                ticket.status === 'COMPLETED'
                  ? `/receiving/${ticket.id}/summary`
                  : `/receiving/${ticket.id}/weighing`,
              )
            }
            onOpenSlip={() => navigate(`/receiving/sorting/${ticket.id}`)}
          />
        ))}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        title="จุดชั่งน้ำหนัก"
        subtitle={`คิวที่ออกใบแล้ววันนี้${isFetching ? ' · กำลังอัปเดต' : ''}`}
        actions={
          <Button
            variant="ghost"
            size="sm"
            iconLeft="refresh"
            onClick={() => void refetch()}
            loading={isFetching}
          >
            รีเฟรช
          </Button>
        }
      >
        <Tabs
          active={tab}
          onChange={(id) => {
            setTab(id)
            update({ status: id === 'active' ? undefined : id })
          }}
          tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))}
        />
      </PageHeader>

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="เลขคิว / ชื่อเกษตรกร / รหัส"
          />
        </FilterField>
        <FilterField label="จุดรับซื้อ" className="sm:w-48">
          <Select
            placeholder="สาขาปัจจุบัน"
            value={params.branchId ?? ''}
            options={branchOptions}
            onChange={(e) => update({ branchId: e.target.value })}
          />
        </FilterField>
      </FilterBar>

      {body}

      <ConfirmDialog
        open={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return
          await run('ยกเลิกคิวแล้ว', () =>
            actions.cancel.mutateAsync({ queueId: cancelTarget.id, reason: 'ยกเลิกที่จุดชั่ง' }),
          )
          setCancelTarget(null)
        }}
        title="ยกเลิกคิว"
        message={
          cancelTarget
            ? `ยืนยันยกเลิกคิว ${cancelTarget.queueNo} ของ ${cancelTarget.farmerName}?`
            : ''
        }
        confirmLabel="ยกเลิกคิว"
        tone="danger"
        loading={actions.cancel.isPending}
      />
    </>
  )
}

function WeighCard({
  ticket,
  busy,
  onCall,
  onRecall,
  onStart,
  onCancel,
  onOpen,
  onOpenSlip,
}: Readonly<{
  ticket: QueueTicket
  busy: boolean
  onCall: () => void
  onRecall: () => void
  onStart: () => void
  onCancel: () => void
  onOpen: () => void
  onOpenSlip: () => void
}>) {
  const since = ticket.issuedAt ?? ticket.arrivedAt
  const waiting = Math.max(0, (Date.now() - new Date(since).getTime()) / 60_000)
  const late = ticket.status === 'WAITING_WEIGH' && waiting > 30

  return (
    <article
      className={cn(
        'flex flex-col overflow-hidden rounded-lg bg-white shadow-md transition-shadow hover:shadow-lg',
        late && 'ring-2 ring-tan/40',
      )}
    >
      <div className="flex items-start gap-4 px-5 pt-5">
        <span
          className={cn(
            'dash-num grid h-[72px] w-[72px] shrink-0 place-items-center rounded-lg text-[2.2rem] font-bold leading-none',
            ticket.status === 'COMPLETED'
              ? 'bg-meadow-soft text-meadow-deep'
              : 'bg-forest text-white',
          )}
        >
          {ticket.queueNo}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate text-[1rem] font-bold text-ink">{ticket.farmerName}</p>
          <p className="dash-num truncate text-[.78rem] text-ink-faint">{ticket.farmerCode}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={QUEUE_STATUS[ticket.status]} />
            {ticket.counter && (
              <span className="rounded-pill bg-forest-soft px-2 py-0.5 text-[.68rem] font-semibold text-forest">
                {ticket.counter}
              </span>
            )}
          </div>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-px border-y border-line-faint bg-line-faint text-center">
        <Cell label="ออกใบคิว" value={formatTime(ticket.issuedAt)} />
        <Cell label="รอชั่ง" value={formatDuration(waiting)} tone={late ? 'text-tan' : undefined} />
        <Cell
          label="จองไป"
          value={
            ticket.expectedBoxes != null ? `${formatNumber(ticket.expectedBoxes, 1)} กล่อง` : '—'
          }
        />
      </dl>

      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        {ticket.status === 'WAITING_WEIGH' && (
          <Can permission="queue:call">
            <Button variant="primary" size="lg" iconLeft="bell" onClick={onCall} loading={busy}>
              เรียกคิว
            </Button>
          </Can>
        )}
        {ticket.status === 'CALLED' && (
          <>
            <Can permission="weighing:edit">
              <Button variant="green" size="lg" iconLeft="scale" onClick={onStart} loading={busy}>
                เริ่มชั่ง
              </Button>
            </Can>
            <Can permission="queue:call">
              <IconButton icon="refresh" label="เรียกซ้ำ" variant="soft" size="lg" onClick={onRecall} />
            </Can>
          </>
        )}
        {ticket.status === 'WEIGHING' && (
          <Button variant="primary" size="lg" iconRight="arrow-right" onClick={onOpen}>
            ชั่งต่อ
          </Button>
        )}
        {ticket.status === 'COMPLETED' && (
          <Button variant="ghost" size="lg" iconRight="arrow-right" onClick={onOpen}>
            ดูสรุปการรับซื้อ
          </Button>
        )}

        <IconButton
          icon="file"
          label={`ดูใบคิว ${ticket.queueNo}`}
          variant="soft"
          size="lg"
          onClick={onOpenSlip}
        />

        {ticket.status !== 'COMPLETED' && (
          <Can permission="queue:cancel">
            <IconButton
              icon="x-circle"
              label="ยกเลิกคิว"
              variant="ghost"
              size="lg"
              className="ml-auto text-danger hover:bg-danger-soft"
              onClick={onCancel}
            />
          </Can>
        )}
      </div>
    </article>
  )
}

function Cell({ label, value, tone }: Readonly<{ label: string; value: string; tone?: string }>) {
  return (
    <div className="bg-white px-2 py-2.5">
      <dt className="text-[.66rem] font-semibold uppercase tracking-[.3px] text-ink-faint">
        {label}
      </dt>
      <dd className={cn('dash-num mt-0.5 text-[.84rem] font-bold text-ink', tone)}>{value}</dd>
    </div>
  )
}
