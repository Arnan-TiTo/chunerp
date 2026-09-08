# ไร่กำนันจุล — Silk Management System (Frontend)

Production-shaped React frontend for the Chul Farm silk operation, built to
`CHUL_FARM_AI_DEV_FRONTEND_MASTER_SPEC_v1.0.docx`.

Covers ส่งเสริมเกษตรกร → จองไข่ไหม → จุดคัดแยก → จุดชั่งน้ำหนัก → สรุปรับซื้อ →
ตัดหนี้ → บันทึกค่าใช้จ่าย, plus reports, audit history, permissions and settings.

---

## Quick start

```bash
npm install
cp .env.example .env.local     # already checked in as .env.local for convenience
npm run dev                    # http://localhost:5173
```

The app boots against a **typed mock adapter** — no backend required.

### Demo accounts

Password for all: `chulfarm2569`

| Username    | Role            | Work areas unlocked                       |
| ----------- | --------------- | ----------------------------------------- |
| `admin`     | ผู้ดูแลระบบ       | **ผู้ดูแลระบบ (ทุกเมนู)** + อีก 4 พื้นที่          |
| `farm`      | ผู้จัดการฟาร์ม     | ส่งเสริมเกษตรกร, รับซื้อรังไหมสด, ภาพรวมผู้บริหาร |
| `receiving` | เจ้าหน้าที่รับซื้อ   | ส่งเสริมเกษตรกร, รับซื้อรังไหมสด               |
| `account`   | บัญชี / การเงิน   | บัญชีและการเงิน, ภาพรวมผู้บริหาร                |
| `manager`   | ผู้บริหาร         | 4 พื้นที่ (ดู + อนุมัติ) — ไม่มีเมนูระบบ          |
| `viewer`    | อ่านอย่างเดียว     | ส่งเสริมเกษตรกร, รับซื้อรังไหมสด, บัญชีและการเงิน  |

---

## ประเภทงาน — the work-area model

The dashboard is **not** one fixed page. After login the user lands on
**เลือกพื้นที่การทำงาน** (`/hub`) and picks a work area; that choice then drives
three things at once:

| Work area              | Accent | Sidebar                       | Dashboard snapshot          |
| ---------------------- | ------ | ----------------------------- | --------------------------- |
| ผู้ดูแลระบบ (ทุกเมนู)     | forest | **ทุกโมดูล** + สร้างเอกสาร + ระบบ | org-wide totals             |
| ส่งเสริมเกษตรกร           | sage   | เกษตรกร + ไข่ไหม                | farmer & booking KPIs       |
| รับซื้อรังไหมสด            | indigo | จุดคัดแยก + จุดชั่งน้ำหนัก          | live queue, weight, sorting |
| บัญชีและการเงิน           | tan    | ตัดหนี้ + ค่าใช้จ่าย               | expense & debt KPIs         |
| ภาพรวมผู้บริหาร           | mauve  | รายงาน + ข้อมูลหลัก              | org-wide totals             |

**ผู้ดูแลระบบ (ทุกเมนู)** is the unscoped view — every module in one sidebar for
people who work across the whole operation. It is gated on `permission:manage`,
so only the ADMIN role is offered it, and it is where an administrator lands by
default.

**เป็นของใครของมัน** is enforced three ways:

1. `getAvailableWorkTypes(permissions)` filters the hub to what the account can
   actually open — a receiving clerk never sees the finance area.
2. The choice is stored per user id (`chulfarm.workType.<userId>`), so two
   accounts on one counter tablet never inherit each other's view.
3. `resolveDefaultWorkType()` falls back saved-choice → server default →
   role-matched area → first available.

Switching work area (topbar pill, or `/hub`) swaps the sidebar, re-queries the
dashboard snapshot, and re-binds the `--accent` CSS custom properties. Adding a
work area means adding one entry to `src/constants/workTypes.ts` and one
snapshot builder — no page component changes.

---

## Architecture

