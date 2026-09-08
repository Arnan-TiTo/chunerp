import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '@/utils/cn'
import type { Permission } from '@/types/auth'
import { PERMISSION_GROUPS, PERMISSION_LABELS, ROLE_LABELS, ROLE_PERMISSIONS } from '@/constants/rbac'
import { services } from '@/services'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Badge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/data-display/PageHeader'
import { ErrorState, InfoBanner, SkeletonText } from '@/components/feedback/States'
import { Checkbox } from '@/components/form/Choice'
import { useToast } from '@/components/feedback/Toast'
import { toUserMessage } from '@/utils/errors'

/** SYS-002 — role/permission matrix wired to the same guards the app uses. */
export function PermissionsPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Set<Permission>>(new Set())

  const { data: users, isPending, error, refetch } = useQuery({
    queryKey: ['system', 'users'],
    queryFn: () => services.system.users(),
  })

  const selected = users?.find((u) => u.id === selectedId) ?? users?.[0]

  useEffect(() => {
    if (selected) setDraft(new Set(selected.permissions))
  }, [selected])

  const save = useMutation({
    mutationFn: (permissions: Permission[]) =>
      services.system.updateUserPermissions(selected!.id, permissions),
    onSuccess: (user) => {
      void qc.invalidateQueries({ queryKey: ['system', 'users'] })
      toast.success('บันทึกสิทธิ์แล้ว', `${user.displayName} · ${user.permissions.length} สิทธิ์`)
    },
    onError: (err) => toast.error('บันทึกสิทธิ์ไม่สำเร็จ', toUserMessage(err)),
  })

  if (isPending) return <SkeletonText lines={10} />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />

  const dirty =
    selected != null &&
    (draft.size !== selected.permissions.length ||
      selected.permissions.some((p) => !draft.has(p)))

  const toggle = (permission: Permission) => {
    setDraft((prev) => {
      const next = new Set(prev)
      if (next.has(permission)) next.delete(permission)
      else next.add(permission)
      return next
    })
  }

  return (
    <>
      <PageHeader
        title="สิทธิ์ผู้ใช้งาน"
        subtitle="กำหนดสิทธิ์รายบุคคล — ระบบหลังบ้านยังเป็นผู้ตัดสินสุดท้ายเสมอ"
        actions={
          selected && (
            <>
              <Button
                variant="ghost"
                disabled={!dirty || save.isPending}
                onClick={() => setDraft(new Set(selected.permissions))}
              >
                ย้อนกลับ
              </Button>
              <Button
                variant="green"
                iconLeft="check"
                disabled={!dirty}
                loading={save.isPending}
                onClick={() => save.mutate([...draft])}
              >
                บันทึกสิทธิ์
              </Button>
            </>
          )
        }
      />

      <InfoBanner tone="warning" icon="shield" className="mb-[18px]">
        การซ่อนเมนูไม่ใช่มาตรการความปลอดภัย — ทุก endpoint ต้องตรวจสิทธิ์ซ้ำที่ฝั่ง Backend (§13)
      </InfoBanner>

      <div className="grid gap-[18px] lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader title="ผู้ใช้งาน" icon="users" subtitle={`${users?.length ?? 0} บัญชี`} />
          <ul>
            {users?.map((user) => {
              const active = user.id === selected?.id
              return (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(user.id)}
                    className={cn(
                      'flex w-full items-center gap-3 border-l-[3px] border-b border-b-line-faint px-[19px] py-3 text-left transition-colors',
                      active
                        ? 'border-l-meadow bg-meadow-soft'
                        : 'border-l-transparent hover:bg-[#f8faf6]',
                    )}
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-meadow text-[.8rem] font-bold text-white">
                      {user.displayName.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[.88rem] font-semibold text-ink">
                        {user.displayName}
                      </span>
                      <span className="block truncate text-[.74rem] text-ink-faint">
                        {user.username} · {user.branchName}
                      </span>
                    </span>
                    <Badge tone={active ? 'info' : 'neutral'}>{ROLE_LABELS[user.role]}</Badge>
                  </button>
                </li>
              )
            })}
          </ul>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader
            title={selected ? `สิทธิ์ของ ${selected.displayName}` : 'เลือกผู้ใช้งาน'}
            icon="shield"
            subtitle={
              selected
                ? `${draft.size} สิทธิ์ · บทบาท ${ROLE_LABELS[selected.role]}`
                : undefined
            }
            actions={
              selected && (
                <Button
                  variant="ghost"
                  size="sm"
                  iconLeft="refresh"
                  onClick={() => setDraft(new Set(ROLE_PERMISSIONS[selected.role]))}
                >
                  ตั้งค่าตามบทบาท
                </Button>
              )
            }
          />
          {selected && (
            <div className="flex flex-col gap-5 px-[22px] py-5">
              {PERMISSION_GROUPS.map((group) => {
                const granted = group.permissions.filter((p) => draft.has(p)).length
                const all = granted === group.permissions.length
                return (
                  <section key={group.label}>
                    <header className="mb-2.5 flex items-center justify-between gap-3">
                      <h3 className="flex items-center gap-2 text-[.82rem] font-bold uppercase tracking-[.5px] text-ink-dim">
                        {group.label}
                        <span className="dash-num rounded-pill bg-line-soft px-2 py-0.5 text-[.68rem] font-semibold text-ink-faint">
                          {granted}/{group.permissions.length}
                        </span>
                      </h3>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) => {
                            const next = new Set(prev)
                            for (const p of group.permissions) {
                              if (all) next.delete(p)
                              else next.add(p)
                            }
                            return next
                          })
                        }
                        className="flex items-center gap-1 text-[.76rem] font-semibold text-forest hover:underline"
                      >
                        <Icon name={all ? 'x' : 'check'} size={12} />
                        {all ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                      </button>
                    </header>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.permissions.map((permission) => (
                        <Checkbox
                          key={permission}
                          emphasis
                          label={PERMISSION_LABELS[permission]}
                          description={permission}
                          checked={draft.has(permission)}
                          onChange={() => toggle(permission)}
                        />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
