import { useNavigate } from 'react-router-dom'
import { cn } from '@/utils/cn'
import { APP_NAME } from '@/constants'
import { ACCENT_CLASSES, ACCENT_VARS } from '@/constants/workTypes'
import { ROLE_LABELS } from '@/constants/rbac'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { PermissionDenied } from '@/components/feedback/States'
import { BrandMark } from '@/components/ui/BrandMark'
import { useAuth } from '@/features/auth/AuthProvider'
import { useWorkArea } from './WorkAreaProvider'
import type { WorkTypeDefinition } from '@/types/dashboard'

/**
 * เลือกพื้นที่การทำงาน — the work-area picker shown after login.
 *
 * Only the work areas this user's permissions unlock are listed, so the hub is
 * genuinely "ของใครของมัน". Picking one swaps the whole shell: its own sidebar,
 * its own dashboard and its own accent colour.
 */
export function WorkAreaHub() {
  const { user, logout } = useAuth()
  const { available, setWorkType } = useWorkArea()
  const navigate = useNavigate()

  const open = (wt: WorkTypeDefinition) => {
    setWorkType(wt.id)
    navigate('/dashboard')
  }

  return (
    <div className="hex-bg flex min-h-screen flex-col">
      <header className="flex items-center justify-between gap-4 bg-white px-8 py-4 shadow-sm">
        <BrandMark />
        <div className="flex items-center gap-2.5">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-meadow text-[.8rem] font-bold text-white">
            {user?.displayName.slice(0, 1) ?? '?'}
          </span>
          <span className="hidden text-sm sm:block">
            <span className="block font-semibold leading-tight text-ink">{user?.displayName}</span>
            <span className="block text-[.72rem] text-ink-faint">
              {user ? ROLE_LABELS[user.role] : ''}
            </span>
          </span>
          <Button variant="ghost" size="sm" onClick={() => void logout()}>
            ออกจากระบบ
          </Button>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-6 py-14">
        {available.length === 0 ? (
          <PermissionDenied message="บัญชีของคุณยังไม่ได้รับสิทธิ์เข้าใช้พื้นที่การทำงานใด กรุณาติดต่อผู้ดูแลระบบ" />
        ) : (
          <>
            <p className="mb-2.5 text-[.78rem] font-bold uppercase tracking-[1.6px] text-meadow">
              {APP_NAME}
            </p>
            <h1 className="text-center text-[1.9rem] font-bold text-ink">เลือกพื้นที่การทำงาน</h1>
            <p className="mb-11 mt-1.5 text-center text-[.95rem] text-ink-dim">
              เลือกประเภทงานที่ต้องการเข้าใช้งาน — แดชบอร์ดและเมนูจะเปลี่ยนตามงานที่เลือก
            </p>

            <div className="grid w-full max-w-[1040px] gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((wt) => (
                <WorkAreaCard key={wt.id} workType={wt} onOpen={() => open(wt)} />
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

function WorkAreaCard({
  workType,
  onOpen,
}: Readonly<{ workType: WorkTypeDefinition; onOpen: () => void }>) {
  const accent = ACCENT_CLASSES[workType.accent]
  const vars = ACCENT_VARS[workType.accent]

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ '--card-accent': vars.accent, '--card-soft': vars.accentSoft } as React.CSSProperties}
      className={cn(
        'group relative overflow-hidden rounded-lg bg-white px-[26px] pb-[26px] pt-8 text-left shadow-md',
        'transition-[transform,box-shadow] duration-[250ms] ease-[cubic-bezier(.2,.7,.3,1)]',
        'hover:-translate-y-1.5 hover:shadow-lg',
        'before:pointer-events-none before:absolute before:right-0 before:top-0 before:h-36 before:w-36',
        'before:bg-[radial-gradient(140px_140px_at_100%_0%,var(--card-soft),transparent_70%)]',
      )}
    >
      <span
        className={cn('mb-[18px] grid h-11 w-11 place-items-center rounded-[10px]', accent.bar)}
      >
        <Icon name={workType.icon as IconName} size={24} className="text-white" />
      </span>

      <h3 className="text-[1.08rem] font-bold text-ink">{workType.nameEn}</h3>
      <p className="mb-2.5 text-[.86rem] text-ink-dim">{workType.name}</p>
      <p className="text-[.82rem] leading-relaxed text-ink-faint">{workType.description}</p>

      <span className={cn('mt-[18px] flex items-center gap-1.5 text-[.8rem] font-semibold', accent.text)}>
        เข้าใช้งาน
        <Icon name="arrow-right" size={14} className="transition-transform group-hover:translate-x-1" />
      </span>

      {/* `.portal-card .bar` — grows across the card on hover */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-0 left-0 h-[3px] w-0 transition-[width] duration-[350ms] ease-[cubic-bezier(.2,.7,.3,1)] group-hover:w-full',
          accent.bar,
        )}
      />
    </button>
  )
}