```
src/
  app/            router, shell layout, global search, error boundary
  components/     ui/ · form/ · data-display/ · feedback/
  constants/      work areas, RBAC matrix, status registries, reference data
  features/       auth · workarea · dashboard · farmers · bookings ·
                  receiving (sorting + weighing) · purchase · debt ·
                  expenses · products · master · reports · system
  hooks/          list params (URL-synced), branch context, dirty guard
  schemas/        Zod validation — format rules only
  services/       api/contracts.ts · adapters/httpAdapter · mocks/mockAdapter ·
                  sqlite/ (engine + the two databases)
  types/          common · auth · domain · dashboard · integration
  utils/          cn · format · errors · storage
db/
  mssql/          floor_weight_schema.sql — the external system, as it really is
  sqlite/         floor_weight.sql · chunerp.sql — the stand-ins used today
```

**Data flow (§11)**

```
Page → Feature hook → Service interface → HTTP adapter
                                        ↘ Mock adapter → SQLite (chunerp)
                                                       ↘ SQLite (floorweight)
```

No page calls `fetch`/`axios`. Swapping adapters is one env var.

### Switching to the real API

```bash
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://api.example.com
```

`src/services/adapters/httpAdapter.ts` already maps every contract method to an
endpoint. If the backend DTO differs from the frontend contract, put the mapping
**in that adapter** — pages never change.

---

## Master data — every dropdown has a table behind it

No screen hard-codes the contents of a picker. Each list resolves from a master
table with its own CRUD screen, so what a user can choose is editable in one
place and carries an audit trail.

**`/master` — ข้อมูลหลัก**

| Table            | Feeds                                            |
| ---------------- | ------------------------------------------------ |
| `branch`         | สาขา / จุดรับซื้อ on every list and form         |
| `project`        | โครงการ on bookings and the receiving slip       |
| `bank`           | ธนาคาร on the expense transfer section           |
| `expenseCategory`| ประเภทค่าใช้จ่าย + its dependent ประเภทย่อย      |

**`/products` — ข้อมูลหลักสินค้า**

| Table          | Feeds                                                       |
| -------------- | ----------------------------------------------------------- |
| `product`      | booking line items; EGG rows also feed สายพันธุ์ on the slip |
| `productUnit`  | the unit shown on every line                                |
| `productPrice` | the unit price — **documents can never override it**        |
| `warehouse`    | stock location on a product                                 |

Disabling a row removes it from new documents while existing documents that
reference it still render.

Workflow enumerations — booking status, queue status, payment method — stay in
code on purpose: changing them changes behaviour, not just a label.

### Pricing rule

A booking line carries only `{ productId, quantity }`. The backend resolves the
unit and the effective price from `productPrice` and computes the amount, so a
document cannot charge a price that is not in the price list. Setting a new
price closes the previous row with an end date instead of overwriting it, which
keeps last month's invoices reconstructable.

The booking's line total is the figure carried forward to raise the farmer's
debt (ยอดตั้งหนี้) — shown on both the form and the detail view.

---

## Design system

**Colour is sampled from the Chul Farm key art**
(`Gemini_Generated_Image_56a89c56a89c56a8.jpeg`) — the paper-cut village scene.
Layout, spacing, radii and shadows follow the ChewaChem Portal system, so the
two products share an anatomy while this one keeps its own identity.

| Token     | Hex       | Taken from                            | Used for                          |
| --------- | --------- | ------------------------------------- | --------------------------------- |
| `forest`  | `#2a5340` | shade beneath the stilt houses        | topbar, table headers, primary    |
| `sage`    | `#6e8b54` | rice-field and bush green             | confirm actions                   |
| `meadow`  | `#9cb35e` | sunlit terraces                       | success, active nav, focus ring   |
| `tan`     | `#a8763f` | teak roofs, cart wheel, sand path     | warnings, money                   |
| `indigo`  | `#46617f` | villagers' clothes, far hills         | information                       |
| `mauve`   | `#a5717f` | the mauve sashes                      | one work-area accent              |
| `clay`    | `#9a4234` | *not in the art* — keyed to the teak  | errors                            |
| `canvas`  | `#f3f6f1` | mint sky washed to near-white         | page background                   |
| `ink`     | `#22302a` | deepest foliage                       | body text                         |

Each work area draws its accent from a different element of the same painting,
so they stay distinguishable without leaving the palette:

