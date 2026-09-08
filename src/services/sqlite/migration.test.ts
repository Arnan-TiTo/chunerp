import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import initSqlJs from 'sql.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { migrateChunErp } from './chunErpStore'
import type { SqlParams, SqliteConnection, SqlValue } from './engine'

/**
 * A database saved by an older build has to open.
 *
 * This is the failure the login screen showed twice: `CREATE TABLE IF NOT
 * EXISTS` leaves an existing table alone, so a column added later is missing —
 * and the schema file *indexes* that column, so the whole schema pass died on
 * "no such column: exported_at" and took the boot with it. A fresh database
 * never reproduces it, which is exactly why it survived the first fix.
 */

let SQL: Awaited<ReturnType<typeof initSqlJs>>

beforeAll(async () => {
  SQL = await initSqlJs({
    wasmBinary: readFileSync(
      createRequire(import.meta.url).resolve('sql.js/dist/sql-wasm.wasm'),
    ),
  } as never)
})

/** The `debt` table as it was before the accounting export existed. */
const LEGACY_SCHEMA = `
CREATE TABLE debt (
  id                TEXT PRIMARY KEY,
  source_type       TEXT NOT NULL,
  source_id         TEXT NOT NULL,
  source_no         TEXT NOT NULL,
  farmer_id         TEXT NOT NULL,
  farmer_name       TEXT NOT NULL,
  farmer_code       TEXT NOT NULL,
  branch_id         TEXT NOT NULL,
  branch_name       TEXT NOT NULL,
  batch_no          TEXT NOT NULL,
  hatch_date        TEXT,
  breed_name        TEXT,
  original_amount   REAL NOT NULL,
  deducted_amount   REAL NOT NULL DEFAULT 0,
  remaining_balance REAL NOT NULL,
  status            TEXT NOT NULL,
  remark            TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE debt_deduction (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL,
  purchase_id    TEXT,
  transaction_no TEXT,
  amount         REAL NOT NULL,
  at             TEXT NOT NULL,
  actor_name     TEXT NOT NULL,
  remark         TEXT
);
`

/** The parts of a connection a migration touches. */
function connect(): SqliteConnection {
  const db = new SQL.Database()
  const rows = <T>(sql: string, params?: SqlParams): T[] => {
    const statement = db.prepare(sql)
    if (params) statement.bind(params as never)
    const out: T[] = []
    while (statement.step()) out.push(statement.getAsObject() as T)
    statement.free()
    return out
  }
  return {
    name: 'legacy-test',
    all: rows,
    one: <T>(sql: string, params?: SqlParams) => rows<T>(sql, params)[0] ?? null,
    run: (sql, params) => db.run(sql, params as never),
    transaction: (work) => work(),
    exec: (sql) => void db.exec(sql),
    persist: () => undefined,
    bytes: () => db.export(),
  } as SqliteConnection
}

function seedLegacyDebt(conn: SqliteConnection) {
  conn.exec(LEGACY_SCHEMA)
  conn.run(
    `INSERT INTO debt VALUES
       ('D-0001', 'BOOKING_DELIVERY', 'B-0001', 'BK-2569-0001', 'F-0001', 'สมชาย ทองอินทร์',
        '3600178', 'BR-KPP', 'ส.กำแพงเพชร', 'R1/2569', NULL, NULL,
        1570, 0, 1570, 'OPEN', NULL, '2026-07-25T03:00:00.000Z', '2026-07-25T03:00:00.000Z')`,
  )
}

describe('opening a database saved by an older build', () => {
  it('migrates instead of dying on the index over a missing column', () => {
    const conn = connect()
    seedLegacyDebt(conn)

    expect(() => migrateChunErp(conn)).not.toThrow()

    const debt = conn.one<{ exported_at: string | null; source_no: string }>(
      `SELECT source_no, exported_at FROM debt WHERE id = 'D-0001'`,
    )
    expect(debt?.source_no).toBe('BK-2569-0001')
    expect(debt?.exported_at).toBeNull()
  })

  it('keeps the rows that were already there', () => {
    const conn = connect()
    seedLegacyDebt(conn)
    migrateChunErp(conn)

    // Rebuilding the file would also have made the query above pass — what must
    // not happen is losing the row, or the permissions in the tables beside it.
    expect(conn.all(`SELECT id FROM debt`)).toHaveLength(1)
  })

  it('creates the tables that did not exist at all', () => {
    const conn = connect()
    seedLegacyDebt(conn)
    migrateChunErp(conn)

    for (const table of ['farmer_payment', 'export_batch', 'app_user']) {
      expect(
        conn.one(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`, [table]),
      ).not.toBeNull()
    }
  })

  it('is safe to run twice — the second open changes nothing', () => {
    const conn = connect()
    seedLegacyDebt(conn)
    migrateChunErp(conn)
    const columns = conn.all<{ name: string }>(`PRAGMA table_info(debt)`).map((c) => c.name)

    expect(() => migrateChunErp(conn)).not.toThrow()
    expect(conn.all<{ name: string }>(`PRAGMA table_info(debt)`).map((c) => c.name)).toEqual(
      columns,
    )
  })

  it('opens a brand new file the same way', () => {
    const conn = connect()
    expect(() => migrateChunErp(conn)).not.toThrow()
    const columns = conn.all<{ name: string }>(`PRAGMA table_info(debt)`).map((c) => c.name)
    expect(columns).toContain('exported_at')
    expect(columns).toContain('export_batch_no')
  })
})

export type { SqlValue }
