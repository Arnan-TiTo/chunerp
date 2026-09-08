import { useRef, useState } from 'react'
import { cn } from '@/utils/cn'
import { UPLOAD_LIMITS } from '@/constants'
import type { Attachment } from '@/types/common'
import { Icon } from '@/components/ui/Icon'
import { Button, IconButton } from '@/components/ui/Button'
import { formatFileSize } from '@/utils/format'

interface UploadItem {
  id: string
  file: File
  progress: number
  error?: string
  done?: boolean
}

/**
 * EXP-005 — multi-upload with per-file progress and per-file errors.
 * Client-side type/size checks are for UX only; the backend validates again.
 */
export function FileUpload({
  attachments,
  onUpload,
  onRemove,
  disabled,
  className,
}: Readonly<{
  attachments: Attachment[]
  onUpload: (file: File, onProgress: (percent: number) => void) => Promise<unknown>
  onRemove?: (attachmentId: string) => Promise<unknown> | void
  disabled?: boolean
  className?: string
}>) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [queue, setQueue] = useState<UploadItem[]>([])
  const [dragging, setDragging] = useState(false)

  const validate = (file: File): string | null => {
    if (!UPLOAD_LIMITS.acceptedMimeTypes.includes(file.type)) {
      return 'รองรับเฉพาะไฟล์ภาพ (JPG/PNG/WebP) และ PDF'
    }
    if (file.size > UPLOAD_LIMITS.maxSizeBytes) {
      return `ไฟล์ใหญ่เกิน ${formatFileSize(UPLOAD_LIMITS.maxSizeBytes)}`
    }
    return null
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    const room = UPLOAD_LIMITS.maxFiles - attachments.length
    const accepted = list.slice(0, Math.max(0, room))

    for (const file of accepted) {
      const id = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      const error = validate(file)
      setQueue((q) => [...q, { id, file, progress: 0, error: error ?? undefined }])
      if (error) continue

      try {
        await onUpload(file, (percent) =>
          setQueue((q) => q.map((item) => (item.id === id ? { ...item, progress: percent } : item))),
        )
        setQueue((q) => q.map((item) => (item.id === id ? { ...item, done: true, progress: 100 } : item)))
        // Remove the finished row shortly after; the attachment list now owns it.
        window.setTimeout(() => setQueue((q) => q.filter((item) => item.id !== id)), 1200)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'อัปโหลดไม่สำเร็จ'
        setQueue((q) => q.map((item) => (item.id === id ? { ...item, error: message } : item)))
      }
    }
  }

  const full = attachments.length >= UPLOAD_LIMITS.maxFiles

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <button
        type="button"
        disabled={disabled || full}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (!disabled && !full) void handleFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex w-full flex-col items-center gap-2 rounded border-2 border-dashed px-4 py-7 transition-colors',
          dragging ? 'border-forest bg-forest-soft' : 'border-line bg-sunken hover:border-forest',
          (disabled || full) && 'cursor-not-allowed opacity-60',
        )}
      >
        <span className="grid h-11 w-11 place-items-center rounded-[10px] bg-forest-soft text-forest">
          <Icon name="upload" size={20} />
        </span>
        <span className="text-[.88rem] font-semibold text-ink">
          {full ? 'แนบไฟล์ครบจำนวนแล้ว' : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือกไฟล์'}
        </span>
        <span className="text-[.75rem] text-ink-faint">
          JPG / PNG / WebP / PDF · ไม่เกิน {formatFileSize(UPLOAD_LIMITS.maxSizeBytes)} ต่อไฟล์ ·
          สูงสุด {UPLOAD_LIMITS.maxFiles} ไฟล์
        </span>
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple
        hidden
        accept={UPLOAD_LIMITS.acceptedMimeTypes.join(',')}
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {queue.length > 0 && (
        <ul className="flex flex-col gap-2">
          {queue.map((item) => (
            <li
              key={item.id}
              className={cn(
                'rounded border px-3 py-2.5',
                item.error ? 'border-danger/40 bg-danger-soft' : 'border-line bg-white',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 flex-1 truncate text-[.82rem] text-ink">
                  {item.file.name}
                </span>
                <span className="dash-num shrink-0 text-[.74rem] text-ink-faint">
                  {item.error ? 'ไม่สำเร็จ' : `${item.progress}%`}
                </span>
              </div>
              {item.error ? (
                <p className="mt-1 flex items-center gap-1.5 text-[.75rem] text-danger">
                  <Icon name="alert" size={12} />
                  {item.error}
                </p>
              ) : (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-pill bg-line-soft">
                  <div
                    className="h-full rounded-pill bg-forest transition-[width] duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((file) => (
            <li
              key={file.id}
              className="flex items-center gap-3 rounded border border-line bg-white px-3 py-2.5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px] bg-meadow-soft text-meadow-deep">
                <Icon name={file.mimeType.startsWith('image/') ? 'image' : 'file'} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[.85rem] font-semibold text-forest hover:underline"
                >
                  {file.fileName}
                </a>
                <span className="dash-num block text-[.72rem] text-ink-faint">
                  {formatFileSize(file.size)} · {file.uploadedBy}
                </span>
              </span>
              {onRemove && !disabled && (
                <IconButton
                  icon="trash"
                  label={`ลบไฟล์ ${file.fileName}`}
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:bg-danger-soft"
                  onClick={() => void onRemove(file.id)}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {full && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          onClick={() => inputRef.current?.click()}
          disabled
        >
          แนบได้สูงสุด {UPLOAD_LIMITS.maxFiles} ไฟล์
        </Button>
      )}
    </div>
  )
}
