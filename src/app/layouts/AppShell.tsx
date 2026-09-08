import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { APP_NAME_EN, BRANCHES } from '@/constants'
import { SYSTEM_NAV } from '@/constants/workTypes'
import { ROLE_LABELS } from '@/constants/rbac'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Button, IconButton } from '@/components/ui/Button'
import { BrandMark } from '@/components/ui/BrandMark'
import { ConfirmDialog } from '@/components/feedback/Modal'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkArea } from '@/features/workarea/WorkAreaProvider'
import { useBranchContext } from '@/hooks/useBranchContext'
import { isMockMode } from '@/services'
import { GlobalSearch } from './GlobalSearch'

/* ── Sidebar ────────────────────────────────────────────────────────────── */

function Sidebar({ onNavigate }: Readonly<{ onNavigate?: () => void }>) {
  const { can } = useAuth()
  const { workType } = useWorkArea()
  const location = useLocation()

  const groups = [
    {
      label: '',
      items: [{ label: 'แดชบอร์ด', to: '/dashboard', icon: 'grid' as IconName, permission: undefined }],
    },
    ...(workType?.nav ?? []),
    { label: SYSTEM_NAV.label, items: SYSTEM_NAV.items },
  ]

  return (
    <div className="flex h-full flex-col bg-white shadow-sidebar">
      <div className="flex h-[var(--topbar-h)] flex-none items-center gap-2.5 border-b border-line-soft px-[22px]">
        <BrandMark />
      </div>

      <nav className="app-scroll min-h-0 flex-1 overflow-y-auto py-[18px]" aria-label="เมนูหลัก">
        {groups.map((group, gi) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission))
          if (items.length === 0) return null
          return (
            <div key={group.label || `g${gi}`} className="mb-1.5">
              {group.label && (
                <p className="px-[22px] pb-2 pt-3.5 text-[.72rem] font-bold uppercase tracking-[.6px] text-ink-faint">
                  {group.label}
                </p>
              )}
              <ul>
                {items.map((item) => {
                  const matchPrefix = 'matchPrefix' in item ? item.matchPrefix : undefined
                  const active = matchPrefix
                    ? location.pathname.startsWith(matchPrefix)
                    : location.pathname === item.to
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        onClick={onNavigate}
                        className={cn(
                          'flex items-center gap-2.5 border-l-[3px] px-[22px] py-2.5 text-[.87rem] transition-colors',
                          active
                            ? 'border-meadow bg-meadow-soft font-semibold text-forest'
                            : 'border-transparent text-ink hover:bg-meadow-soft hover:text-forest',
                        )}
                      >
                        <Icon name={item.icon as IconName} size={17} />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>

      <div className="flex-none border-t border-line-soft px-[22px] py-3">
        <p className="text-[.62rem] leading-relaxed text-ink-faint">
          {APP_NAME_EN}
          <br />
          v1.0 · {isMockMode ? 'Mock API' : 'Live API'}
        </p>
      </div>
    </div>
  )
}

/* ── Work-area switcher (`.module-switch`) ──────────────────────────────── */

function WorkAreaSwitch() {
  const { workType, available, setWorkType } = useWorkArea()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!workType) return null

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-[7px] rounded-[7px] border border-white/50 bg-white/10 px-[9px] py-[5px] text-[.83rem] text-white transition-colors hover:bg-white/20"
      >
        <Icon name={workType.icon as IconName} size={16} />
        <span className="font-bold">{workType.name}</span>
        <span className="hidden font-medium opacity-75 sm:inline">Portal</span>
        <Icon name="chevron-down" size={14} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-[calc(100%+8px)] z-[var(--z-dropdown)] min-w-[260px] overflow-hidden rounded-[10px] bg-white shadow-lg animate-fade-up-fast"
        >
          <p className="border-b border-line-soft px-3.5 py-2.5 text-[.7rem] font-bold uppercase tracking-[.5px] text-ink-faint">
            เปลี่ยนประเภทงาน
          </p>
          {available.map((wt) => {
            const active = wt.id === workType.id
            return (
              <button
                key={wt.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setWorkType(wt.id)
                  setOpen(false)
                  // เปลี่ยนประเภทงานแล้วต้องไปแดชบอร์ดของงานนั้น — ถ้าค้างอยู่
                  // หน้าเดิม ผู้ใช้จะเห็นเมนูชุดใหม่แต่เนื้อหาของงานเก่า
                  if (wt.id !== workType.id) navigate('/dashboard')
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3.5 py-[11px] text-left text-[.86rem] transition-colors',
                  active
                    ? 'bg-forest-soft font-bold text-forest'
                    : 'text-ink hover:bg-meadow-soft',
                )}
              >
                <Icon name={wt.icon as IconName} size={16} />
                <span className="min-w-0 flex-1 truncate">{wt.name}</span>
                {active && <Icon name="check" size={15} />}
              </button>
            )
          })}
          <Link
            to="/hub"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 border-t border-line-soft px-3.5 py-[11px] text-[.82rem] text-ink-dim transition-colors hover:bg-meadow-soft hover:text-forest"
          >
            <Icon name="grid" size={15} />
            ดูพื้นที่การทำงานทั้งหมด
          </Link>
        </div>
      )}
    </div>
  )
}