| Work area        | Accent   |
| ---------------- | -------- |
| ผู้ดูแลระบบ       | `forest` |
| ส่งเสริมเกษตรกร   | `sage`   |
| รับซื้อรังไหมสด    | `indigo` |
| บัญชีและการเงิน   | `tan`    |
| ภาพรวมผู้บริหาร   | `mauve`  |

Tokens live in one place — `src/styles/tokens.css`, mirrored in
`tailwind.config.js`. Re-theming is a single-file edit; no component holds a
hard-coded colour. The login and hub backgrounds use a terraced-field contour
pattern rather than a generic grid, echoing the paddies in the artwork.

Status is never colour alone — every badge carries a tone, an icon and a Thai
label (§3).

---

## Scripts

| Command             | Purpose                                      |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server                              |
| `npm run typecheck` | `tsc --noEmit` for app + node configs        |
| `npm run lint`      | ESLint, zero warnings tolerated              |
| `npm test`          | Vitest (unit + component)                    |
| `npm run build`     | typecheck then production build              |
| `npm run preview`   | serve the production build                   |

Current status: **typecheck ✅ · lint ✅ · 109 tests ✅ · build ✅**

---

## วงจรของเกษตรกรหนึ่งราย

Every number in the system hangs off one chain, and nothing may skip a link:

```
ใบจอง          เจ้าหน้าที่ส่งเสริม        ตั้งหนี้           เลี้ยงไหม
จองไข่ไหม +   →  บันทึกส่งของ        →  ตามของที่รับไป  →  แล้วนำรังไหมสด
วัตถุดิบ/เคมี      (booking:deliver)      (รอบ R#/25xx)      มาขายที่จุดรับซื้อ
                                                                    │
   เกษตรกรรับส่วนต่าง  ←  หักหนี้ของรอบนั้น  ←  ใบรับซื้อรังไหมสด  ←──┘
```

**หนึ่งเกษตรกร หนึ่งรอบ.** A farmer rears one batch at a time — they cannot book
again until the cocoons of the current round have been bought. `bookings.create`
refuses a second round while one is still open, which is why a slip's รอบ picker
never shows more than one choice.

The fixture is ten farmers standing at ten points on that path:

| Stage | Farmers | State |
| ----- | ------- | ----- |
| ครบทั้งกระบวนการ | 1 | ขายแล้ว มีใบรับซื้อ หนี้ปิดยอดจากใบนั้น |
| จองแล้ว รอส่งของ | 2 | ยังไม่มีหนี้ |
| ส่งของแล้ว กำลังเลี้ยง | 7 | ตั้งหนี้แล้ว · 2 รายมาถึงจุดรับซื้อวันนี้ (คัดแยก 1, รอชั่ง 1) |

Floor Weight holds a closed weighing for **all seven** delivered rounds, waiting
to be synced — the scale weighs the load as it arrives and ChunERP pulls it in.

**A booking raises nothing.** It is a request. The debt is opened by
`recordDelivery()` — when the promotion officer records the hand-over — and it
is opened at the **delivered** quantities, not the booked ones, because that is
what the farmer actually received. Prices come from the product master at that
moment, never from the request payload.

That is why a queue slip always carries a `bookingId`. At จุดคัดแยก the counter
chooses the **รอบ** the farmer is bringing, and nothing else about the eggs is
typed: สายพันธุ์ · รุ่นฟัก · จำนวนไข่ไหมที่จองไป · โครงการ are read back from that
delivery, read-only, alongside a summary of what was handed over and the debt it
raised. `createQueue` refuses a round that was never delivered, belongs to
another farmer, or already has an open slip.

`bookings.rounds(farmerId)` returns **every** round with a flag saying whether a
slip may be written against it, and why not when it may not:

| `blockedReason` | What the counter should do |
| --------------- | -------------------------- |
| `NOT_DELIVERED` | ให้เจ้าหน้าที่ส่งเสริมบันทึกส่งของที่ใบจองก่อน |
| `ALREADY_QUEUED` | ไปทำต่อที่ใบคิวเดิม ไม่ต้องออกใบใหม่ |
| `ALREADY_PURCHASED` | รอบนี้จบแล้ว — ต้องจองรอบใหม่ |

