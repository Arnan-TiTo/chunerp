import '@testing-library/jest-dom/vitest'

/**
 * jsdom only exposes localStorage for a non-opaque document origin, which is
 * not guaranteed across runners. The app already treats storage as optional,
 * so a tiny in-memory shim keeps tests deterministic.
 */
if (!window.localStorage) {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() {
        return store.size
      },
    },
  })
}

// jsdom lacks these; several components rely on them.
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      ...globalThis.crypto,
      randomUUID: () => `test-${Math.random().toString(36).slice(2)}`,
    },
  })
}

if (!globalThis.URL.createObjectURL) {
  globalThis.URL.createObjectURL = () => 'blob:test'
  globalThis.URL.revokeObjectURL = () => undefined
}

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: () => undefined,
  removeListener: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  dispatchEvent: () => false,
})) as typeof window.matchMedia

/**
 * jsdom supplies its own AbortSignal, but the global `Request` in Node comes
 * from undici and rejects any signal that is not undici's own. React Router
 * constructs a Request on every navigation, which surfaces as an unhandled
 * rejection in tests. A minimal, faithful Request keeps the two realms apart
 * without changing what the router observes.
 */
class JsdomCompatibleRequest {
  readonly url: string
  readonly method: string
  readonly signal: AbortSignal | undefined
  readonly body: unknown

  constructor(input: string | { url: string }, init: RequestInit = {}) {
    this.url = typeof input === 'string' ? input : input.url
    this.method = init.method ?? 'GET'
    this.signal = init.signal ?? undefined
    this.body = init.body
  }
}

Object.defineProperty(window, 'Request', {
  configurable: true,
  writable: true,
  value: JsdomCompatibleRequest,
})

/**
 * The mock backend is SQLite (WASM). Node has no origin for sql.js to fetch
 * the module from, so the bytes are read off disk and injected, then both
 * databases are opened before any suite runs — exactly what `main.tsx` does in
 * the browser.
 */
const { readFileSync } = await import('node:fs')
const { createRequire } = await import('node:module')
const { setSqlJsWasmBinary } = await import('@/services/sqlite/engine')
const { ensureSqlite } = await import('@/services/sqlite/bootstrap')

setSqlJsWasmBinary(
  new Uint8Array(readFileSync(createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'))),
)
await ensureSqlite()