/* ── Topbar user menu ───────────────────────────────────────────────────── */

function UserMenu() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (!user) return null

  return (
    <div ref={boxRef} className="relative flex items-center gap-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 text-[.85rem] font-medium text-white"
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-meadow text-[.7rem] font-bold text-white">
          {user.displayName.slice(0, 1)}
        </span>
        <span className="hidden sm:inline">{user.displayName}</span>
        <Icon name="chevron-down" size={14} className="opacity-80" />
      </button>

      <Button
        variant="ghost"
        size="sm"
        className="border-white/25 bg-white/10 text-white hover:border-white/40 hover:bg-white/20 hover:text-white"
        onClick={() => setConfirmLogout(true)}
      >
        ออกจากระบบ
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[calc(100%+10px)] z-[var(--z-dropdown)] w-64 overflow-hidden rounded-[10px] bg-white shadow-lg animate-fade-up-fast"
        >
          <div className="border-b border-line-soft px-4 py-3">
            <p className="text-sm font-bold text-ink">{user.displayName}</p>
            <p className="text-xs text-ink-faint">{user.email}</p>
            <p className="mt-2 inline-flex items-center gap-1 rounded-pill bg-forest-soft px-2 py-0.5 text-[11px] font-semibold text-forest">
              <Icon name="shield" size={11} />
              {ROLE_LABELS[user.role]}
            </p>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/hub')
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-dim transition-colors hover:bg-meadow-soft hover:text-forest"
          >
            <Icon name="grid" size={16} />
            เปลี่ยนพื้นที่การทำงาน
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              navigate('/system/settings')
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-ink-dim transition-colors hover:bg-meadow-soft hover:text-forest"
          >
            <Icon name="settings" size={16} />
            ตั้งค่าระบบ
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={async () => {
          setLoggingOut(true)
          try {
            await logout()
            navigate('/login', { replace: true })
          } finally {
            setLoggingOut(false)
            setConfirmLogout(false)
          }
        }}
        title="ออกจากระบบ"
        message="ต้องการออกจากระบบใช่หรือไม่? งานที่ยังไม่ได้บันทึกจะหายไป"
        confirmLabel="ออกจากระบบ"
        tone="danger"
        icon="log-out"
        loading={loggingOut}
      />
    </div>
  )
}

function BranchSwitcher() {
  const { user } = useAuth()
  const { branchId, setBranchId } = useBranchContext()
  const available = user?.branches ?? BRANCHES
  const allowAll = (user?.branches.length ?? 0) > 1

  return (
    <label className="hidden items-center gap-2 xl:flex">
      <span className="sr-only">สาขา</span>
      <select
        value={branchId}
        onChange={(e) => setBranchId(e.target.value)}
        className="h-[34px] rounded-[7px] border border-white/40 bg-white/10 px-2.5 text-[.82rem] text-white transition-colors hover:bg-white/20 focus:outline-none [&>option]:text-ink"
      >
        {allowAll && <option value="ALL">ทุกสาขา</option>}
        {available.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ── Shell ──────────────────────────────────────────────────────────────── */

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="z-10 hidden w-[var(--sidebar-w)] flex-none lg:block">
        <div className="fixed inset-y-0 left-0 w-[var(--sidebar-w)]">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile / tablet drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="ปิดเมนู"
            className="absolute inset-0 bg-ink/40 animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[17rem] animate-slide-in-right">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-[var(--topbar-h)] items-center justify-between gap-3 bg-forest px-4 shadow-topbar sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <IconButton
              icon="menu"
              label="เปิดเมนู"
              variant="onDark"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
            />
            <WorkAreaSwitch />
          </div>

          <GlobalSearch />

          <div className="flex items-center gap-3">
            <BranchSwitcher />
            <UserMenu />
          </div>
        </header>

        <main className="app-scroll min-w-0 flex-1 px-5 py-7 sm:px-9 sm:py-8">
          <div className="mx-auto w-full max-w-[100rem] animate-fade-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
