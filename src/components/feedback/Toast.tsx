import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/utils/cn'
import { Icon, type IconName } from '@/components/ui/Icon'
import { IconButton } from '@/components/ui/Button'

export type ToastTone = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  tone: ToastTone
  title: string
  description?: string
  duration?: number
}

interface ToastContextValue {
  show: (toast: Omit<Toast, 'id'>) => void
  success: (title: string, description?: string) => void
  error: (title: string, description?: string) => void
  info: (title: string, description?: string) => void
  warning: (title: string, description?: string) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}

const TONE_STYLES: Record<ToastTone, { className: string; icon: IconName }> = {
  success: {
    className:
      'bg-[color:var(--status-success-bg)] text-[color:var(--status-success-fg)]',
    icon: 'check-circle',
  },
  error: {
    className:
      'bg-[color:var(--status-danger-bg)] text-[color:var(--status-danger-fg)]',
    icon: 'x-circle',
  },
  warning: {
    className:
      'bg-[color:var(--status-warning-bg)] text-[color:var(--status-warning-fg)]',
    icon: 'alert',
  },
  info: {
    className:
      'bg-[color:var(--status-info-bg)] text-[color:var(--status-info-fg)]',
    icon: 'info',
  },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef(new Map<string, number>())

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      window.clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const duration = toast.duration ?? (toast.tone === 'error' ? 7000 : 4500)
      setToasts((list) => [...list.slice(-3), { ...toast, id }])
      timers.current.set(id, window.setTimeout(() => dismiss(id), duration))
    },
    [dismiss],
  )

  const value = useMemo<ToastContextValue>(
    () => ({
      show,
      dismiss,
      success: (title, description) => show({ tone: 'success', title, description }),
      error: (title, description) => show({ tone: 'error', title, description }),
      info: (title, description) => show({ tone: 'info', title, description }),
      warning: (title, description) => show({ tone: 'warning', title, description }),
    }),
    [show, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            role="region"
            aria-label="การแจ้งเตือน"
            className="pointer-events-none fixed inset-x-0 bottom-0 z-[var(--z-toast)] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
          >
            {toasts.map((t) => {
              const style = TONE_STYLES[t.tone]
              return (
                <div
                  key={t.id}
                  role="status"
                  aria-live={t.tone === 'error' ? 'assertive' : 'polite'}
                  className={cn(
                    'pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-3 shadow-lg animate-fade-up-fast',
                    style.className,
                  )}
                >
                  <Icon name={style.icon} size={18} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{t.title}</p>
                    {t.description && (
                      <p className="mt-0.5 text-xs leading-relaxed opacity-90">
                        {t.description}
                      </p>
                    )}
                  </div>
                  <IconButton
                    icon="x"
                    label="ปิดการแจ้งเตือน"
                    size="sm"
                    className="-mr-1 -mt-1 border-transparent hover:bg-black/5"
                    onClick={() => dismiss(t.id)}
                  />
                </div>
              )
            })}
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  )
}
