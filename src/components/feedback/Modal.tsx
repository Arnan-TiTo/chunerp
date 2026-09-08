import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'
import { Button, IconButton, type ButtonVariant } from '@/components/ui/Button'
import { Icon, type IconName } from '@/components/ui/Icon'

function useDismissable(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
}

/** Keeps tab focus inside the dialog while it is open (QA-006). */
function useFocusTrap(open: boolean) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open || !ref.current) return
    const node = ref.current
    const selector =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
    const first = node.querySelector<HTMLElement>(selector)
    first?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = Array.from(node.querySelectorAll<HTMLElement>(selector)).filter(
        (el) => el.offsetParent !== null,
      )
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => node.removeEventListener('keydown', onKey)
  }, [open])
  return ref
}

export interface ModalProps {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  footer?: React.ReactNode
  children: React.ReactNode
}

export function Modal({
  open,
  onClose,
  title,
  description,
  size = 'md',
  footer,
  children,
}: ModalProps) {
  useDismissable(open, onClose)
  const ref = useFocusTrap(open)
  if (!open) return null

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
      <div
        className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'relative w-full rounded-t-2xl bg-white shadow-lg animate-fade-up-fast sm:rounded-lg',
          widths[size],
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line-soft px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            {description && (
              <p className="mt-0.5 text-sm text-ink-faint">{description}</p>
            )}
          </div>
          <IconButton icon="x" label="ปิด" size="sm" onClick={onClose} />
        </header>
        <div className="max-h-[65vh] overflow-y-auto px-5 py-4 app-scroll">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-soft bg-line-faint px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void | Promise<void>
  title: string
  message: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  icon?: IconName
  loading?: boolean
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  cancelLabel = 'ยกเลิก',
  tone = 'default',
  icon,
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = useCallback(() => {
    void onConfirm()
  }, [onConfirm])

  const variant: ButtonVariant = tone === 'danger' ? 'danger' : 'primary'
  const iconName: IconName = icon ?? (tone === 'danger' ? 'alert' : 'check-circle')

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={variant} onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full',
            tone === 'danger'
              ? 'bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]'
              : 'bg-meadow-soft text-forest',
          )}
        >
          <Icon name={iconName} size={20} />
        </span>
        <div className="pt-1 text-sm leading-relaxed text-ink-dim">
          {message}
        </div>
      </div>
    </Modal>
  )
}

export function Drawer({
  open,
  onClose,
  title,
  footer,
  width = 'md',
  children,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  footer?: React.ReactNode
  width?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}) {
  useDismissable(open, onClose)
  const ref = useFocusTrap(open)
  if (!open) return null

  const widths = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl' }

  return createPortal(
    <div className="fixed inset-0 z-[var(--z-drawer)]">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          'absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-lg animate-slide-in-right',
          widths[width],
        )}
      >
        <header className="flex items-center justify-between gap-3 border-b border-line-soft px-5 py-4">
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          <IconButton icon="x" label="ปิด" size="sm" onClick={onClose} />
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4 app-scroll">{children}</div>
        {footer && (
          <footer className="flex items-center justify-end gap-2 border-t border-line-soft px-5 py-3.5">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}
