import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { APP_NAME } from '@/constants'
import { Button } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'
import { BrandLogo } from '@/components/ui/BrandMark'
import { Field } from '@/components/form/Field'
import { Input, PasswordInput } from '@/components/form/Input'
import { Checkbox } from '@/components/form/Choice'
import { toUserMessage } from '@/utils/errors'
import { isMockMode } from '@/services'
import { DEMO_PASSWORD } from '@/services/mocks/db'
import { useAuth } from './AuthProvider'

const loginSchema = z.object({
  username: z.string().trim().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
  rememberMe: z.boolean(),
})

type LoginForm = z.infer<typeof loginSchema>

const FEATURES: { icon: IconName; tint: string; title: string; body: string }[] = [
  {
    icon: 'shield',
    tint: 'bg-forest-soft text-forest',
    title: 'ไม่มีเอกสารตกหล่น',
    body: 'ทุกใบรับ ใบชั่ง และใบจ่าย มีเลขที่ ผู้บันทึก และวันที่ครบถ้วน ตรวจย้อนหลังได้ทันที',
  },
  {
    icon: 'check-square',
    tint: 'bg-sage-soft text-sage',
    title: 'คิว-ชั่ง-คัดคุณภาพ',
    body: 'ตั้งแต่เรียกคิวหน้างาน ชั่งน้ำหนัก คัดรังไหม จนถึงปิดยอดรับซื้อในหน้าจอเดียว',
  },
  {
    icon: 'search',
    tint: 'bg-meadow-soft text-meadow-deep',
    title: 'ติดตามได้ทุกขั้นตอน',
    body: 'บันทึกผู้ทำรายการและเวลาของทุกเอกสาร พร้อมประวัติการตัดหนี้และค่าใช้จ่าย',
  },
]

export function LoginPage() {
  const { login, status, expired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '', rememberMe: true },
  })

  const from = (location.state as { from?: string } | null)?.from ?? '/hub'

  const onSubmit = handleSubmit(async (values) => {
    setSubmitError(null)
    try {
      await login(values)
      navigate(from, { replace: true })
    } catch (error) {
      setSubmitError(toUserMessage(error))
    }
  })

  if (status === 'authenticated') return <Navigate to="/hub" replace />

  const fillDemo = (username: string) => {
    setValue('username', username)
    setValue('password', DEMO_PASSWORD)
  }

  return (
    <div className="hex-bg-login relative flex min-h-screen items-center justify-center gap-[clamp(40px,6vw,96px)] overflow-hidden px-[clamp(20px,6vw,96px)] py-12">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="hidden min-w-0 flex-[0_1_640px] flex-col justify-center py-10 lg:flex">
        <p className="mb-3.5 text-[.78rem] font-bold uppercase tracking-[1.6px] text-meadow-deep">
          Chul Farm · Silk Management System
        </p>
        <h1 className="mb-[18px] text-[2.3rem] font-bold leading-[1.25] text-forest">
          บริหารงานไหมครบวงจร
          <br />
          <span className="text-meadow-deep">แม่นยำ โปร่งใส</span>
          <br />
          ครบในระบบเดียว
        </h1>
        <p className="mb-9 max-w-[520px] text-[.94rem] leading-[1.7] text-ink-dim">
          ระบบจัดการไหมของไร่กำนันจุล — ครบทั้งส่งเสริมเกษตรกร จองไข่ไหม รับซื้อรังไหมสด
          ตัดหนี้ และบันทึกค่าใช้จ่าย พร้อมสิทธิ์การใช้งานแยกตามประเภทงาน
          สำหรับทุกสาขาในระบบเดียว
        </p>

        <div className="grid max-w-[640px] grid-cols-3 gap-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-lg bg-white px-[18px] py-5 shadow-md">
              <span
                className={`mb-3.5 grid h-[38px] w-[38px] place-items-center rounded-[9px] ${f.tint}`}
              >
                <Icon name={f.icon} size={19} />
              </span>
              <h4 className="mb-1.5 text-[.9rem] font-bold text-ink">{f.title}</h4>
              <p className="text-[.76rem] leading-[1.55] text-ink-faint">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Login card ───────────────────────────────────────────────────── */}
      <section className="flex min-w-0 flex-[0_1_480px] items-center justify-center">
        <div className="w-full max-w-[480px] rounded-lg bg-white px-8 pb-10 pt-10 shadow-lg sm:px-12 sm:pt-12">
          {/* ชื่อไร่อยู่ในโลโก้แล้ว เขียนซ้ำข้าง ๆ จะกลายเป็นอ่านชื่อสองรอบ */}
          <div className="mb-7 flex items-center gap-3.5">
            <BrandLogo size={64} />
            <span className="border-l border-line-soft pl-3.5">
              <span className="block text-[1.02rem] font-bold tracking-[.2px] text-forest">
                ระบบจัดการไหม
              </span>
              <span className="block text-[.68rem] font-semibold uppercase tracking-[1.2px] text-ink-faint">
                Silk Management System
              </span>
            </span>
          </div>

          <h2 className="mb-0.5 text-[1.05rem] font-semibold text-ink">เข้าสู่ระบบ</h2>
          <p className="mb-6 text-[.85rem] text-ink-dim">
            ระบบบริหารจัดการงานไหมและกระบวนการรับซื้อ
          </p>

          {expired && (
            <p className="mb-4 rounded bg-tan-soft px-3 py-2.5 text-[.82rem] text-[#7d5629]">
              เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง
            </p>
          )}
          {submitError && (
            <p role="alert" className="mb-4 rounded bg-danger-soft px-3 py-2.5 text-[.82rem] text-danger">
              {submitError}
            </p>
          )}

          <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
            <Field label="Username" required error={errors.username?.message}>
              <Input
                {...register('username')}
                autoComplete="username"
                autoFocus
                placeholder="เช่น receiving"
                inputSize="lg"
              />
            </Field>

            <Field label="Password" required error={errors.password?.message}>
              <PasswordInput
                {...register('password')}
                autoComplete="current-password"
                placeholder="กรอกรหัสผ่าน"
                inputSize="lg"
              />
            </Field>

            <Checkbox
              {...register('rememberMe')}
              label="จดจำการเข้าสู่ระบบบนเครื่องนี้"
              checked={watch('rememberMe')}
            />

            <Button type="submit" variant="primary" size="lg" fullWidth loading={isSubmitting}>
              {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </Button>
          </form>

          {isMockMode && (
            <div className="mt-[18px]">
              <p className="text-center text-[.76rem] text-ink-faint">
                Demo credentials — รหัสผ่าน <span className="font-semibold">{DEMO_PASSWORD}</span>
              </p>
              <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
                {[
                  ['admin', 'ผู้ดูแลระบบ'],
                  ['farm', 'ผู้จัดการฟาร์ม'],
                  ['receiving', 'เจ้าหน้าที่รับซื้อ'],
                  ['account', 'บัญชี'],
                  ['manager', 'ผู้บริหาร'],
                  ['viewer', 'อ่านอย่างเดียว'],
                ].map(([username, label]) => (
                  <button
                    key={username}
                    type="button"
                    onClick={() => fillDemo(username)}
                    className="rounded-pill border border-line bg-white px-2.5 py-1 text-[.7rem] font-semibold text-ink-dim transition-colors hover:border-forest hover:bg-forest-soft hover:text-forest"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <p className="mt-6 text-center text-[.7rem] text-ink-faint">© 2569 {APP_NAME}</p>
        </div>
      </section>
    </div>
  )
}