Returning the reason rather than an empty list is the difference between the
screen telling someone to record a delivery that already happened and telling
them the round was sold last week.

The seed holds to the same rule — every ticket is drawn from a delivered
booking, at most once — and `mockAdapter.test.ts` asserts the chain end to end:
every ticket resolves to a booking with a delivery, the slip header matches that
booking rather than the caller's payload, and every completed invoice has a debt
of the same รอบ to be matched against.

## รับซื้อรังไหมสด — two stations, in physical order

The paper ใบคิว is **written and issued at จุดคัดแยก**, and only then does the
farmer carry the cocoons to the scale. The app follows that order:

```
จุดคัดแยก  /receiving/sorting            จุดชั่งน้ำหนัก  /receiving/weighing
  เปิดใบคิว → กรอกหัว + ผลคัดแยก           เรียกคิว → ดึงน้ำหนักจากระบบชั่ง → ล็อก → ใบรับซื้อ
  → ออกใบคิว (ได้เลขคิว)  ──────────────▶   WAITING_WEIGH → CALLED → WEIGHING
```

| Status          | Meaning                                    |
| --------------- | ------------------------------------------ |
| `SORTING`       | ใบคิวเปิดอยู่ที่จุดคัดแยก — ยังไม่มีเลขคิว |
| `WAITING_WEIGH` | ออกใบคิวแล้ว (ได้เลขคิว) รอชั่ง            |
| `CALLED`        | เรียกคิวที่จุดชั่งแล้ว                     |
| `WEIGHING`      | กำลังชั่ง                                  |
| `COMPLETED`     | ปิดรายการรับซื้อแล้ว                       |
| `CANCELLED`     | ยกเลิก                                     |

The queue number is assigned by `issueSlip()` — the moment the sorting station
hands the slip over — and issuing locks the sorting result, because from then on
the slip is a printed document.

### จุดชั่งน้ำหนัก คือระบบภายนอก

The scale is **not** part of ChunERP. *Floor Weight Cocoon* weighs each ถุง and
writes it to its own database; ChunERP pulls the finished slip and carries on
from there. It never writes back.

```
Floor Weight Cocoon                        ChunERP
  ┌──────────────────────┐   pull by        ┌──────────────────────────┐
  │ FloorWeightSession   │  farmer code +   │ fresh_weigh_slip         │
  │ FloorWeightDetail    │──weigh date────▶ │ weigh_bag (1 แถว/ถุง)     │
  │ FloorWeightShellSample│                 │ shell_weigh_slip         │
  │ FloorWeightGrade     │                  │ floor_weight_import      │
  └──────────────────────┘                  └──────────────────────────┘
      MSSQL (จริง)                              ใบรับซื้อรังไหมสด
      SQLite (ตอนนี้)
```

**The filter is รหัสเกษตรกร + วันที่ชั่ง.** Leaving the date empty means "that
farmer's latest closed weighing", which is what the counter wants nine times out
of ten. Only `CLOSED` sessions are returned — a slip still being weighed would
under-report the load.

Grade codes are translated through the *external system's own* grade master
(`FloorWeightGrade.ErpGrade`), never a table hard-coded in our code, so a new
grade on the scale cannot silently land in the wrong invoice column.

An external session can be pulled onto **one queue only**; the import log is what
enforces that, and cancelling a queue releases the session again. Manual bag
entry survives as a correction path for when the link is down.

| Contract method              | Endpoint (real backend)                     |
| ---------------------------- | ------------------------------------------- |
| `floorWeightStatus`          | `GET /integration/floor-weight/status`      |
| `floorWeightLatestDate`      | `GET /integration/floor-weight/latest-date` |
| `floorWeightSessions`        | `GET /integration/floor-weight/sessions`    |
| `importFloorWeight`          | `POST /receiving/:queueId/weighing/import`  |

### The two databases

While there is no server, both systems live in SQLite (sql.js/WASM), persisted
to IndexedDB so a reload keeps what the counter entered:

| Database      | Owner              | ChunERP's access | Schema                    |
| ------------- | ------------------ | ---------------- | ------------------------- |
| `floorweight` | Floor Weight Cocoon| read only        | `db/sqlite/floor_weight.sql` |
| `chunerp`     | this system        | read/write       | `db/sqlite/chunerp.sql`      |

