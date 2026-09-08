import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { COCOON_QTY_UNIT, QUEUE_STATUS } from '@/constants'
import type { QueueTicket } from '@/types/domain'
import { PageHeader, Tabs } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import { FilterBar, FilterField, SearchBox } from '@/components/data-display/FilterBar'
import { Select } from '@/components/form/Select'
import { Button, IconButton, LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { useToast } from '@/components/feedback/Toast'
import { Can } from '@/features/auth/guards'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatDateTH, formatNumber, formatTime, todayInput } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'
import { useQueue, useQueueActions } from './hooks'

/**
 * จุดคัดแยก — station 1.
 *
 * Lists the slips written today: drafts still being sorted, and the ones
 * already issued and handed over to the scale.
 */
const TABS = [
  { id: 'SORTING', label: 'กำลังคัดแยก', statuses: ['SORTING'] },
  { id: 'ISSUED', label: 'ออกใบคิวแล้ว', statuses: ['WAITING_WEIGH', 'CALLED', 'WEIGHING', 'COMPLETED'] },
  { id: 'CANCELLED', label: 'ยกเลิก', statuses: ['CANCELLED'] },
] as const

export function SortingPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const { branchId } = useBranchContext()
  const { params, update, reset, activeFilterCount } = useListParams({ defaultPageSize: 100 })
  const [tab, setTab] = useState<string>('SORTING')
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
  const { cancel } = useQueueActions()

  const statuses = TABS.find((t) => t.id === tab)?.statuses ?? []
  const rows = (data?.items ?? []).filter((t) =>
    (statuses as readonly string[]).includes(t.status),
  )

  const counts = useMemo(() => {
    const all = data?.items ?? []
    return Object.fromEntries(
      TABS.map((t) => [
        t.id,
        all.filter((x) => (t.statuses as readonly string[]).includes(x.status)).length,
      ]),
    )
  }, [data])

  const columns: Column<QueueTicket>[] = [
    {
      key: 'queueNo',
      header: 'เลขคิว',
      width: '6.5rem',
      cell: (t) =>
        t.queueNo != null ? (
          <span className="dash-num grid h-9 w-9 place-items-center rounded-[9px] bg-[color:var(--accent-soft)] text-base font-bold text-[color:var(--accent)]">
            {t.queueNo}
          </span>
        ) : (
          <span className="text-[.76rem] text-ink-faint">ยังไม่ออก</span>
        ),
    },
    {
      key: 'farmerName',
      header: 'เกษตรกร',
      cell: (t) => (
        <span>
          <span className="block font-semibold text-ink">{t.farmerName}</span>
          <span className="dash-num block text-[.76rem] text-ink-faint">
            {t.farmerCode} · {t.branchName}
          </span>
        </span>
      ),
    },
    {
      key: 'breedName',
      header: 'สายพันธุ์ / โครงการ',
      hideBelow: 'md',
      cell: (t) => (
        <span>
          <span className="block text-ink">{t.breedName ?? '—'}</span>
          <span className="block text-[.76rem] text-ink-faint">{t.projectName ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'hatchDate',
      header: 'รุ่นฟัก',
      hideBelow: 'lg',
      cell: (t) => <span className="dash-num">{formatDateTH(t.hatchDate)}</span>,
    },
    {
      key: 'expectedBoxes',
      header: 'จองไป',
      align: 'right',
      hideBelow: 'md',
      cell: (t) =>
        t.expectedBoxes != null ? (
          <span>
            {formatNumber(t.expectedBoxes, 1)}{' '}
            <span className="font-normal text-ink-faint">กล่อง</span>
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'arrivedAt',
      header: 'มาถึง',
      align: 'right',
      hideBelow: 'lg',
      cell: (t) => <span className="dash-num">{formatTime(t.arrivedAt)}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      width: '9.5rem',
      cell: (t) => <StatusBadge status={QUEUE_STATUS[t.status]} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '6rem',
      cell: (t) => (
        <span className="flex items-center justify-end gap-1.5">
          {t.status === 'SORTING' && (
            <Can permission="queue:cancel">
              <IconButton
                icon="x-circle"
                label="ยกเลิกใบคิว"
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                onClick={(e) => {
                  e.stopPropagation()
                  setCancelTarget(t)
                }}
              />
            </Can>
          )}
          <Icon name="chevron-right" size={16} className="text-ink-faint" />
        </span>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title="จุดคัดแยก"
        subtitle={`ออกใบคิวรับซื้อรังไหมสด · วันนี้ ${data?.total ?? 0} ใบ`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              iconLeft="refresh"
              onClick={() => void refetch()}
              loading={isFetching}
            >
              รีเฟรช
            </Button>
            <Can permission="queue:create">
              <LinkButton to="/receiving/sorting/new" variant="green" iconLeft="plus">
                ออกใบคิวใหม่
              </LinkButton>
            </Can>
          </>
        }
      >
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={TABS.map((t) => ({ id: t.id, label: t.label, count: counts[t.id] }))}
        />
      </PageHeader>

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="ชื่อเกษตรกร / รหัส / เลขคิว"
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

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(t) => navigate(`/receiving/sorting/${t.id}`)}
        emptyTitle={
          tab === 'SORTING' ? 'ยังไม่มีใบคิวที่กำลังคัดแยก' : 'ไม่มีรายการในหมวดนี้'
        }
        emptyDescription={`เมื่อเกษตรกรนำรังไหมมาถึง ให้กดออกใบคิวใหม่ แล้วกรอกผลคัดแยกทีละประเภท (หน่วย: ${COCOON_QTY_UNIT})`}
        emptyAction={
          <Can permission="queue:create">
            <LinkButton to="/receiving/sorting/new" variant="green" iconLeft="plus">
              ออกใบคิวใหม่
            </LinkButton>
          </Can>
        }
      />

      <ConfirmDialog
        open={cancelTarget != null}
        onClose={() => setCancelTarget(null)}
        onConfirm={async () => {
          if (!cancelTarget) return
          try {
            await cancel.mutateAsync({
              queueId: cancelTarget.id,
              reason: 'ยกเลิกที่จุดคัดแยก',
            })
            toast.success('ยกเลิกใบคิวแล้ว')
          } catch (err) {
            toast.error('ยกเลิกไม่สำเร็จ', toUserMessage(err))
          } finally {
            setCancelTarget(null)
          }
        }}
        title="ยกเลิกใบคิว"
        message={cancelTarget ? `ยืนยันยกเลิกใบคิวของ ${cancelTarget.farmerName}?` : ''}
        confirmLabel="ยกเลิกใบคิว"
        tone="danger"
        loading={cancel.isPending}
      />
    </>
  )
}
