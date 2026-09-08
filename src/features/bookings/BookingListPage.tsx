import { useNavigate } from 'react-router-dom'
import { BOOKING_STATUS } from '@/constants'
import type { Booking } from '@/types/domain'
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
import { LinkButton } from '@/components/ui/Button'
import { Can } from '@/features/auth/guards'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatDateTH, formatNumber } from '@/utils/format'
import { useBookingList } from './hooks'

/** BOOK-001 — booking register with status, branch and date-range filters. */
export function BookingListPage() {
  const navigate = useNavigate()
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'bookingDate',
  })
  const { data, isPending, error, refetch } = useBookingList(params)
  const { options: branchOptions } = useBranchOptions()

  const columns: Column<Booking>[] = [
    {
      key: 'bookingNo',
      header: 'เลขที่ใบจอง',
      sortable: true,
      width: '10rem',
      cell: (b) => <span className="dash-num font-semibold text-forest">{b.bookingNo}</span>,
    },
    {
      key: 'bookingDate',
      header: 'วันที่จอง',
      sortable: true,
      width: '8rem',
      cell: (b) => <span className="dash-num">{formatDateTH(b.bookingDate)}</span>,
    },
    {
      key: 'farmerName',
      header: 'เกษตรกร',
      sortable: true,
      cell: (b) => (
        <span>
          <span className="block font-semibold text-ink">{b.farmerName}</span>
          <span className="dash-num block text-[.76rem] text-ink-faint">{b.farmerCode}</span>
        </span>
      ),
    },
    {
      key: 'breedName',
      header: 'สายพันธุ์ / รุ่น',
      hideBelow: 'md',
      cell: (b) => (
        <span>
          <span className="block text-ink">{b.breedName}</span>
          <span className="block text-[.76rem] text-ink-faint">
            {b.batchNo}
            {b.hatchDate && ` · ฟัก ${formatDateTH(b.hatchDate)}`}
          </span>
        </span>
      ),
    },
    {
      key: 'quantity',
      header: 'จำนวน',
      align: 'right',
      sortable: true,
      width: '7rem',
      cell: (b) => (
        <span className="font-semibold">
          {formatNumber(b.quantity, b.quantity % 1 === 0 ? 0 : 2)}{' '}
          <span className="font-normal text-ink-faint">กล่อง</span>
        </span>
      ),
    },
    {
      key: 'branchName',
      header: 'สาขา',
      hideBelow: 'lg',
      cell: (b) => b.branchName,
    },
    {
      key: 'expectedDeliveryDate',
      header: 'กำหนดส่ง',
      align: 'right',
      sortable: true,
      hideBelow: 'md',
      cell: (b) => <span className="dash-num">{formatDateTH(b.expectedDeliveryDate)}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      width: '9rem',
      cell: (b) => <StatusBadge status={BOOKING_STATUS[b.status]} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '3rem',
      cell: () => <Icon name="chevron-right" size={16} className="text-ink-faint" />,
    },
  ]

  return (
    <>
      <PageHeader
        title="จองไข่ไหม"
        subtitle={`ใบจองทั้งหมด · ${data?.total ?? 0} ใบ`}
        actions={
          <Can permission="booking:create">
            <LinkButton to="/bookings/new" variant="green" iconLeft="plus">
              สร้างใบจอง
            </LinkButton>
          </Can>
        }
      />

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="เลขที่ใบจอง / ชื่อเกษตรกร / รุ่น"
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
            options={Object.entries(BOOKING_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            onChange={(e) => update({ status: e.target.value })}
          />
        </FilterField>
        <FilterField label="ช่วงวันที่จอง">
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
        rowKey={(b) => b.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(b) => navigate(`/bookings/${b.id}`)}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ไม่พบใบจองที่ตรงกับเงื่อนไข"
        emptyDescription="ลองปรับตัวกรองหรือสร้างใบจองใหม่"
        emptyAction={
          <Can permission="booking:create">
            <LinkButton to="/bookings/new" variant="green" iconLeft="plus">
              สร้างใบจอง
            </LinkButton>
          </Can>
        }
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