`chunerp` holds **everything the system owns** — 23 tables:

| Area | Tables |
| ---- | ------ |
| ผู้ใช้/สิทธิ์ | `app_user` · `role_permission` · `user_permission` |
| ข้อมูลหลัก | `branch` · `project` · `bank` · `expense_category` · `expense_type` |
| สินค้า | `product_unit` · `warehouse` · `product` · `product_price` |
| เกษตรกร | `farmer` |
| ใบจอง/ส่งของ | `booking` · `booking_item` · `booking_delivery` · `delivery_item` |
| รับซื้อ | `queue_ticket` · `receiving_quality` · `fresh_weigh_slip` · `weigh_bag` · `shell_weigh_slip` · `floor_weight_import` |
| หนี้ | `debt` · `debt_item` · `debt_deduction` |
| ค่าใช้จ่าย | `expense` · `expense_attachment` |
| ระบบ | `audit_entry` · `app_setting` · `document_counter` |

Nothing the user changes lives only in memory. A permission grant, a corrected
price, a disabled master row, a booking, an approval — each is an `INSERT`/
`UPDATE` in `src/services/sqlite/repositories.ts`, and `persistence.test.ts`
reads the row back out of SQLite rather than through the service, because
asserting through the service is exactly what would have missed the permission
grid writing to an array.

Reads happen once at boot and rehydrate the working set. Anything **derivable**
is deliberately not a column and is recomputed on read — a line total, the
effective price, %เปลือกรัง, a farmer's outstanding debt, the invoice — so a
corrected price can never leave stale money behind in an old row.

### Upgrades

Three things happen when a saved database is opened, in order:

1. **Schema** — the DDL re-runs (`CREATE TABLE IF NOT EXISTS`), so a file saved
   before a table existed gains it.
2. **Generation check** — `SEED_VERSION` in `engine.ts` records which set of
   fixtures a file was built from. If it does not match, the file is **rebuilt
   from scratch** rather than patched. Adding a table can be migrated into; a
   rewritten fixture set cannot, because half the rows would then belong to one
   generation and half to the other, and every foreign key between them would
   point at nothing — which is exactly how a queue ended up referencing a
   booking that no longer existed.
3. **Backfill** — any table that is still empty is seeded. Creating `app_user`
   on an upgrade without filling it leaves nobody able to sign in.

Bump `SEED_VERSION` whenever the fixtures change shape. Within a generation,
what the user changed is kept; across one, the demo data is rebuilt.

### Taking the schema to PostgreSQL

`db/postgres/schema.sql` is **generated from** `db/sqlite/chunerp.sql`, so the
two cannot drift: same tables, columns, keys and comments. Only the types
differ — `TIMESTAMPTZ` for instants, `DATE` for calendar days, `NUMERIC(14,2)`
for money and weights, `BOOLEAN` for flags, `JSONB` for the audit payloads.

Deliberately left out, because they belong to the deployment rather than the
model: database roles and `GRANT`s, sequences if you prefer them to
`document_counter`, a tenant column for multi-company, and row-level security
if branch isolation should be enforced at the database.

`db/mssql/floor_weight_schema.sql` is the same external schema written for the
real MSSQL instance, including `usp_GetFloorWeightByFarmer` — the SQLite queries
in `src/services/sqlite/floorWeightStore.ts` are deliberately the same SQL, so
pointing this at the real database changes one adapter and nothing else.

Derived figures — the invoice, its totals, the analysis block — are **not**
stored. They are recomputed on read, so re-pricing a grade cannot leave stale
money on an old document.

To start over from the seed, clear the browser's IndexedDB for the site (or run
`indexedDB.deleteDatabase('chulfarm-sqlite')` in the console).

### ใบชั่งน้ำหนัก 2 ใบ และใบรับซื้อ

Weighing produces two slips, and the purchase invoice is built from both:

1. **ใบชั่งน้ำหนักรังไหมสด** — one row per ถุง. ดี/เสีย/แฝด are billed under
   **น้ำหนักรัง**, บาง/ปุยไหม under **น้ำหนักเศษ**; the split lives on the grade.
