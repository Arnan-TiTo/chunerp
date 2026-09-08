import { useNavigate } from 'react-router-dom'
import { EXPENSE_STATUS } from '@/constants'
import type { Expense } from '@/types/domain'
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
import { StatusBadge, Badge } from '@/components/ui/StatusBadge'
import { Icon } from '@/components/ui/Icon'
import { Button, LinkButton } from '@/components/ui/Button'
import { Can } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { useBranchOptions } from '@/features/master/hooks'
import { useListParams } from '@/hooks/useListParams'
import { formatCurrency, formatDateTH } from '@/utils/format'
import { useExpenseCategories, useExpenseList } from './hooks'

/** EXP-001 — §8.1 columns, all filters URL-synced. */
export function ExpenseListPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { params, update, reset, setSort, activeFilterCount } = useListParams({
    defaultSortBy: 'expenseDate',
    extraKeys: ['categoryId', 'createdBy'],
  })
  const { data: categories } = useExpenseCategories()
  const { options: branchOptions } = useBranchOptions()
  const { data, isPending, error, refetch } = useExpenseList(params)

  const mineOnly = params.createdBy === user?.id

  const columns: Column<Expense>[] = [
    {
      key: 'expenseNo',
      header: 'เลขที่',
      sortable: true,
      width: '10rem',
      cell: (e) => <span className="dash-num font-semibold text-forest">{e.expenseNo}</span>,
    },
    {
      key: 'expenseDate',
      header: 'วันที่',
      sortable: true,
      width: '8rem',
      cell: (e) => <span className="dash-num">{formatDateTH(e.expenseDate)}</span>,
    },
    {
      key: 'categoryName',
      header: 'ประเภท',
      sortable: true,
      width: '12rem',
      cell: (e) => (
        <span>
          <Badge tone="info">{e.categoryName}</Badge>
          {e.expenseTypeName && (
            <span className="mt-1 block text-[.72rem] text-ink-faint">{e.expenseTypeName}</span>
          )}
        </span>
      ),
    },
    {
      key: 'description',
      header: 'รายละเอียด',
      cell: (e) => (
        <span className="block max-w-[22rem] truncate" title={e.description}>
          {e.description}
          {e.vendor && <span className="block text-[.74rem] text-ink-faint">{e.vendor}</span>}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'จำนวนเงิน',
      align: 'right',
      sortable: true,
      width: '9rem',
      cell: (e) => <span className="font-bold">{formatCurrency(e.amount)}</span>,
    },
    {
      key: 'branchName',
      header: 'สาขา',
      hideBelow: 'lg',
      cell: (e) => e.branchName,
    },
    {
      key: 'createdByName',
      header: 'ผู้บันทึก',
      hideBelow: 'lg',
      cell: (e) => e.createdByName,
    },
    {
      key: 'status',
      header: 'สถานะ',
      width: '9rem',
      cell: (e) => <StatusBadge status={EXPENSE_STATUS[e.status]} />,
    },
    {
      key: 'attachments',
      header: '',
      align: 'center',
      width: '3rem',
      hideBelow: 'md',
      cell: (e) =>
        e.attachments.length > 0 ? (
          <span
            className="inline-flex items-center gap-0.5 text-[.74rem] text-ink-faint"
            title={`${e.attachments.length} ไฟล์แนบ`}
          >
            <Icon name="file" size={13} />
            {e.attachments.length}
          </span>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '3rem',
      cell: () => <Icon name="chevron-right" size={16} className="text-ink-faint" />,
    },
  ]

  const pageTotal = (data?.items ?? []).reduce((s, e) => s + e.amount, 0)

  return (
    <>
      <PageHeader
        title="บันทึกค่าใช้จ่าย"
        subtitle={`${data?.total ?? 0} รายการ · รวมในหน้านี้ ${formatCurrency(pageTotal)}`}
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              iconLeft="user"
              className={mineOnly ? 'border-forest bg-forest-soft text-forest' : undefined}
              onClick={() => update({ createdBy: mineOnly ? undefined : user?.id })}
            >
              งานของฉัน
            </Button>
            <Can permission="expense:create">
              <LinkButton to="/expenses/new" variant="green" iconLeft="plus">
                บันทึกค่าใช้จ่าย
              </LinkButton>
            </Can>
          </>
        }
      />

      <FilterBar onReset={reset} activeCount={activeFilterCount}>
        <FilterField label="ค้นหา" className="flex-1 sm:min-w-[15rem]">
          <SearchBox
            value={params.search ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="เลขที่ / รายละเอียด / ผู้ขาย"
          />
        </FilterField>
        <FilterField label="ประเภท" className="sm:w-48">
          <Select
            placeholder="ทุกประเภท"
            value={(params.categoryId as string) ?? ''}
            options={(categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
            onChange={(e) => update({ categoryId: e.target.value })}
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
            options={Object.entries(EXPENSE_STATUS).map(([value, meta]) => ({
              value,
              label: meta.label,
            }))}
            onChange={(e) => update({ status: e.target.value })}
          />
        </FilterField>
        <FilterField label="ช่วงวันที่">
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
        rowKey={(e) => e.id}
        loading={isPending}
        error={error}
        onRetry={() => void refetch()}
        onRowClick={(e) => navigate(`/expenses/${e.id}`)}
        sortBy={params.sortBy}
        sortDir={params.sortDir}
        onSortChange={setSort}
        emptyTitle="ไม่พบรายการค่าใช้จ่าย"
        emptyDescription="ลองปรับตัวกรอง หรือบันทึกรายการใหม่"
        emptyAction={
          <Can permission="expense:create">
            <LinkButton to="/expenses/new" variant="green" iconLeft="plus">
              บันทึกค่าใช้จ่าย
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
