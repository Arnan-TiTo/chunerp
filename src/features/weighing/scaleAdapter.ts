/**
 * WEIGH-002 — Scale Adapter interface.
 *
 * Defines how the UI talks to a digital scale without committing to a
 * transport. The mock adapter lets the whole weighing flow be exercised (and
 * tested) with no hardware present; a WebSerial/WebSocket implementation can
 * be dropped in later behind the same interface.
 */

export interface ScaleReading {
  /** Kilograms as reported by the device. */
  weight: number
  unit: 'KG'
  /** True once the device reports the reading has settled. */
  stable: boolean
  at: string
}

export interface ScaleAdapter {
  readonly id: string
  readonly label: string
  isSupported(): boolean
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Pushes readings until the returned unsubscribe function is called. */
  subscribe(onReading: (reading: ScaleReading) => void): () => void
  /** Zeroes the scale. Rejects if the device does not support it. */
  tare?(): Promise<void>
}

/** Deterministic-enough simulator: drifts, then settles on a stable value. */
export function createMockScaleAdapter(target = 78.4): ScaleAdapter {
  let timer: number | undefined
  let connected = false

  return {
    id: 'mock',
    label: 'เครื่องชั่งจำลอง (ไม่ต้องต่ออุปกรณ์)',
    isSupported: () => true,
    async connect() {
      connected = true
    },
    async disconnect() {
      connected = false
      if (timer) window.clearInterval(timer)
    },
    subscribe(onReading) {
      if (!connected) throw new Error('ยังไม่ได้เชื่อมต่อเครื่องชั่ง')
      let tick = 0
      timer = window.setInterval(() => {
        tick += 1
        // Wobble for ~2s, then hold steady so "stable" means something.
        const settling = tick < 8
        const noise = settling ? (Math.sin(tick) * target) / 40 : 0
        onReading({
          weight: Math.round((target + noise) * 100) / 100,
          unit: 'KG',
          stable: !settling,
          at: new Date().toISOString(),
        })
      }, 260)
      return () => {
        if (timer) window.clearInterval(timer)
      }
    },
    async tare() {
      /* nothing to zero on the simulator */
    },
  }
}

/**
 * Real hardware is not wired up yet — §20 lists "วิธีเชื่อมเครื่องชั่งจริง"
 * as unconfirmed. This keeps the selection point explicit rather than hiding
 * the gap.
 */
export function getScaleAdapter(): ScaleAdapter {
  return createMockScaleAdapter()
}
