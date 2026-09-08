import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setSqlJsWasmBinary, type SqliteConnection } from '@/services/sqlite/engine'
import { chunErpConnection } from '@/services/sqlite/chunErpStore'
import { floorWeightConnection } from '@/services/sqlite/floorWeightStore'
import { databaseFiles, ensureSqlite } from '@/services/sqlite/bootstrap'

/**
 * ดึงฐานข้อมูลพร้อมข้อมูลจริงออกมาเป็นไฟล์ .sqlite
 *
 *   npm run db:dump
 *
 * รันโค้ดชุดเดียวกับที่เบราว์เซอร์รันตอนเปิดระบบ — เปิดฐานข้อมูล ใส่ข้อมูล
 * ตั้งต้น คำนวณยอดที่ต้องคำนวณ แล้วเขียนไฟล์ออกมา ไฟล์ที่ได้จึงเป็นฐานข้อมูล
 * เดียวกับที่ระบบใช้จริง ไม่ใช่การ export ซ้ำที่อาจต่างกัน
 *
 * ได้ออกมาสองแบบต่อหนึ่งฐาน: ไฟล์ .sqlite สำหรับเปิดด้วย DB Browser และไฟล์
 * -data.sql ที่เป็นคำสั่ง INSERT ทั้งหมด สำหรับอ่านในโปรแกรมแก้ไขข้อความ
 *
 * ในเครื่องไม่มี IndexedDB ทุกครั้งที่รันจึงได้ข้อมูลตั้งต้นชุดใหม่เสมอ —
 * ถ้าต้องการข้อมูลที่แก้ไว้ในเบราว์เซอร์ ให้กดดาวน์โหลดจากหน้าตั้งค่าระบบแทน
 */

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)

// The browser fetches the WASM by URL; here it is read off disk instead.
setSqlJsWasmBinary(new Uint8Array(readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'))))

await ensureSqlite()

mkdirSync(resolve(root, 'db/build'), { recursive: true })

for (const file of databaseFiles()) {
  writeFileSync(resolve(root, 'db/build', file.fileName), Buffer.from(file.bytes))
  console.log(`db/build/${file.fileName} — ${(file.bytes.length / 1024).toFixed(0)} KB`)

  // A .sqlite file needs a tool to read; the same rows as INSERT statements can
  // be opened in the editor, diffed, and pasted into PostgreSQL.
  const sqlName = file.fileName.replace(/\.sqlite$/, '-data.sql')
  const dump = dumpSql(file.name === 'chunerp' ? chunErpConnection() : floorWeightConnection())
  writeFileSync(resolve(root, 'db/build', sqlName), dump.text, 'utf8')
  console.log(`db/build/${sqlName} — ${dump.rows} แถว จาก ${dump.tables} ตาราง`)
}

/** Every row in the database as INSERT statements, table by table. */
function dumpSql(conn: SqliteConnection) {
  const tables = conn
    .all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .map((row) => row.name)

  const literal = (value: unknown): string => {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'number') return String(value)
    if (value instanceof Uint8Array) return `X'${Buffer.from(value).toString('hex')}'`
    return `'${String(value).replaceAll("'", "''")}'`
  }

  const lines = [
    `-- ข้อมูลจากฐานข้อมูล ${conn.name} · ${new Date().toISOString()}`,
    `-- สร้างด้วย npm run db:dump — โครงสร้างตารางอยู่ที่ db/sqlite/`,
    '',
  ]
  let rows = 0
  let filled = 0

  for (const table of tables) {
    const data = conn.all<Record<string, unknown>>(`SELECT * FROM "${table}"`)
    if (data.length === 0) continue
    filled += 1
    rows += data.length
    const columns = Object.keys(data[0])
    lines.push(`-- ${table} (${data.length} แถว)`)
    for (const row of data) {
      lines.push(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
          .map((c) => literal(row[c]))
          .join(', ')});`,
      )
    }
    lines.push('')
  }

  return { text: lines.join('\n'), rows, tables: filled }
}
