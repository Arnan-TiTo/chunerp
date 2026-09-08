import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import initSqlJs from 'sql.js'

/**
 * สร้างไฟล์ .sqlite จริงจากไฟล์ schema.
 *
 * ระบบตอนรันใช้ SQLite (WASM) อยู่ในเบราว์เซอร์ ตัวฐานข้อมูลจึงไม่ได้เป็นไฟล์
 * บนดิสก์ — แต่โครงสร้างมาจาก db/sqlite/*.sql ชุดเดียวกันนี้ สคริปต์นี้จึง
 * สร้างไฟล์ออกมาให้เปิดดูด้วย DB Browser for SQLite / DBeaver ได้ และใช้
 * ตรวจว่า DDL ทั้งไฟล์รันผ่านจริงก่อนขึ้นของ
 *
 *   npm run db:build
 */

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const require = createRequire(import.meta.url)

const SQL = await initSqlJs({
  wasmBinary: readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm')),
})

const TARGETS = [
  { schema: 'db/sqlite/chunerp.sql', out: 'db/build/chunerp.sqlite' },
  { schema: 'db/sqlite/floor_weight.sql', out: 'db/build/floorweight.sqlite' },
]

mkdirSync(resolve(root, 'db/build'), { recursive: true })

for (const target of TARGETS) {
  const db = new SQL.Database()
  db.exec(readFileSync(resolve(root, target.schema), 'utf8'))

  const tables = db.exec(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
  )
  const names = tables[0]?.values.map((row) => row[0]) ?? []

  writeFileSync(resolve(root, target.out), Buffer.from(db.export()))
  db.close()

  console.log(`${target.out} — ${names.length} ตาราง`)
  console.log(`  ${names.join(', ')}`)
}
