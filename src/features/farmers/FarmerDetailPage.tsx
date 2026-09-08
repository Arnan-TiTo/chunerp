import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { FARMER_STATUS } from '@/constants'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LinkButton } from '@/components/ui/Button'
import { StatusBadge, Badge } from '@/components/ui/StatusBadge'
import { DescriptionList, PageHeader, Tabs } from '@/components/data-display/PageHeader'
import { SummaryCard } from '@/components/data-display/KpiCard'
import { EmptyState, ErrorState, SkeletonText } from '@/components/feedback/States'
import { Can } from '@/features/auth/guards'
import { useAuth } from '@/features/auth/AuthProvider'
import { FullPageLoader } from '@/features/auth/guards'
import { formatCurrency, formatDateTH, maskNationalId, maskPhone } from '@/utils/format'
import { useFarmer, useFarmerHistory } from './hooks'
import type { FarmerHistoryItem } from '@/services/api/contracts'

const HISTORY_META: Record<FarmerHistoryItem['kind'], { label: string; icon: IconName; tint: string }> = {
  BOOKING: { label: 'ใบจอง', icon: 'package', tint: 'bg-forest-soft text-forest' },
  RECEIVING: { label: 'รับซื้อ', icon: 'scale', tint: 'bg-sage-soft text-sage' },
  PAYMENT: { label: 'จ่ายเงิน', icon: 'wallet', tint: 'bg-meadow-soft text-meadow-deep' },
  DEBT: { label: 'ตัดหนี้', icon: 'coins', tint: 'bg-tan-soft text-tan' },
}

