import { useCallback, useEffect, useState } from 'react'
import { useBlocker, useNavigate } from 'react-router-dom'
import { ConfirmDialog } from '@/components/feedback/Modal'

/**
 * FND-007 / §8.4 — blocks navigation away from a form with unsaved changes,
 * covering both in-app routing and closing the tab.
 */
export function useDirtyGuard(isDirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const dialog = (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onClose={() => blocker.reset?.()}
      onConfirm={() => blocker.proceed?.()}
      title="ออกจากหน้านี้โดยไม่บันทึก?"
      message="ข้อมูลที่กรอกไว้ยังไม่ได้บันทึก หากออกตอนนี้ข้อมูลจะหายไป"
      confirmLabel="ออกโดยไม่บันทึก"
      cancelLabel="อยู่หน้านี้ต่อ"
      tone="danger"
    />
  )

  return { dialog, isBlocked: blocker.state === 'blocked' }
}

/**
 * Cancel button that respects the dirty state without needing the router
 * blocker (used where a form cancels back to a known route).
 */
export function useCancelWithConfirm(isDirty: boolean, backTo: string) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const requestCancel = useCallback(() => {
    if (isDirty) setOpen(true)
    else navigate(backTo)
  }, [isDirty, navigate, backTo])

  const dialog = (
    <ConfirmDialog
      open={open}
      onClose={() => setOpen(false)}
      onConfirm={() => {
        setOpen(false)
        navigate(backTo)
      }}
      title="ยกเลิกการแก้ไข?"
      message="ข้อมูลที่กรอกไว้ยังไม่ได้บันทึก หากยกเลิกตอนนี้ข้อมูลจะหายไป"
      confirmLabel="ยกเลิกการแก้ไข"
      cancelLabel="กรอกต่อ"
      tone="danger"
    />
  )

  return { requestCancel, dialog }
}

/** DEBT-004 — stable key per confirm attempt so a retry cannot double-apply. */
export function useIdempotencyKey(dependency: unknown): string {
  const [key, setKey] = useState(() => crypto.randomUUID())
  useEffect(() => {
    setKey(crypto.randomUUID())
  }, [dependency])
  return key
}