2. **ใบชั่งน้ำหนักเปลือกรัง** — the sample: จำนวนรังตัวอย่าง · นน.รังรวม ·
   นน.เปลือกรัง · %ความชื้น. %เปลือกรัง is a backend result.

**ใบรับซื้อรังไหมสด** then shows 5 priced rows, รวมน้ำหนัก, **รวมรายได้**, the
analysis block (%เปลือกรัง · %ความชื้น · %เลี้ยงรอด · น้ำหนัก/รัง · น้ำหนัก/กล่อง ·
รายได้/กล่อง), the ปัญหา/แนวทางแก้ไข the backend derived from those figures, the
"+4 บาท/กก. ภายในงวดบัญชี" footnote, and a **Code 128 barcode** for accounting to
scan (`src/components/ui/Barcode.tsx` — a real symbology, drawn as SVG, so the
scan resolves to the transaction number).

Every one of those numbers is computed and checked by the backend; the four
receiving screens only format what they are given (§7.8, §20).

### พิมพ์ใบรับซื้อให้เกษตรกร

Locking the weigh slip is the moment the farmer is owed money, so that is where
the paper comes out. `/receiving/:queueId/receipt` renders the document on its
own — **outside the app shell**, because a receipt printed with a sidebar around
it is not a receipt — and `?print=1` opens the print dialog on load.

The sheet reproduces the company's own printed form line for line — same
header, same five columns (รายการ · น้ำหนักรัง · น้ำหนักเศษ · ราคารังไหม* ·
จำนวนเงิน), the *** วิเคราะห์ปัญหาจากการเลี้ยงไหม *** block under the table,
รวมน้ำหนัก / รวมรายได้ on the baseline, the sample metrics in two columns, the
"+4 บาท/กก." footnote, and the four signatures (ผู้บันทึก · ผู้ตรวจสอบ ·
ผู้จ่ายเงิน · ผู้รับเงิน).

The row wording comes from the backend, not the page — `COCOON_GRADES[].receiptLabel`
carries the form's own names (`รังสดรับซื้อ-ดี(<สายพันธุ์>)`, `ปุยไหม-ตกเกรด (5)`)
so the printed document and the stored line can never drift apart.