/** FAR-003 — profile plus a filterable activity timeline. */
export function FarmerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { can } = useAuth()
  const [tab, setTab] = useState('all')

  const { data: farmer, isPending, error, refetch } = useFarmer(id)
  const { data: history, isPending: historyPending } = useFarmerHistory(id)

  if (isPending) return <FullPageLoader label="กำลังโหลดข้อมูลเกษตรกร..." />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (!farmer) return <ErrorState error={new Error('ไม่พบข้อมูลเกษตรกร')} />

  const unmask = can('farmer:viewSensitive')
  const items = (history ?? []).filter((h) => tab === 'all' || h.kind === tab)

  const programs = [
    farmer.programs.julUamJai && 'ไหมจุลอุ่นใจ',
    farmer.programs.debtRelief && 'บรรเทาหนี้',
    farmer.programs.guaranteedGoodPrice && 'ประกันราคารังดี 200 บาท/กก.',
  ].filter(Boolean) as string[]

  return (
    <>
      <PageHeader
        title={farmer.fullName}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="dash-num font-semibold text-forest">{farmer.code}</span>
            <span className="text-ink-faint">· {farmer.branchName}</span>
            <StatusBadge status={FARMER_STATUS[farmer.status]} />
          </span>
        }
        backTo="/farmers"
        breadcrumb={[{ label: 'ส่งเสริมเกษตรกร', to: '/farmers' }, { label: farmer.fullName }]}
        actions={
          <Can permission="farmer:edit">
            <LinkButton to={`/farmers/${farmer.id}/edit`} variant="primary" iconLeft="edit">
              แก้ไขข้อมูล
            </LinkButton>
          </Can>
        }
      />

      <div className="mb-[18px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="ยอดซื้อสะสม"
          value={formatCurrency(farmer.totalPurchaseAmount, { digits: 0 })}
          emphasis
        />
        <SummaryCard
          label="หนี้คงค้าง"
          value={formatCurrency(farmer.outstandingDebt, { digits: 0 })}
          tone={farmer.outstandingDebt > 0 ? 'danger' : 'success'}
          emphasis
          hint={farmer.outstandingDebt > 0 ? 'ดูรายการที่เมนูตัดหนี้' : 'ไม่มียอดค้าง'}
        />
        <SummaryCard label="เข้าร่วมเมื่อ" value={formatDateTH(farmer.joinedAt)} emphasis />
        <SummaryCard
          label="โครงการที่เข้าร่วม"
          value={programs.length > 0 ? `${programs.length} โครงการ` : '—'}
          emphasis
          hint={programs.join(' · ') || undefined}
        />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader title="ข้อมูลทั่วไป" icon="user" />
          <div className="px-[22px] py-5">
            <DescriptionList
              columns={2}
              items={[
                { label: 'รหัสเกษตรกร', value: <span className="dash-num">{farmer.code}</span> },
                { label: 'สาขา', value: farmer.branchName },
                {
                  label: 'เลขบัตรประชาชน',
                  value: (
                    <span className="dash-num">{maskNationalId(farmer.nationalId, unmask)}</span>
                  ),
                },
                {
                  label: 'เบอร์โทรศัพท์',
                  value: <span className="dash-num">{maskPhone(farmer.phone, unmask)}</span>,
                },
                {
                  label: 'ที่อยู่',
                  span: true,
                  value:
                    [farmer.address, farmer.subDistrict, farmer.district, farmer.province]
                      .filter(Boolean)
                      .join(' ') || '—',
                },
                {
                  label: 'โครงการ',
                  span: true,
                  value:
                    programs.length > 0 ? (
                      <span className="flex flex-wrap gap-1.5">
                        {programs.map((p) => (
                          <Badge key={p} tone="success" icon="check">
                            {p}
                          </Badge>
                        ))}
                      </span>
                    ) : (
                      '—'
                    ),
                },
              ]}
            />
            {!unmask && (
              <p className="mt-4 flex items-center gap-1.5 text-[.75rem] text-ink-faint">
                <Icon name="lock" size={13} />
                ข้อมูลอ่อนไหวถูกปิดบังตามสิทธิ์ของบัญชีคุณ
              </p>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="ประวัติการทำรายการ"
            icon="history"
            subtitle={`${history?.length ?? 0} รายการ`}
          />
          <div className="px-[22px] pt-3">
            <Tabs
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'all', label: 'ทั้งหมด', count: history?.length },
                { id: 'BOOKING', label: 'ใบจอง', count: history?.filter((h) => h.kind === 'BOOKING').length },
                { id: 'RECEIVING', label: 'รับซื้อ', count: history?.filter((h) => h.kind === 'RECEIVING').length },
                { id: 'DEBT', label: 'ตัดหนี้', count: history?.filter((h) => h.kind === 'DEBT').length },
              ]}
            />
          </div>

          {historyPending ? (
            <div className="px-[22px] py-5">
              <SkeletonText lines={6} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon="history" title="ยังไม่มีประวัติในหมวดนี้" />
          ) : (
            <ul className="max-h-[32rem] overflow-y-auto app-scroll">
              {items.map((item) => {
                const meta = HISTORY_META[item.kind]
                const row = (
                  <span className="flex items-center gap-3.5">
                    <span
                      className={cn(
                        'grid h-9 w-9 shrink-0 place-items-center rounded-[9px]',
                        meta.tint,
                      )}
                    >
                      <Icon name={meta.icon} size={16} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[.87rem] font-semibold text-ink">
                        {item.title}
                      </span>
                      <span className="block truncate text-[.76rem] text-ink-faint">
                        {[meta.label, item.detail, item.status].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      {item.amount != null && (
                        <span className="dash-num block text-[.86rem] font-bold text-ink">
                          {formatCurrency(item.amount, { digits: 0 })}
                        </span>
                      )}
                      <span className="dash-num block text-[.72rem] text-ink-faint">
                        {formatDateTH(item.at)}
                      </span>
                    </span>
                  </span>
                )
                return (
                  <li key={`${item.kind}-${item.id}`} className="border-b border-line-faint last:border-b-0">
                    {item.href ? (
                      <Link to={item.href} className="block px-[22px] py-3 transition-colors hover:bg-[#f8faf6]">
                        {row}
                      </Link>
                    ) : (
                      <div className="px-[22px] py-3">{row}</div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
