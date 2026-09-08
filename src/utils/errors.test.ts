import { describe, expect, it } from 'vitest'
import { ApiError } from '@/types/common'
import { fieldErrors, isAuthError, isPermissionError, toUserMessage } from './errors'

/** §14 — every API failure must surface as a user-friendly Thai message. */
describe('toUserMessage', () => {
  it('falls back to a session message when the server gives no reason', () => {
    expect(toUserMessage(new ApiError(401, ''))).toBe('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่')
  })

  it('keeps the server reason on a 401, so a mistyped password says so', () => {
    // Telling someone who fat-fingered their password that their session
    // expired sends them hunting for a problem that is not there.
    expect(toUserMessage(new ApiError(401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'))).toBe(
      'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
    )
  })

  it('maps 403 to a permission message', () => {
    expect(toUserMessage(new ApiError(403, 'Forbidden'))).toBe('คุณไม่มีสิทธิ์ดำเนินการนี้')
  })

  it('maps 404 to a not-found message', () => {
    expect(toUserMessage(new ApiError(404, 'Not Found'))).toBe('ไม่พบข้อมูลที่ต้องการ')
  })

  it('keeps the server message for 422 when one is provided', () => {
    expect(toUserMessage(new ApiError(422, 'จำนวนที่ตัดเกินสิทธิ์ที่อนุญาต'))).toBe(
      'จำนวนที่ตัดเกินสิทธิ์ที่อนุญาต',
    )
  })

  it('never leaks a raw 5xx body to the user', () => {
    const message = toUserMessage(new ApiError(500, 'NullPointerException at com.example'))
    expect(message).not.toContain('NullPointerException')
    expect(message).toContain('ระบบขัดข้อง')
  })

  it('treats a TypeError as a network failure', () => {
    expect(toUserMessage(new TypeError('fetch failed'))).toContain('เชื่อมต่อเครือข่าย')
  })

  it('falls back for a completely unknown value', () => {
    expect(toUserMessage('boom')).toBe('เกิดข้อผิดพลาดที่ไม่คาดคิด')
  })
})

describe('error predicates', () => {
  it('identifies auth and permission errors', () => {
    expect(isAuthError(new ApiError(401, ''))).toBe(true)
    expect(isAuthError(new ApiError(403, ''))).toBe(false)
    expect(isPermissionError(new ApiError(403, ''))).toBe(true)
    expect(isPermissionError(new Error('x'))).toBe(false)
  })
})

describe('fieldErrors', () => {
  it('flattens API field errors into a react-hook-form friendly shape', () => {
    const error = new ApiError(422, 'invalid', undefined, {
      code: ['รหัสเกษตรกรนี้ถูกใช้แล้ว', 'ซ้ำ'],
      phone: ['เบอร์โทรไม่ถูกต้อง'],
    })
    expect(fieldErrors(error)).toEqual({
      code: 'รหัสเกษตรกรนี้ถูกใช้แล้ว',
      phone: 'เบอร์โทรไม่ถูกต้อง',
    })
  })

  it('returns an empty object when there is nothing field-specific', () => {
    expect(fieldErrors(new ApiError(500, 'x'))).toEqual({})
    expect(fieldErrors(new Error('x'))).toEqual({})
  })
})
