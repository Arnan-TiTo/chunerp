import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url'

/**
 * SQLite (sql.js / WASM) — the store of record while there is no server.
 *
 * Two databases are opened side by side and never share a connection, because
 * they are two different systems:
 *
 *   • `floorweight` — the external Floor Weight Cocoon scale system. ChunERP
 *     only ever reads it, exactly as it will read the real MSSQL instance.
 *   • `chunerp`     — our own receiving/finance documents.
 *
 * Keeping them apart is the point: the integration has to cross a real
 * database boundary here, so swapping `floorweight` for MSSQL later changes
 * one adapter and nothing else.
 *
 * Bytes are persisted to IndexedDB after every write, so a reload keeps what
 * the counter staff entered.
 */

/**
 * Bump this whenever the fixtures change shape — a farmer set, a booking
 * layout, a status flow.
 *
 * A saved database whose generation does not match is rebuilt rather than
 * migrated: mixing two generations leaves half the rows pointing at ids that
 * belong to the other half, which is how a queue ends up referencing a booking
 * that no longer exists.
 */
export const SEED_VERSION = '2026-09-08.10-farmers'

let sqlJs: SqlJsStatic | null = null
let wasmBinary: Uint8Array | null = null

/**
 * Supplies the WASM bytes directly instead of letting sql.js fetch them.
 *
 * The browser fetches `sql-wasm.wasm` by URL, but a test runner has no origin
 * to fetch from — the test setup reads the file and hands it over here, which
 * keeps `node:fs` out of the application bundle entirely.
 */
export function setSqlJsWasmBinary(bytes: Uint8Array): void {
  wasmBinary = bytes
}

async function loadSqlJs(): Promise<SqlJsStatic> {
  if (sqlJs) return sqlJs
  // sql.js types `wasmBinary` as Emscripten's ArrayBuffer, but the runtime
  // accepts the typed array it is actually given.
  sqlJs = await initSqlJs(
    wasmBinary
      ? ({ wasmBinary } as unknown as Partial<EmscriptenModule>)
      : { locateFile: () => wasmUrl },
  )
  return sqlJs
}

/* ── IndexedDB persistence ──────────────────────────────────────────────── */

const IDB_NAME = 'chulfarm-sqlite'
const IDB_STORE = 'databases'

function openIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)
  return new Promise((resolve) => {
    const request = indexedDB.open(IDB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(IDB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    // A blocked or unavailable IndexedDB is not fatal — we just lose durability.
    request.onerror = () => resolve(null)
  })
}

async function readBytes(name: string): Promise<Uint8Array | null> {
  const idb = await openIdb()
  if (!idb) return null
  return new Promise((resolve) => {
    const tx = idb.transaction(IDB_STORE, 'readonly')
    const request = tx.objectStore(IDB_STORE).get(name)
    request.onsuccess = () => {
      const value: unknown = request.result
      resolve(value instanceof Uint8Array ? value : null)
    }
    request.onerror = () => resolve(null)
  })
}

async function writeBytes(name: string, bytes: Uint8Array): Promise<void> {
  const idb = await openIdb()
  if (!idb) return
  await new Promise<void>((resolve) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).put(bytes, name)
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/** Drops both databases so the next boot re-seeds them. */
export async function resetSqliteStorage(): Promise<void> {
  const idb = await openIdb()
  if (!idb) return
  await new Promise<void>((resolve) => {
    const tx = idb.transaction(IDB_STORE, 'readwrite')
    tx.objectStore(IDB_STORE).clear()
    tx.oncomplete = () => resolve()
    tx.onerror = () => resolve()
  })
}

/* ── Connection wrapper ─────────────────────────────────────────────────── */

export type SqlValue = string | number | Uint8Array | null
export type SqlParams = Record<string, SqlValue> | SqlValue[]

export interface SqliteConnection {
  readonly name: string
  /** Rows as plain objects, which is all the adapters ever need. */
  all<T = Record<string, SqlValue>>(sql: string, params?: SqlParams): T[]
  one<T = Record<string, SqlValue>>(sql: string, params?: SqlParams): T | null
  run(sql: string, params?: SqlParams): void
  /** Runs a batch inside a transaction and persists once at the end. */
  transaction(work: () => void): void
  exec(sql: string): void
  persist(): void
  /**
   * The database as a real SQLite file.
   *
   * The same bytes that go into IndexedDB — so what a user downloads is the
   * file itself, openable in DB Browser, not a re-export that might differ
   * from what the app is actually running on.
   */
  bytes(): Uint8Array
}

function wrap(db: Database, name: string): SqliteConnection {
  let persistTimer: ReturnType<typeof setTimeout> | null = null

  const schedulePersist = () => {
    // Exporting the whole file is cheap at this size but not free, so coalesce
    // the bursts of writes a single user action produces.
    if (persistTimer) clearTimeout(persistTimer)
    persistTimer = setTimeout(() => {
      persistTimer = null
      void writeBytes(name, db.export())
    }, 150)
  }

  const all = <T,>(sql: string, params?: SqlParams): T[] => {
    const stmt = db.prepare(sql)
    try {
      if (params) stmt.bind(params as never)
      const rows: T[] = []
      while (stmt.step()) rows.push(stmt.getAsObject() as T)
      return rows
    } finally {
      stmt.free()
    }
  }

  return {
    name,
    all,
    one: <T,>(sql: string, params?: SqlParams) => all<T>(sql, params)[0] ?? null,
    run(sql, params) {
      db.run(sql, params as never)
      schedulePersist()
    },
    transaction(work) {
      db.run('BEGIN')
      try {
        work()
        db.run('COMMIT')
      } catch (err) {
        db.run('ROLLBACK')
        throw err
      }
      schedulePersist()
    },
    exec(sql) {
      db.exec(sql)
      schedulePersist()
    },
    persist: schedulePersist,
    bytes: () => db.export(),
  }
}

/**
 * Opens a database, restoring it from IndexedDB when it is already there.
 *
 * `migrate` runs every time and carries the schema DDL, so a database saved
 * before a table existed picks it up instead of failing on the next query. If
 * it throws, the saved file is discarded and rebuilt rather than left to break
 * every screen behind it.
 * `seed` runs only against a fresh file — re-seeding a restored one would
 * overwrite what the user did.
 *
 * `isUsable` gets the last word on a restored file. Adding a table can be
 * migrated into; a fixture set that has been rewritten cannot, because half the
 * rows would then belong to one generation and half to another, and every
 * foreign key between them would point at nothing. When it says no, the file is
 * discarded and rebuilt rather than patched.
 */
export async function openDatabase(
  name: string,
  migrate: (conn: SqliteConnection) => void,
  seed: (conn: SqliteConnection) => void,
  isUsable?: (conn: SqliteConnection) => boolean,
): Promise<SqliteConnection> {
  const SQL = await loadSqlJs()
  const saved = await readBytes(name)

  if (saved) {
    const restored = wrap(new SQL.Database(saved), name)
    // A migration that throws used to leave the user staring at a dead login
    // screen with no way forward. Losing a local file is recoverable; a system
    // that will not open is not — so a file we cannot bring forward is dropped
    // and rebuilt, loudly.
    let migrated = true
    try {
      restored.transaction(() => migrate(restored))
    } catch (error) {
      console.error(`[sqlite] rebuilding "${name}" — migration failed`, error)
      migrated = false
    }
    if (migrated && (!isUsable || isUsable(restored))) return restored
  }

  const conn = wrap(new SQL.Database(), name)
  conn.transaction(() => {
    migrate(conn)
    seed(conn)
  })
  conn.persist()
  return conn
}

/** Escapes a value for the rare places a literal is clearer than a binding. */
export function sqlText(value: string | null | undefined): string {
  if (value == null) return 'NULL'
  return `'${value.replaceAll("'", "''")}'`
}
