import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { SystemSetting } from '@/services/api/contracts'
import { services } from '@/services'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/StatusBadge'
import { PageHeader } from '@/components/data-display/PageHeader'
import { ErrorState, InfoBanner, SkeletonText } from '@/components/feedback/States'
import { Field } from '@/components/form/Field'
import { Input, NumberInput } from '@/components/form/Input'
import { Select } from '@/components/form/Select'
import { Switch } from '@/components/form/Choice'
import { useToast } from '@/components/feedback/Toast'
import { Icon } from '@/components/ui/Icon'
import { databaseFiles } from '@/services/sqlite/bootstrap'
import { formatDateTimeTH } from '@/utils/format'
import { toUserMessage } from '@/utils/errors'

/**
 * SYS-003 — config-driven settings.
 *
 * Items flagged `pendingConfirmation` are the §20 open questions (moisture
 * bands, the ฿200/kg guarantee, the deduction ceiling, the bag→kg unit).
 * They live here as configuration precisely so they are not hard-coded into
 * the frontend before the business rules are locked.
 */
export function SettingsPage() {
  const toast = useToast()
  const qc = useQueryClient()
  const [drafts, setDrafts] = useState<Record<string, string | number | boolean>>({})

  const { data: settings, isPending, error, refetch } = useQuery({
    queryKey: ['system', 'settings'],
    queryFn: () => services.system.settings(),
  })

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: string | number | boolean }) =>
      services.system.updateSetting(key, value),
    onSuccess: (setting) => {
      void qc.invalidateQueries({ queryKey: ['system', 'settings'] })
      setDrafts((d) => {
        const next = { ...d }
        delete next[setting.key]
        return next
      })
      toast.success('บันทึกการตั้งค่าแล้ว', setting.label)
    },
    onError: (err) => toast.error('บันทึกไม่สำเร็จ', toUserMessage(err)),
  })

  const groups = useMemo(() => {
    const map = new Map<string, SystemSetting[]>()
    for (const setting of settings ?? []) {
      const list = map.get(setting.group) ?? []
      list.push(setting)
      map.set(setting.group, list)
    }
    return [...map.entries()]
  }, [settings])

  if (isPending) return <SkeletonText lines={10} />
  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />

  const pendingCount = (settings ?? []).filter((s) => s.pendingConfirmation).length

  const valueOf = (setting: SystemSetting) => drafts[setting.key] ?? setting.value
  const isDirty = (setting: SystemSetting) =>
    drafts[setting.key] !== undefined && drafts[setting.key] !== setting.value

  return (
    <>
      <PageHeader
        title="ตั้งค่าระบบ"
        subtitle={`${settings?.length ?? 0} รายการ · ${pendingCount} รายการรอยืนยันกฎธุรกิจ`}
      />

      {pendingCount > 0 && (
        <InfoBanner tone="warning" icon="alert" title="ค่าที่ยังรอยืนยัน" className="mb-[18px]">
          ค่าที่ติดป้าย “รอยืนยัน” เป็นกฎธุรกิจที่ยังไม่ล็อก (สูตรราคา ความชื้น เพดานตัดหนี้
          หน่วยนับรัง) จึงเก็บเป็นการตั้งค่าแทนการฝังไว้ใน frontend
        </InfoBanner>
      )}

      <DatabaseCard className="mb-[18px]" />

      <div className="grid gap-[18px] lg:grid-cols-2">
        {groups.map(([group, items]) => (
          <Card key={group}>
            <CardHeader title={group} icon="settings" subtitle={`${items.length} รายการ`} />
            <div className="flex flex-col gap-5 px-[22px] py-5">
              {items.map((setting) => (
                <div key={setting.key} className="flex flex-col gap-2">
                  {setting.type === 'boolean' ? (
                    <Switch
                      label={
                        <span className="flex flex-wrap items-center gap-2">
                          {setting.label}
                          {setting.pendingConfirmation && <Badge tone="warning">รอยืนยัน</Badge>}
                        </span>
                      }
                      description={setting.key}
                      checked={Boolean(valueOf(setting))}
                      onChange={(checked) => save.mutate({ key: setting.key, value: checked })}
                    />
                  ) : (
                    <Field
                      label={
                        <span className="flex flex-wrap items-center gap-2">
                          {setting.label}
                          {setting.pendingConfirmation && <Badge tone="warning">รอยืนยัน</Badge>}
                        </span>
                      }
                      hint={setting.description ?? setting.key}
                    >
                      <div className="flex items-center gap-2">
                        {setting.type === 'number' && (
                          <NumberInput
                            value={String(valueOf(setting))}
                            step="any"
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [setting.key]: Number(e.target.value) }))
                            }
                          />
                        )}
                        {setting.type === 'select' && (
                          <Select
                            value={String(valueOf(setting))}
                            options={setting.options ?? []}
                            placeholder="เลือกค่า"
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [setting.key]: e.target.value }))
                            }
                          />
                        )}
                        {setting.type === 'text' && (
                          <Input
                            value={String(valueOf(setting))}
                            onChange={(e) =>
                              setDrafts((d) => ({ ...d, [setting.key]: e.target.value }))
                            }
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft="check"
                          disabled={!isDirty(setting)}
                          loading={save.isPending && save.variables?.key === setting.key}
                          onClick={() =>
                            save.mutate({ key: setting.key, value: valueOf(setting) })
                          }
                        >
                          บันทึก
                        </Button>
                      </div>
                    </Field>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </>
  )
}

/* ── ฐานข้อมูล ──────────────────────────────────────────────────────────── */

/**
 * SYS-004 — ดาวน์โหลดฐานข้อมูลออกมาเป็นไฟล์.
 *
 * ระบบเก็บข้อมูลด้วย SQLite (WASM) ไว้ในเบราว์เซอร์ ไฟล์จึงไม่ได้อยู่บนดิสก์
 * ให้เปิดดูได้ตรง ๆ ปุ่มนี้ส่งไบต์ชุดเดียวกับที่ระบบใช้อยู่ออกมาเป็นไฟล์
 * .sqlite เปิดด้วย DB Browser for SQLite หรือ DBeaver ได้ทันที และใช้เป็น
 * สำเนาสำรองก่อนล้างข้อมูลเบราว์เซอร์ได้ด้วย
 */
function DatabaseCard({ className }: Readonly<{ className?: string }>) {
  const toast = useToast()
  const [downloadedAt, setDownloadedAt] = useState<string | null>(null)

  const files = (() => {
    try {
      return databaseFiles()
    } catch {
      // The databases open during boot; if they are not up there is nothing to
      // hand out and the card simply says so.
      return []
    }
  })()

  const download = (fileName: string, bytes: Uint8Array) => {
    const url = URL.createObjectURL(
      new Blob([bytes.slice().buffer as ArrayBuffer], { type: 'application/vnd.sqlite3' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.append(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    setDownloadedAt(new Date().toISOString())
    toast.success('ดาวน์โหลดฐานข้อมูลแล้ว', fileName)
  }

  return (
    <Card className={className}>
      <CardHeader
        title="ฐานข้อมูล"
        icon="archive"
        subtitle="SQLite (WASM) เก็บอยู่ในเบราว์เซอร์เครื่องนี้ — ดาวน์โหลดเป็นไฟล์ .sqlite ได้"
      />
      <div className="px-[22px] py-5">
        {files.length === 0 ? (
          <p className="text-[.88rem] text-ink-faint">ยังเปิดฐานข้อมูลไม่สำเร็จ</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {files.map((file) => (
              <li
                key={file.name}
                className="flex items-center gap-3 rounded border border-line bg-sunken px-4 py-3"
              >
                <Icon name="archive" size={18} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="dash-num block text-[.9rem] font-semibold text-ink">
                    {file.fileName}
                  </span>
                  <span className="block text-[.76rem] text-ink-faint">
                    {file.name === 'chunerp'
                      ? 'ข้อมูลของระบบเรา — เกษตรกร ใบจอง หนี้ การรับซื้อ สิทธิ์ผู้ใช้'
                      : 'ระบบชั่งน้ำหนักภายนอก (Floor Weight Cocoon) — อ่านอย่างเดียว'}
                    {' · '}
                    {(file.bytes.length / 1024).toFixed(0)} KB
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  iconLeft="download"
                  onClick={() => download(file.fileName, file.bytes)}
                >
                  ดาวน์โหลด
                </Button>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[.8rem] text-ink-faint">
          ไฟล์ที่ได้คือฐานข้อมูลตัวจริงที่ระบบกำลังใช้อยู่ รวมข้อมูลที่แก้ไว้ในเครื่องนี้ทั้งหมด ·
          โครงสร้างตารางชุดเดียวกันอยู่ที่ <code className="dash-num">db/sqlite/chunerp.sql</code>{' '}
          และฉบับ PostgreSQL ที่ <code className="dash-num">db/postgres/schema.sql</code>
          {downloadedAt && ` · ดาวน์โหลดล่าสุด ${formatDateTimeTH(downloadedAt)}`}
        </p>
      </div>
    </Card>
  )
}