The only addition to the form is the **QR code**, in the position the paper
carries one, encoding the transaction number so accounting can scan to trigger
the document check (`src/components/ui/QrCode.tsx` — the module matrix drawn as
SVG, so it prints at the printer's resolution rather than being resampled).

Two copies print, one page each: **ต้นฉบับ (เกษตรกร)** and **สำเนา (ฝ่ายบัญชี)** —
`?copies=1` prints the farmer's sheet alone. The print rules live in
`src/styles/index.css` (`@page` A4, one sheet per copy, forced background colours
so the table rules survive).

### ตัดหนี้ — by round, from the invoice income

A debt is **raised by a booking** and carries its line items, so it always says
what the farmer actually took. It is settled from the **รวมรายได้** of a
ใบรับซื้อ — and only from one of the **same รอบ**:

```
ใบจอง (items)  →  หนี้ของรอบ R5/2569  ◀── ตัดจาก ── ใบรับซื้อ ของรอบ R5/2569
   ยอดรวม = ยอดหนี้ตั้งต้น              เพดาน = min(หนี้คงเหลือ, รวมรายได้ที่ยังไม่ถูกใช้)
```

The server returns the eligible invoices and the ceiling; the page never derives
either. Income already applied is deducted from what an invoice can still pay,
so the same money cannot be spent twice.

### ใบคิว — field reference

Labels and ordering come from the scanned ใบรับรังไหม on the Figma board, not
from guesswork.

**หัวใบคิว:** ชื่อเกษตรกร · รหัสเกษตรกร · สาขา (จุดรับซื้อ) · สายพันธุ์ ·
โครงการ (ประเภทไข่ไหมที่จองไป) · รุ่นฟัก · จำนวนไข่ไหมที่จองไป · แบ่งไหมจาก · ลำดับคิว

**รายละเอียด — หน่วยนับเป็น ถุง:**

| # | Thai label   | Contract field       |
| - | ------------ | -------------------- |
| 1 | รังดี         | `goodCocoonQty`      |
| 2 | รังหลังจ่อ     | `afterScreenQty`     |
| 3 | รังเสีย       | `damagedCocoonQty`   |
| 4 | รังแฝด        | `doubleCocoonQty`    |
| 5 | รังบาง        | `thinCocoonQty`      |
| 6 | ปุยไหม        | `flossQty`           |

**ส่วนท้ายใบคิว:** ตากดักแด้ ☐ แก่ ☐ กลาง (→ `dryingLevel`; a single value, drawn
as square tick-boxes like the paper) · คุณภาพรังไหม ☐ ไหมตาย ☐ ไม่ลอกปุย ·
ความชื้น % · ☐ ประกันราคารังดี 200 บาท/กก. ☐ บรรเทาหนี้ ☐ ไหมจุล-อุ่นใจ

> **Discrepancy vs. spec §6**: the spec writes *รังหลังจอ* and *ตากไหมแก่/กลาง*;
> the actual form reads *รังหลังจ่อ* and *ตากดักแด้*. The form's wording is used.

---

## Two clocks, one calendar

Two things in this codebase have bitten before and are worth stating plainly:

1. **The fixture clock follows the real one.** Seed times are offsets from
   `new Date()`, never a pinned calendar date, and `mockNow()` returns wall-clock
   time. A frozen fixture date means every slip written after the next midnight
   lands on a day nobody is looking at, and the queue silently empties.
   `minutesAgo()` clamps to midnight so the board is still populated at 01:00.

2. **Date filters are local calendar days, timestamps are UTC instants.**
   `<input type="date">` yields a local `YYYY-MM-DD`; records store ISO/UTC. The
   mock's `withinRange()` reduces both sides to a local date before comparing —
   comparing the raw ISO string drops everything recorded before 07:00 in UTC+7,
   which is exactly when a receiving day starts.

## Open items before backend contract lock (§20)

These are deliberately **not** hard-coded. They are exposed as configuration in
**ตั้งค่าระบบ** and flagged “รอยืนยัน” in the UI:

- ถุง → กิโลกรัม conversion for each cocoon grade (`quality.cocoonUnit`)
- Acceptable moisture band (`quality.moistureMin` / `moistureMax`)
- ประกันราคารังดี rate (`program.guaranteedGoodPrice`, currently 200)
- Egg constants behind %เลี้ยงรอด — `analysis.eggWeightPerBoxG` (1.68 g/กล่อง)
  and `analysis.eggsPerGram`. The survival ratio is cocoons produced ÷ cocoons
  the eggs taken at booking should have produced, so both need confirming.
- Analysis thresholds that drive ปัญหา/แนวทางแก้ไข — `analysis.targetShellPercent`
  (20%), `analysis.maxMoisturePercent` (18%), `analysis.targetSurvivalPercent` (75%)
- Purchase prices per grade (`purchase.price.*`) and the น้ำหนัก/รัง threshold
  (`analysis.minWeightPerCocoonG`, 1.7 ก.) are taken from a real ใบรับซื้อ, so they
  are current-as-of-that-document rather than confirmed
  and `purchase.bonusPerKg` (4) — all in the **mock backend only**
  (`src/services/mocks/db.ts → RECEIVING_CONSTANTS`), never in a component
- Real Floor Weight connection — the SQLite database in `db/sqlite/` stands in
  for the plant's MSSQL instance; credentials and network path are still open
- Real scale connection — `src/features/weighing/scaleAdapter.ts` defines the
  interface; only the simulator is wired up
- Real role/approval workflow, and printable PDF templates

---

## Security notes (§14)

- No secret, API key or password in source. The demo password is mock-adapter
  fixture data and disappears when `VITE_USE_MOCK_API=false`.
- Session token is held in memory + `localStorage`; a `401` from anywhere clears
  it once, via a single registered handler.
- Route guards *and* action guards are both applied. Hiding a menu is UX, never
  a security control — **the backend is the final authority**.
- Sensitive farmer fields (national ID, phone) are masked unless the viewer
  holds `farmer:viewSensitive`.
- Uploads are validated for type and size client-side for UX; the backend must
  validate again.
