import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { Card, CardHeader } from '@/components/ui/Card'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Badge, StatusBadge } from '@/components/ui/StatusBadge'
import { EmptyState } from '@/components/feedback/States'
import { formatKpi } from '@/components/data-display/KpiCard'
import { QUEUE_STATUS } from '@/constants'
import { formatCurrency, formatDateTH, formatDuration, formatNumber } from '@/utils/format'
import type { DashboardPanel, PanelSpan } from '@/types/dashboard'

export const SPAN_CLASSES: Record<PanelSpan, string> = {
  third: 'lg:col-span-4',
  half: 'lg:col-span-6',
  twothird: 'lg:col-span-8',
  full: 'lg:col-span-12',
}

const PANEL_ICONS: Record<DashboardPanel['type'], IconName> = {
  QUEUE_BOARD: 'clock',
  SCHEDULE: 'calendar',
  ALERTS: 'bell',
  TREND: 'chart',
  BREAKDOWN: 'chart',
  RECENT_DOCS: 'file',
  TASKS: 'check-square',
}

/**
 * Panels are rendered purely from the shape the dashboard service returns, so
 * a new work area needs no new component — only new panel data.
 */
export function DashboardPanelCard({ panel }: Readonly<{ panel: DashboardPanel }>) {
  return (
    <Card className={cn('col-span-1 flex flex-col', SPAN_CLASSES[panel.span])}>
      <CardHeader
        title={panel.title}
        icon={PANEL_ICONS[panel.type]}
        iconClassName="bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
        actions={
          panel.href && (
            <Link
              to={panel.href}
              className="flex items-center gap-1 text-[.8rem] font-semibold text-forest hover:underline"
            >
              ดูทั้งหมด
              <Icon name="chevron-right" size={14} />
            </Link>
          )
        }
      />
      <div className="flex-1">
        <PanelBody panel={panel} />
      </div>
    </Card>
  )
}

function PanelBody({ panel }: Readonly<{ panel: DashboardPanel }>) {
  switch (panel.type) {
    case 'QUEUE_BOARD':
      return <QueueBoard panel={panel} />
    case 'SCHEDULE':
      return <ScheduleList panel={panel} />
    case 'ALERTS':
      return <AlertList panel={panel} />
    case 'BREAKDOWN':
      return <BreakdownList panel={panel} />
    case 'TREND':
      return <TrendChart panel={panel} />
    case 'RECENT_DOCS':
      return <RecentDocs panel={panel} />
    case 'TASKS':
      return <TaskList panel={panel} />
    default:
      return null
  }
}

/* ── Queue board — the number is the biggest thing on the card (§7.5) ───── */

function QueueBoard({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'QUEUE_BOARD' }> }>) {
  if (panel.items.length === 0) {
    return <EmptyState icon="check-circle" title="ไม่มีคิวค้างอยู่" description="ทุกคิวดำเนินการเสร็จแล้ว" />
  }
  return (
    <ul>
      {panel.items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-4 border-b border-line-faint px-[22px] py-3 last:border-b-0"
        >
          <span className="dash-num grid h-12 w-12 shrink-0 place-items-center rounded-[10px] bg-[color:var(--accent-soft)] text-xl font-bold text-[color:var(--accent)]">
            {item.queueNo}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[.9rem] font-semibold text-ink">
              {item.farmerName}
            </span>
            <span className="block truncate text-[.76rem] text-ink-faint">
              {item.farmerCode}
              {item.counter && ` · ${item.counter}`}
            </span>
          </span>
          <span className="hidden text-right text-[.76rem] text-ink-faint sm:block">
            รอ {formatDuration(item.waitingMinutes)}
          </span>
          <StatusBadge status={QUEUE_STATUS[item.status]} />
        </li>
      ))}
    </ul>
  )
}

/* ── Schedule ───────────────────────────────────────────────────────────── */

const SCHEDULE_ICONS: Record<string, IconName> = {
  QUEUE: 'clock',
  DELIVERY: 'truck',
  PICKUP: 'package',
  MEETING: 'users',
}

function ScheduleList({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'SCHEDULE' }> }>) {
  if (panel.items.length === 0) {
    return <EmptyState icon="calendar" title="ไม่มีนัดหมาย" description="ยังไม่มีกำหนดส่งมอบในช่วงนี้" />
  }
  return (
    <ul>
      {panel.items.map((item) => (
        <li key={item.id} className="border-b border-line-faint last:border-b-0">
          <Wrap to={item.href} className="flex items-center gap-3.5 px-[22px] py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-forest-soft text-forest">
              <Icon name={SCHEDULE_ICONS[item.kind] ?? 'calendar'} size={17} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[.88rem] font-semibold text-ink">{item.title}</span>
              {item.subtitle && (
                <span className="block truncate text-[.76rem] text-ink-faint">{item.subtitle}</span>
              )}
            </span>
            <span className="dash-num shrink-0 text-[.8rem] font-semibold text-ink-dim">
              {item.time}
            </span>
          </Wrap>
        </li>
      ))}
    </ul>
  )
}

/* ── Alerts ─────────────────────────────────────────────────────────────── */

const ALERT_STYLES = {
  info: { cls: 'bg-forest-soft text-forest', icon: 'info' as IconName },
  warning: { cls: 'bg-tan-soft text-tan', icon: 'alert' as IconName },
  danger: { cls: 'bg-danger-soft text-danger', icon: 'alert' as IconName },
}

