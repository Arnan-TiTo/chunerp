import { useNavigate } from 'react-router-dom'
import { DEBT_STATUS } from '@/constants'
import type { DebtRecord } from '@/types/domain'
import { PageHeader } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import {
  FilterBar,
  FilterField,
  PaginationFor,
  SearchBox,
} from '@/components/data-display/FilterBar'
import { Select } from '@/components/form/Select'
import { DateRangeInput } from '@/components/form/Input'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Icon } from '@/components/ui/Icon'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatCurrency, formatDateTH } from '@/utils/format'
import { useDebtList } from './hooks'

/** DEBT-001 — outstanding balances with the deduction ceiling visible up front. */
export function DebtListPage() {
  const navigate = useNavigate()
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'createdAt',
  })
  const { data, isPending, error, refetch } = useDebtList(params)
  const { options: branchOptions } = useBranchOptions()

  const columns: Column<DebtRecord>[] = [
    {
      key: 'sourceNo',
      header: 'ใบจองต้นทาง',
      sortable: true,
      width: '11rem',
      cell: (d) => <span className="dash-num font-semibold text-forest">{d.sourceNo}</span>,
    },
    {
      key: 'farmerName',
      header: 'เกษตรกร',
      sortable: true,
      cell: (d) => (
        <span>
          <span className="block font-semibold text-ink">{d.farmerName}</span>
          <span className="dash-num block text-[.76rem] text-ink-faint">
            {d.farmerCode} · {d.branchName}
          </span>
        </span>
      ),
    },
    {
      // Deductions are matched round by round, so the รอบ is a first-class column.
      key: 'batchNo',
      header: 'รอบ',
      sortable: true,
      hideBelow: 'md',
      width: '7rem',
      cell: (d) => <span className="dash-num">{d.batchNo}</span>,
    },
    {
      key: 'createdAt',
      header: 'วันที่ตั้งหนี้',
      sortable: true,
      hideBelow: 'lg',
      cell: (d) => <span className="dash-num">{formatDateTH(d.createdAt)}</span>,
    },
    {
      key: 'originalAmount',
      header: 'หนี้ตั้งต้น',
      align: 'right',
      sortable: true,
      hideBelow: 'md',
      cell: (d) => formatCurrency(d.originalAmount, { digits: 0 }),
    },
    {
      key: 'deductedAmount',
      header: 'ตัดแล้ว',
      align: 'right',
      sortable: true,
      hideBelow: 'lg',
      cell: (d) =>
        d.deductedAmount > 0 ? (
          <span className="text-meadow-deep">{formatCurrency(d.deductedAmount, { digits: 0 })}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'remainingBalance',
      header: 'คงเหลือ',
      align: 'right',
      sortable: true,
      cell: (d) => (
        <span className={d.remainingBalance > 0 ? 'font-bold text-danger' : 'font-bold text-meadow-deep'}>
          {formatCurrency(d.remainingBalance, { digits: 0 })}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      width: '9rem',
      cell: (d) => <StatusBadge status={DEBT_STATUS[d.status]} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '3rem',
      cell: () => <Icon name="chevron-right" size={16} className="text-ink-faint" />,
    },
  ]

  const totalOutstanding = (data?.items ?? []).reduce((s, d) => s + d.remainingBalance, 0)

  return (
    <>
      <PageHeader
        title="ตัดหนี้รังไหมสด"
        subtitle={`${data?.total ?? 0} รายการ · คงเหลือในหน้านี้ ${formatCurrency(totalOutstanding, { digits: 0 })}`}
      />

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="เลขที่รายการ / ชื่อเกษตรกร / รหัส"
          />
        </FilterField>
        <FilterField label="สาขา" className="sm:w-44">
          <Select
            placeholder="ทุกสาขา"
            value={params.branchId ?? ''}
            options={branchOptions}
            onChange={(e) => update({ branchId: e.target.value })}
          />
        </FilterField>
        <FilterField label="สถานะ" className="sm:w-40">
          <Select
            placeholder="ทุกสถานะ"
            value={params.status ?? ''}
            options={Object.entries(DEBT_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            onChange={(e) => update({ status: e.target.value })}
          />
        </FilterField>
        <FilterField label="ช่วงวันที่รับซื้อ">
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
        rowKey={(d) => d.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(d) => navigate(`/debts/${d.id}`)}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ไม่พบรายการหนี้ที่ตรงกับเงื่อนไข"
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
