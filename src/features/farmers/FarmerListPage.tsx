import { useNavigate } from 'react-router-dom'
import { FARMER_STATUS } from '@/constants'
import type { Farmer } from '@/types/domain'
import { PageHeader } from '@/components/data-display/PageHeader'
import { DataTable, type Column } from '@/components/data-display/DataTable'
import {
  FilterBar,
  FilterField,
  PaginationFor,
  SearchBox,
} from '@/components/data-display/FilterBar'
import { Select } from '@/components/form/Select'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { Icon } from '@/components/ui/Icon'
import { LinkButton } from '@/components/ui/Button'
import { Can } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatCurrency, formatDateTH, maskPhone } from '@/utils/format'
import { useFarmerList } from './hooks'

/** FAR-001 — search, branch, status, sort and pagination, all URL-synced. */
export function FarmerListPage() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'fullName',
    defaultSortDir: 'asc',
  })
  const { data, isPending, error, refetch } = useFarmerList(params)
  const { options: branchOptions } = useBranchOptions()
  const unmaskSensitive = can('farmer:viewSensitive')

  const columns: Column<Farmer>[] = [
    {
      key: 'code',
      header: 'รหัส',
      sortable: true,
      width: '7.5rem',
      cell: (f) => <span className="dash-num font-semibold text-forest">{f.code}</span>,
    },
    {
      key: 'fullName',
      header: 'ชื่อ-สกุล',
      sortable: true,
      cell: (f) => (
        <span>
          <span className="block font-semibold text-ink">{f.fullName}</span>
          <span className="block text-[.76rem] text-ink-faint">
            {maskPhone(f.phone, unmaskSensitive)}
          </span>
        </span>
      ),
    },
    {
      key: 'branchName',
      header: 'สาขา',
      sortable: true,
      hideBelow: 'md',
      cell: (f) => f.branchName,
    },
    {
      key: 'district',
      header: 'พื้นที่',
      hideBelow: 'lg',
      cell: (f) => (
        <span className="text-ink-dim">
          {[f.district, f.province].filter(Boolean).join(' · ') || '—'}
        </span>
      ),
    },
    {
      key: 'programs',
      header: 'โครงการ',
      hideBelow: 'lg',
      cell: (f) => {
        const active = [
          f.programs.julUamJai && 'ไหมจุลอุ่นใจ',
          f.programs.debtRelief && 'บรรเทาหนี้',
          f.programs.guaranteedGoodPrice && 'ประกันราคา',
        ].filter(Boolean) as string[]
        if (active.length === 0) return <span className="text-ink-faint">—</span>
        return (
          <span className="flex flex-wrap gap-1">
            {active.map((p) => (
              <span
                key={p}
                className="rounded-pill bg-meadow-soft px-2 py-0.5 text-[.68rem] font-semibold text-meadow-deep"
              >
                {p}
              </span>
            ))}
          </span>
        )
      },
    },
    {
      key: 'outstandingDebt',
      header: 'หนี้คงค้าง',
      align: 'right',
      sortable: true,
      cell: (f) =>
        f.outstandingDebt > 0 ? (
          <span className="font-semibold text-danger">{formatCurrency(f.outstandingDebt, { digits: 0 })}</span>
        ) : (
          <span className="text-ink-faint">—</span>
        ),
    },
    {
      key: 'joinedAt',
      header: 'เข้าร่วมเมื่อ',
      align: 'right',
      sortable: true,
      hideBelow: 'md',
      cell: (f) => formatDateTH(f.joinedAt),
    },
    {
      key: 'status',
      header: 'สถานะ',
      cell: (f) => <StatusBadge status={FARMER_STATUS[f.status]} />,
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
        title="ส่งเสริมเกษตรกร"
        subtitle={`ทะเบียนเกษตรกร · ${data?.total ?? 0} ราย`}
        actions={
          <Can permission="farmer:create">
            <LinkButton to="/farmers/new" variant="green" iconLeft="plus">
              เพิ่มเกษตรกร
            </LinkButton>
          </Can>
        }
      />

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[16rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="ชื่อ / รหัสเกษตรกร / เบอร์โทร"
          />
        </FilterField>
        <FilterField label="สาขา" className="sm:w-48">
          <Select
            placeholder="ทุกสาขา"
            value={params.branchId ?? ''}
            options={branchOptions}
            onChange={(e) => update({ branchId: e.target.value })}
          />
        </FilterField>
        <FilterField label="สถานะ" className="sm:w-44">
          <Select
            placeholder="ทุกสถานะ"
            value={params.status ?? ''}
            options={Object.entries(FARMER_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            onChange={(e) => update({ status: e.target.value })}
          />
        </FilterField>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={data?.items ?? []}
        rowKey={(f) => f.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(f) => navigate(`/farmers/${f.id}`)}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ไม่พบเกษตรกรที่ตรงกับเงื่อนไข"
        emptyDescription="ลองปรับคำค้นหรือล้างตัวกรอง"
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
