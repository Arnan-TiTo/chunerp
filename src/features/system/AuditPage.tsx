import { useQuery } from '@tanstack/react-query'
import type { AuditEntry } from '@/types/common'
import { services } from '@/services'
import { PageHeader } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import {
  FilterBar,
  FilterField,
  PaginationFor,
  SearchBox,
} from '@/components/data-display/FilterBar'
import { DateRangeInput } from '@/components/form/Input'
import { Badge } from '@/components/ui/StatusBadge'
import { Icon } from '@/components/ui/Icon'
import { useListParams } from '@/hooks/useListParams'
import { formatDateTimeTH } from '@/utils/format'

/** SYS-001 — who / when / action / before-after / reference (§14). */
export function AuditPage() {
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'at',
  })

  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['audit', params],
    queryFn: () => services.system.audit(params),
    placeholderData: (prev) => prev,
  })

  const columns: Column<AuditEntry>[] = [
    {
      key: 'at',
      header: 'เวลา',
      sortable: true,
      width: '12rem',
      cell: (a) => <span className="dash-num">{formatDateTimeTH(a.at)}</span>,
    },
    {
      key: 'actorName',
      header: 'ผู้ใช้งาน',
      sortable: true,
      cell: (a) => (
        <span className="flex items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-meadow text-[.68rem] font-bold text-white">
            {a.actorName.slice(0, 1)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{a.actorName}</span>
            <span className="dash-num block text-[.72rem] text-ink-faint">{a.actorId}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'action',
      header: 'การกระทำ',
      sortable: true,
      width: '13rem',
      cell: (a) => <Badge tone="info">{a.action}</Badge>,
    },
    {
      key: 'entity',
      header: 'รายการ',
      hideBelow: 'md',
      cell: (a) => (
        <span>
          <span className="block text-ink">{a.entity}</span>
          <span className="dash-num block text-[.72rem] text-ink-faint">{a.entityId}</span>
        </span>
      ),
    },
    {
      key: 'reference',
      header: 'อ้างอิง',
      hideBelow: 'lg',
      cell: (a) => <span className="dash-num text-ink-dim">{a.reference ?? '—'}</span>,
    },
    {
      key: 'diff',
      header: 'ก่อน → หลัง',
      hideBelow: 'lg',
      cell: (a) =>
        a.before || a.after ? (
          <span className="flex flex-wrap items-center gap-1.5 text-[.74rem]">
            <span className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">
              {JSON.stringify(a.before)}
            </span>
            <Icon name="arrow-right" size={11} className="text-ink-faint" />
            <span className="rounded bg-meadow-soft px-1.5 py-0.5 text-meadow-deep">
              {JSON.stringify(a.after)}
            </span>
          </span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
  ]

  return (
    <>
      <PageHeader
        title="ประวัติการใช้งาน"
        subtitle={`${data?.total ?? 0} รายการ · บันทึกทุกการเปลี่ยนแปลงสำคัญ`}
      />

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[16rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="ผู้ใช้ / การกระทำ / รายการ / เลขที่อ้างอิง"
          />
        </FilterField>
        <FilterField label="ช่วงเวลา">
          <DateRangeInput
            from={params.dateFrom ?? ''}
            to={params.dateTo ?? ''}
            onChange={({ from, to }) => update({ dateFrom: from, dateTo: to })}
          />
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(a) => a.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ไม่พบประวัติที่ตรงกับเงื่อนไข"
        footer={
          <PaginationFor
            data={data}
            onPageChange={(page) => update({ page }, false)}
            onPageSizeChange={(pageSize) => update({ pageSize })}
          />
        }
      />
    </>
  )
}
