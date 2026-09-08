import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom'
import { Button, LinkButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { toUserMessage } from '@/utils/errors'

/**
 * Router-level boundary. A render failure inside a lazy chunk lands here
 * instead of blanking the app (§14).
 */
export function RouteError() {
  const error = useRouteError()
  const navigate = useNavigate()

  const is404 = isRouteErrorResponse(error) && error.status === 404
  const message = is404
    ? 'ลิงก์อาจไม่ถูกต้อง หรือข้อมูลถูกลบไปแล้ว'
    : toUserMessage(error)

  return (
    <main className="hex-bg grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-md rounded-lg bg-white px-8 py-10 text-center shadow-lg">
        <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-danger-soft text-danger">
          <Icon name="alert" size={26} />
        </span>
        <h1 className="text-lg font-bold text-ink">
          {is404 ? 'ไม่พบหน้าที่ต้องการ' : 'เกิดข้อผิดพลาด'}
        </h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-dim">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="ghost" iconLeft="arrow-left" onClick={() => navigate(-1)}>
            ย้อนกลับ
          </Button>
          <LinkButton to="/hub" variant="primary" iconLeft="home">
            กลับหน้าแรก
          </LinkButton>
        </div>
      </div>
    </main>
  )
}
