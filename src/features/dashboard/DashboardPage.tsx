import { Link, Navigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { ACCENT_CLASSES } from '@/constants/workTypes'
import { Icon, type IconName } from '@/components/ui/Icon'
import { LinkButton, Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/data-display/PageHeader'
import { formatKpi, KpiCard, KpiCardSkeleton } from '@/components/data-display/KpiCard'
import { DateRangeInput } from '@/components/form/Input'
import { ErrorState, Skeleton } from '@/components/feedback/States'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkArea } from '@/features/workarea/WorkAreaProvider'
import { useBranchContext } from '@/hooks/useBranchContext'
import { formatDateTimeTH } from '@/utils/format'
import { FullPageLoader } from '@/features/auth/guards'
import { buildDashboardParams, useDashboardSnapshot } from './hooks'
import { DashboardPanelCard, SPAN_CLASSES } from './panels'
import type { DashboardSnapshot, KpiValue, QueuePanelItem } from '@/types/dashboard'

/** Icon per KPI id — presentation only, so unknown ids still render. */
const KPI_ICONS: Record<string, IconName> = {
  documents: 'file',
  pending: 'clock',
  'purchase-amount': 'coins',
  'expense-amount': 'wallet',
  'today-queue': 'clock',
  'outstanding-debt': 'alert',
  'farmers-total': 'users',
  'farmers-active': 'check-circle',
  'farmers-new': 'user',
  'farmers-program': 'shield',
  'farmers-suspended': 'slash',
  'bookings-total': 'package',
  'bookings-confirmed': 'check-circle',
  'bookings-preparing': 'archive',
  'bookings-delivered': 'truck',
  'bookings-boxes': 'package',
  'queue-waiting': 'clock',
  'queue-progress': 'refresh',
  'queue-done': 'check-circle',
  'net-weight': 'scale',
  'purchase-today': 'coins',
  'avg-wait': 'clock',
  'debt-outstanding': 'alert',
  'debt-open': 'minus-circle',
  'debt-partial': 'coins',
  'debt-settled': 'check-circle',
  'debt-deducted': 'trending-down',
  'debt-eligible': 'shield',
  'expense-total': 'wallet',
  'expense-count': 'file',
  'expense-pending': 'clock',
  'expense-draft': 'edit',
  'expense-approved': 'check-circle',
}

/**
 * DASH-001 / DASH-002.
 *
 * The dashboard is a projection of the selected work area: its KPI row, its
 * hero metric and its panels all come from one snapshot keyed by
 * (work type × branch × date range). Nothing here is hard-coded per module —
 * adding a work area needs no change to this file.
 */
export function DashboardPage() {
  const { user } = useAuth()
  const { workType, workTypeId, ready } = useWorkArea()
  const { branchId, range, setRange } = useBranchContext()

  const params = buildDashboardParams(workTypeId, branchId, range)
  const { data, isPending, isFetching, error, refetch } = useDashboardSnapshot(params)

  if (!ready) return <FullPageLoader />
  // No work area chosen yet — the hub is the entry point.
  if (!workType) return <Navigate to="/hub" replace />

  const accent = ACCENT_CLASSES[workType.accent]
  const heroKpi = data?.kpis[0]
  const restKpis = data?.kpis.slice(1) ?? []

  return (
    <>
      {/* `.dash-greet` */}
      <div
        className={cn(
          'mb-[22px] flex flex-wrap items-center justify-between gap-4 rounded-lg px-[26px] py-5 text-white shadow-md',
          accent.hero,
        )}
      >
        <div className="min-w-0">
          <h2 className="mb-0.5 text-[1.15rem] font-bold">สวัสดี {user?.displayName}</h2>
          <p className="text-[.84rem] text-white/80">{workType.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {workType.quickActions.map((action) => (
            <QuickAction key={action.to} action={action} />
          ))}
        </div>
      </div>

      <PageHeader
        title="Dashboard"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('font-semibold', accent.text)}>{workType.name}</span>
            {data && (
              <span className="text-ink-faint">
                · ข้อมูล ณ {formatDateTimeTH(data.generatedAt)}
              </span>
            )}
            {isFetching && !isPending && <span className="text-ink-faint">· กำลังอัปเดต...</span>}
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <DateRangeInput
              from={range.from}
              to={range.to}
              onChange={setRange}
              className="[&_input]:h-9 [&_input]:text-[.82rem]"
            />
            <Button
              variant="ghost"
              size="sm"
              iconLeft="refresh"
              onClick={() => void refetch()}
              loading={isFetching}
            >
              รีเฟรช
            </Button>
          </div>
        }
      />

      {error && !data ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          {/* Hero metric + KPI row */}
          {isPending ? (
            <DashboardSkeleton />
          ) : (
            <>
              {heroKpi && (
                <div className="mb-[18px] grid gap-[18px] lg:grid-cols-[1.7fr_1fr]">
                  <HeroPanel
                    kpi={heroKpi}
                    accentClass={accent.hero}
                    workTypeName={workType.name}
                    ticker={buildTicker(data)}
                  />
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                    {restKpis.slice(0, 2).map((kpi) => (
                      <KpiCard key={kpi.id} kpi={kpi} icon={KPI_ICONS[kpi.id]} />
                    ))}
                  </div>
                </div>
              )}

              {restKpis.length > 2 && (
                <div className="mb-[26px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
                  {restKpis.slice(2).map((kpi) => (
                    <KpiCard key={kpi.id} kpi={kpi} icon={KPI_ICONS[kpi.id]} />
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-12">
                {data?.panels.map((panel) => (
                  <DashboardPanelCard key={panel.id} panel={panel} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  )
}

interface TickerChip {
  id: string
  label: string
  tone: 'idle' | 'busy' | 'done'
}

function queueTone(status: QueuePanelItem['status']): TickerChip['tone'] {
  if (status === 'WAITING_WEIGH') return 'idle'
  if (status === 'COMPLETED') return 'done'
  return 'busy'
}

/**
 * The hero's bottom strip — the `.truck-ticker` idea from the portal, filled
 * with whatever the work area actually has: live queue tickets when there is a
 * queue board, otherwise the leading breakdown slices.
 */
function buildTicker(snapshot: DashboardSnapshot | undefined): TickerChip[] {
  if (!snapshot) return []

  const queue = snapshot.panels.find((p) => p.type === 'QUEUE_BOARD')
  if (queue?.type === 'QUEUE_BOARD') {
    return queue.items.slice(0, 10).map((item) => ({
      id: item.id,
      label: `คิว ${item.queueNo} · ${item.farmerName}`,
      tone: queueTone(item.status),
    }))
  }

  const breakdown = snapshot.panels.find((p) => p.type === 'BREAKDOWN')
  if (breakdown?.type === 'BREAKDOWN') {
    return breakdown.items.slice(0, 6).map((item) => ({
      id: item.key,
      label: `${item.label} · ${formatKpi(item.value, breakdown.format, breakdown.unit ?? item.unit)}`,
      tone: 'busy',
    }))
  }
  return []
}

const TICKER_DOT: Record<TickerChip['tone'], string> = {
  idle: 'bg-white/50',
  busy: 'bg-white',
  done: 'bg-white/30',
}

function HeroPanel({
  kpi,
  accentClass,
  workTypeName,
  ticker,
}: Readonly<{
  kpi: KpiValue
  accentClass: string
  workTypeName: string
  ticker: TickerChip[]
}>) {
  return (
    <div
      className={cn(
        'relative flex min-h-[168px] flex-col justify-between overflow-hidden rounded-lg px-7 py-[26px] text-white shadow-md',
        accentClass,
      )}
    >
      <div>
        <p className="text-[.68rem] font-bold uppercase tracking-[.09em] opacity-85">
          {kpi.label} · {workTypeName}
        </p>
        <p className="dash-num my-2 text-[2.6rem] font-bold leading-none">{formatHero(kpi)}</p>
        {(kpi.hint ?? kpi.delta) && (
          <p className="text-[.82rem] opacity-85">{kpi.hint ?? kpi.delta?.label}</p>
        )}
      </div>

      {ticker.length > 0 ? (
        <div className="app-scroll mt-auto flex gap-2 overflow-x-auto pt-3.5">
          {ticker.map((chip) => (
            <span
              key={chip.id}
              className="flex flex-none items-center gap-1.5 whitespace-nowrap rounded-pill border border-white/25 bg-white/15 py-[5px] pl-2 pr-3 text-[.72rem]"
            >
              <span className={cn('h-1.5 w-1.5 flex-none rounded-full', TICKER_DOT[chip.tone])} />
              {chip.label}
            </span>
          ))}
        </div>
      ) : (
        kpi.href && (
          <Link
            to={kpi.href}
            className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-pill border border-white/25 bg-white/15 px-3.5 py-1.5 text-[.78rem] font-semibold transition-colors hover:bg-white/25"
          >
            ดูรายละเอียด
            <Icon name="arrow-right" size={14} />
          </Link>
        )
      )}
    </div>
  )
}

function formatHero(kpi: KpiValue): string {
  const n = kpi.value
  if (kpi.format === 'currency') return `฿${n.toLocaleString('th-TH', { maximumFractionDigits: 0 })}`
  if (kpi.format === 'weight') return `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} กก.`
  if (kpi.format === 'percent') return `${n.toLocaleString('th-TH')}%`
  return `${n.toLocaleString('th-TH')}${kpi.unit ? ` ${kpi.unit}` : ''}`
}

function QuickAction({
  action,
}: Readonly<{ action: { label: string; to: string; permission?: string; variant?: string } }>) {
  const { can } = useAuth()
  if (action.permission && !can(action.permission as never)) return null
  return (
    <LinkButton
      to={action.to}
      size="sm"
      variant="ghost"
      className={cn(
        'border-white/30 bg-white/15 text-white hover:border-white/50 hover:bg-white/25 hover:text-white',
        action.variant === 'primary' && 'bg-white/25 font-bold',
      )}
    >
      {action.label}
    </LinkButton>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mb-[18px] grid gap-[18px] lg:grid-cols-[1.7fr_1fr]">
        <Skeleton className="h-[168px] rounded-lg" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <KpiCardSkeleton />
          <KpiCardSkeleton />
        </div>
      </div>
      <div className="mb-[26px] grid gap-[18px] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-12">
        <Skeleton className={cn('h-72 rounded-lg', SPAN_CLASSES.half)} />
        <Skeleton className={cn('h-72 rounded-lg', SPAN_CLASSES.half)} />
      </div>
    </>
  )
}
