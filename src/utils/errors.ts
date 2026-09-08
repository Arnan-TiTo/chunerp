import { ApiError } from '@/types/common'

/**
 * §14 — every API failure becomes a user-friendly Thai message. Technical
 * detail stays on the error object for logging; it is never rendered raw.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 400:
        return error.message || 'ข้อมูลที่ส่งไปไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง'
      case 401:
        // A wrong password and a dropped session are both 401. Saying "session
        // expired" to someone who just mistyped sends them looking for a
        // problem that is not there, so the server's own reason wins.
        return error.message || 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่'
      case 403:
        return 'คุณไม่มีสิทธิ์ดำเนินการนี้'
      case 404:
        return 'ไม่พบข้อมูลที่ต้องการ'
      case 409:
        return error.message || 'ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดใหม่'
      case 422:
        return error.message || 'ข้อมูลไม่ผ่านการตรวจสอบ'
      case 429:
        return 'ระบบได้รับคำขอมากเกินไป กรุณาลองใหม่อีกครั้ง'
      default:
        if (error.status >= 500) {
          return 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่ หากยังพบปัญหาโปรดแจ้งผู้ดูแลระบบ'
        }
        return error.message || 'เกิดข้อผิดพลาดที่ไม่คาดคิด'
    }
  }
  if (error instanceof TypeError) {
    return 'เชื่อมต่อเครือข่ายไม่สำเร็จ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต'
  }
  if (error instanceof Error) return error.message
  return 'เกิดข้อผิดพลาดที่ไม่คาดคิด'
}

export function isPermissionError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 403
}

export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401
}

/** Field-level errors returned by the API, ready for RHF `setError`. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {}
  return Object.fromEntries(
    Object.entries(error.details).map(([field, msgs]) => [field, msgs[0] ?? '']),
  )
}
