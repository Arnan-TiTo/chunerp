import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn } from '@/utils/cn'
import type { ReportColumn, ReportId } from '@/services/api/contracts'
import { services } from '@/services'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/data-display/PageHeader'
import { FilterBar, FilterField } from '@/components/data-display/FilterBar'
import { Select } from '@/components/form/Select'
import { DateRangeInput } from '@/components/form/Input'
import { EmptyState, ErrorState, SkeletonTable } from '@/components/feedback/States'
import { useToast } from '@/components/feedback/Toast'
import { Can } from '@/features/auth/guards'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useBranchOptions } from '@/features/master/hooks'
import {
  formatCurrency,
  formatDateTH,
  formatDateTimeTH,
  formatNumber,
  formatWeight,
} from '@/utils/format'

function renderCell(value: string | number | null, format: ReportColumn['format']): string {
  if (value == null) return '—'
  switch (format) {
    case 'currency':
      return formatCurrency(Number(value), { digits: 0 })
    case 'weight':
      return formatWeight(Number(value))
    case 'number':
      return formatNumber(Number(value))
    case 'date':
      return formatDateTH(String(value))
    default:
      return String(value)
  }
}

/** Turns the current result into a CSV the user's spreadsheet can open. */
function toCsv(columns: ReportColumn[], rows: Record<string, string | number | null>[]): string {
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\n')
  // Leading BOM so Excel opens the Thai column headers as UTF-8.
  return `﻿${header}\n${body}`
}

/** REP-001 — report shell: definitions, filters, export-ready table. */
export function ReportsPage() {
  const toast = useToast()
  const { branchId, range } = useBranchContext()
  const [reportId, setReportId] = useState<ReportId>('PURCHASE_SUMMARY')
  const { options: branchOptions } = useBranchOptions()
  const [filters, setFilters] = useState({
    branchId,
    dateFrom: range.from,
    dateTo: range.to,
  })

  const { data: definitions } = useQuery({
    queryKey: ['reports', 'definitions'],
    queryFn: () => services.reports.definitions(),
    staleTime: 10 * 60_000,
  })

  const {
    data: result,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ['reports', 'run', reportId, filters],
    queryFn: () => services.reports.run(reportId, filters),
  })

  const definition = useMemo(
    () => definitions?.find((d) => d.id === reportId),
    [definitions, reportId],
  )

  const exportCsv = () => {
    if (!result) return
    const csv = toCsv(result.columns, result.rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${result.reportId}-${filters.dateFrom}-${filters.dateTo}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success('ส่งออกไฟล์ CSV แล้ว', `${result.rows.length} แถว`)
  }

  return (
    <>
      <PageHeader
        title="ศูนย์รายงาน"
        subtitle={
          result
            ? `${result.title} · ${result.rows.length} แถว · สร้างเมื่อ ${formatDateTimeTH(result.generatedAt)}`
            : 'เลือกรายงานและช่วงข้อมูลที่ต้องการ'
        }
        actions={
          <Can permission="report:export">
            <Button
              variant="ghost"
              iconLeft="download"
              disabled={!result || result.rows.length === 0}
              onClick={exportCsv}
            >
              ส่งออก CSV
            </Button>
          </Can>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(definitions ?? []).map((def) => {
          const active = def.id === reportId
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => setReportId(def.id)}
              className={cn(
                'rounded-lg px-5 py-4 text-left shadow-md transition-[transform,box-shadow]',
                'hover:-translate-y-0.5 hover:shadow-lg',
                active ? 'bg-forest text-white' : 'bg-white',
              )}
            >
              <span
                className={cn(
                  'mb-3 grid h-9 w-9 place-items-center rounded-[9px]',
                  active ? 'bg-white/15 text-white' : 'bg-forest-soft text-forest',
                )}
              >
                <Icon name="chart" size={17} />
              </span>
              <span className={cn('block text-[.92rem] font-bold', active ? 'text-white' : 'text-ink')}>
                {def.title}
              </span>
              <span
                className={cn(
                  'mt-1 block text-[.76rem] leading-relaxed',
                  active ? 'text-white/75' : 'text-ink-faint',
                )}
              >
                {def.description}
              </span>
            </button>
          )
        })}
      </div>

      <FilterBar>
        <FilterField label="สาขา" className="sm:w-52">
          <Select
            placeholder="ทุกสาขา"
            value={filters.branchId === 'ALL' ? '' : filters.branchId}
            options={branchOptions}
            onChange={(e) => setFilters((f) => ({ ...f, branchId: e.target.value || 'ALL' }))}
          />
        </FilterField>
        <FilterField label="ช่วงข้อมูล">
          <DateRangeInput
            from={filters.dateFrom}
            to={filters.dateTo}
            onChange={({ from, to }) => setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))}
          />
        </FilterField>
        <Button
          variant="primary"
          size="sm"
          iconLeft="refresh"
          className="sm:ml-auto"
          loading={isFetching}
          onClick={() => void refetch()}
        >
          สร้างรายงาน
        </Button>
      </FilterBar>

      <Card>
        <CardHeader
          title={definition?.title ?? 'รายงาน'}
          icon="chart"
          subtitle={definition?.description}
        />
        {error ? (
          <ErrorState error={error} onRetry={() => void refetch()} />
        ) : isFetching && !result ? (
          <SkeletonTable rows={8} columns={5} />
        ) : !result || result.rows.length === 0 ? (
          <EmptyState
            icon="chart"
            title="ไม่มีข้อมูลในช่วงที่เลือก"
            description="ลองขยายช่วงวันที่ หรือเปลี่ยนสาขา"
          />
        ) : (
          <div className="app-scroll overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse">
              <thead>
                <tr>
                  {result.columns.map((col) => (
                    <th
                      key={col.key}
                      scope="col"
                      className={cn(
                        'border-b border-forest-dark bg-forest px-[22px] py-[11px] text-[.72rem] font-bold uppercase tracking-[.5px] text-white',
                        col.align === 'right' ? 'text-right' : 'text-left',
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-[#f8faf6]">
                    {result.columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'border-b border-line-faint px-[22px] py-[13px] text-[.86rem] text-ink',
                          col.align === 'right' ? 'dash-num text-right' : 'text-left',
                        )}
                      >
                        {renderCell(row[col.key], col.format)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {result.totals && (
                <tfoot>
                  <tr className="bg-line-faint">
                    {result.columns.map((col, i) => {
                      const total = result.totals?.[col.key]
                      return (
                        <td
                          key={col.key}
                          className={cn(
                            'px-[22px] py-3.5 text-[.86rem] font-bold',
                            col.align === 'right' ? 'dash-num text-right' : 'text-left',
                          )}
                        >
                          {i === 0 ? 'รวมทั้งหมด' : total != null ? renderCell(total, col.format) : ''}
                        </td>
                      )
                    })}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </Card>
    </>
  )
}
