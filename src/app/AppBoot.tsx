import { useEffect, useState } from 'react'
import { App } from './App'
import { initServices } from '@/services'

/**
 * Boot gate for the local SQLite backend.
 *
 * In mock mode the "backend" is two SQLite (WASM) databases that have to be
 * open before the first query runs. Waiting for them *outside* React would
 * leave a blank page whenever the WASM cannot load — a private window with
 * storage blocked, a corporate proxy, a stale service worker — with nothing on
 * screen to say why. So the wait happens here, where a failure can be shown.
 */
export function AppBoot() {
  const [state, setState] = useState<'booting' | 'ready' | 'failed'>('booting')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let cancelled = false
    initServices()
      .then(() => !cancelled && setState('ready'))
      .catch((err: unknown) => {
        if (cancelled) return
        setMessage(err instanceof Error ? err.message : String(err))
        setState('failed')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state === 'ready') return <App />

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        background: '#f3f6f1',
        color: '#22302a',
        fontFamily: 'Sarabun, system-ui, sans-serif',
        padding: 24,
      }}
    >
      {state === 'booting' ? (
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: 34,
              height: 34,
              margin: '0 auto 14px',
              border: '3px solid #dde5da',
              borderTopColor: '#2a5340',
              borderRadius: '50%',
              animation: 'chul-spin .8s linear infinite',
            }}
          />
          <p style={{ fontSize: 14, color: '#5c6b62' }}>กำลังเตรียมฐานข้อมูล...</p>
          <style>{'@keyframes chul-spin{to{transform:rotate(360deg)}}'}</style>
        </div>
      ) : (
        <div
          style={{
            maxWidth: 560,
            background: '#fff',
            border: '1px solid #dde5da',
            borderRadius: 14,
            padding: '26px 28px',
          }}
        >
          <h1 style={{ margin: '0 0 8px', fontSize: 18, color: '#9a4234' }}>
            เปิดฐานข้อมูลไม่สำเร็จ
          </h1>
          <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.7, color: '#5c6b62' }}>
            ระบบใช้ SQLite (WASM) เก็บข้อมูลในเครื่อง หากเปิดในโหมดไม่ระบุตัวตน
            หรือเบราว์เซอร์บล็อกการเก็บข้อมูลของเว็บไซต์ไว้ จะเปิดฐานข้อมูลไม่ได้
          </p>
          <pre
            style={{
              margin: '0 0 16px',
              padding: 12,
              background: '#f3f6f1',
              borderRadius: 8,
              fontSize: 12,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: '#22302a',
            }}
          >
            {message || 'ไม่ทราบสาเหตุ'}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 18px',
              background: '#2a5340',
              color: '#fff',
              border: 0,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ลองใหม่อีกครั้ง
          </button>
        </div>
      )}
    </div>
  )
}