function AlertList({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'ALERTS' }> }>) {
  if (panel.items.length === 0) {
    return <EmptyState icon="check-circle" title="ไม่มีการแจ้งเตือน" />
  }
  return (
    <ul>
      {panel.items.map((item) => {
        const style = ALERT_STYLES[item.severity]
        return (
          <li key={item.id} className="border-b border-line-faint last:border-b-0">
            <Wrap to={item.href} className="flex items-start gap-3 px-[22px] py-3">
              <span className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-[9px]', style.cls)}>
                <Icon name={style.icon} size={16} />
              </span>
              <span className="min-w-0">
                <span className="block text-[.86rem] font-semibold text-ink">{item.title}</span>
                {item.detail && (
                  <span className="block text-[.76rem] leading-relaxed text-ink-faint">
                    {item.detail}
                  </span>
                )}
              </span>
            </Wrap>
          </li>
        )
      })}
    </ul>
  )
}

/* ── Breakdown — labelled bars, no colour-only encoding ─────────────────── */

function BreakdownList({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'BREAKDOWN' }> }>) {
  if (panel.items.length === 0) {
    return <EmptyState icon="chart" title="ยังไม่มีข้อมูลในช่วงที่เลือก" />
  }
  return (
    <ul className="flex flex-col gap-3.5 px-[22px] py-5">
      {panel.items.map((item) => (
        <li key={item.key}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3">
            <span className="truncate text-[.84rem] text-ink">{item.label}</span>
            <span className="dash-num shrink-0 text-[.86rem] font-bold text-ink">
              {formatKpi(item.value, panel.format, panel.unit ?? item.unit)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-pill bg-line-soft">
            <div
              className="h-full rounded-pill bg-[color:var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.max(2, Math.round(item.share * 100))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/* ── Trend — inline SVG so no chart library ships to the field tablets ──── */

function TrendChart({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'TREND' }> }>) {
  const points = panel.points
  if (points.length < 2) return <EmptyState icon="chart" title="ข้อมูลไม่พอสำหรับแสดงกราฟ" />

  const max = Math.max(...points.map((p) => p.value)) || 1
  const w = 100
  const h = 34
  const step = w / (points.length - 1)
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(h - (p.value / max) * h).toFixed(2)}`)
    .join(' ')

  return (
    <div className="px-[22px] py-5">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img"
        aria-label={`${panel.title} — สูงสุด ${formatNumber(max)} ${panel.unit}`}>
        <path d={`${path} L${w},${h} L0,${h} Z`} fill="var(--accent-soft)" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between text-[.7rem] text-ink-faint">
        <span>{points[0].label}</span>
        <span>{points[points.length - 1].label}</span>
      </div>
    </div>
  )
}

/* ── Recent documents ───────────────────────────────────────────────────── */

function RecentDocs({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'RECENT_DOCS' }> }>) {
  if (panel.items.length === 0) {
    return <EmptyState icon="file" title="ยังไม่มีเอกสารในช่วงที่เลือก" />
  }
  return (
    <ul>
      {panel.items.map((item) => (
        <li key={item.id} className="border-b border-line-faint last:border-b-0">
          <Wrap to={item.href} className="flex items-center gap-3.5 px-[22px] py-3">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-[.84rem] font-bold text-forest">{item.docNo}</span>
                <Badge tone={item.statusTone === 'default' ? 'neutral' : item.statusTone}>
                  {item.status}
                </Badge>
              </span>
              <span className="block truncate text-[.82rem] text-ink">{item.title}</span>
              {item.subtitle && (
                <span className="block truncate text-[.74rem] text-ink-faint">{item.subtitle}</span>
              )}
            </span>
            <span className="shrink-0 text-right">
              {item.amount != null && (
                <span className="dash-num block text-[.88rem] font-bold text-ink">
                  {formatCurrency(item.amount, { digits: 0 })}
                </span>
              )}
              <span className="dash-num block text-[.72rem] text-ink-faint">
                {formatDateTH(item.at)}
              </span>
            </span>
          </Wrap>
        </li>
      ))}
    </ul>
  )
}

/* ── Tasks ──────────────────────────────────────────────────────────────── */

function TaskList({ panel }: Readonly<{ panel: Extract<DashboardPanel, { type: 'TASKS' }> }>) {
  if (panel.items.length === 0) {
    return <EmptyState icon="check-circle" title="ไม่มีรายการค้าง" description="งานทั้งหมดดำเนินการครบแล้ว" />
  }
  return (
    <ul>
      {panel.items.map((item) => (
        <li key={item.id} className="border-b border-line-faint last:border-b-0">
          <Wrap
            to={item.href}
            className={cn(
              'flex items-center gap-3.5 border-l-[3px] px-[19px] py-3',
              item.overdue ? 'border-l-tan' : 'border-l-transparent',
            )}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[.87rem] font-semibold text-ink">
                {item.title}
              </span>
              {item.detail && (
                <span className="block truncate text-[.76rem] text-ink-faint">{item.detail}</span>
              )}
            </span>
            {item.dueLabel && (
              <Badge tone={item.overdue ? 'warning' : 'neutral'} icon={item.overdue ? 'alert' : 'clock'}>
                {item.dueLabel}
              </Badge>
            )}
          </Wrap>
        </li>
      ))}
    </ul>
  )
}

/* ── Helper ─────────────────────────────────────────────────────────────── */

function Wrap({
  to,
  className,
  children,
}: Readonly<{ to?: string; className?: string; children: React.ReactNode }>) {
  if (!to) return <div className={className}>{children}</div>
  return (
    <Link to={to} className={cn(className, 'transition-colors hover:bg-[#f8faf6]')}>
      {children}
    </Link>
  )
}
