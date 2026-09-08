-- =====================================================================
-- ChunERP — โครงสร้างฐานข้อมูลหลักของระบบ (PostgreSQL)
--
-- ไฟล์นี้ถูก "สร้างจาก" db/sqlite/chunerp.sql เพื่อไม่ให้สองฉบับหลุดจากกัน
-- ชื่อตาราง คอลัมน์ คีย์ และความสัมพันธ์เหมือนกันทุกตัว ต่างเฉพาะชนิดข้อมูล:
--
--   TEXT (ลงท้าย _at)      → TIMESTAMPTZ   เวลาจริง
--   TEXT (วันปฏิทิน)        → DATE          เช่น booking_date, hatch_date
--   REAL (เงิน/น้ำหนัก)      → NUMERIC(14,2) ไม่ใช้ทศนิยมลอยกับเงิน
--   INTEGER (ธง 0/1)       → BOOLEAN
--   TEXT (JSON)            → JSONB
--
-- สิ่งที่ต้องทำเพิ่มตอนขึ้น PostgreSQL จริง (จงใจไม่ใส่ไว้ที่นี่):
--   • ผู้ใช้/บทบาทของฐานข้อมูล และ GRANT
--   • เลขที่เอกสารแบบ SEQUENCE แทนตาราง document_counter ถ้าต้องการ
--   • คอลัมน์ tenant/company ถ้าจะแยกข้อมูลหลายบริษัท
--   • Row-level security ถ้าจะจำกัดข้อมูลรายสาขาที่ชั้นฐานข้อมูล
--
-- ข้อมูลของระบบชั่งน้ำหนัก (Floor Weight) อยู่คนละฐาน อ่านอย่างเดียว
-- ดู db/mssql/floor_weight_schema.sql
-- =====================================================================

-- =====================================================================
-- 1. ผู้ใช้งานและสิทธิ์
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_user (
  id                    TEXT PRIMARY KEY,
  username              TEXT    NOT NULL UNIQUE,
  display_name          TEXT    NOT NULL,
  email                 TEXT,
  role                  TEXT    NOT NULL,
  branch_id             TEXT    NOT NULL,
  active                BOOLEAN NOT NULL DEFAULT TRUE,
  default_work_type_id  TEXT,
  created_at            TIMESTAMPTZ    NOT NULL,
  updated_at            TIMESTAMPTZ    NOT NULL
);

-- สิทธิ์ตามบทบาท — ค่าตั้งต้นเมื่อสร้างผู้ใช้ใหม่
CREATE TABLE IF NOT EXISTS role_permission (
  role       TEXT NOT NULL,
  permission TEXT NOT NULL,
  PRIMARY KEY (role, permission)
);

-- สิทธิ์รายบุคคล — ผู้ดูแลปรับได้ และต้องคงอยู่ข้ามการเข้าใช้งาน
CREATE TABLE IF NOT EXISTS user_permission (
  user_id    TEXT NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (user_id, permission)
);

CREATE INDEX IF NOT EXISTS ix_user_permission_user ON user_permission (user_id);

-- =====================================================================
-- 2. ข้อมูลหลัก (ทุก dropdown มีตารางของตัวเอง)
-- =====================================================================

CREATE TABLE IF NOT EXISTS branch (
  id         TEXT PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  address    TEXT,
  phone      TEXT,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ    NOT NULL
);

CREATE TABLE IF NOT EXISTS project (
  id          TEXT PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  description TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ    NOT NULL
);

CREATE TABLE IF NOT EXISTS bank (
  id         TEXT PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ    NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_category (
  id         TEXT PRIMARY KEY,
  code       TEXT    NOT NULL UNIQUE,
  name       TEXT    NOT NULL,
  active     BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ    NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_type (
  id          TEXT PRIMARY KEY,
  category_id TEXT    NOT NULL REFERENCES expense_category (id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS ix_expense_type_category ON expense_type (category_id);

-- =====================================================================
-- 3. ข้อมูลหลักสินค้า
-- =====================================================================

CREATE TABLE IF NOT EXISTS product_unit (
  id     TEXT PRIMARY KEY,
  code   TEXT    NOT NULL UNIQUE,
  name   TEXT    NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS warehouse (
  id        TEXT PRIMARY KEY,
  code      TEXT    NOT NULL UNIQUE,
  name      TEXT    NOT NULL,
  branch_id TEXT    NOT NULL REFERENCES branch (id),
  active    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS product (
  id           TEXT PRIMARY KEY,
  code         TEXT    NOT NULL UNIQUE,
  name         TEXT    NOT NULL,
  -- EGG = ไข่ไหม, SUPPLY = วัสดุ, CHEMICAL = เคมีภัณฑ์, EQUIPMENT = อุปกรณ์
  kind         TEXT    NOT NULL,
  unit_id      TEXT    NOT NULL REFERENCES product_unit (id),
  warehouse_id TEXT             REFERENCES warehouse (id),
  breed_id     TEXT,
  description  TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ    NOT NULL,
  updated_at   TIMESTAMPTZ    NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_product_kind ON product (kind, active);

-- ราคามีอายุใช้งาน แถวเดิมถูกปิดด้วย effective_to ไม่ทับของเก่า
-- เพราะเอกสารที่ออกไปแล้วต้องอธิบายได้ว่าใช้ราคาไหน
CREATE TABLE IF NOT EXISTS product_price (
  id             TEXT PRIMARY KEY,
  product_id     TEXT NOT NULL REFERENCES product (id) ON DELETE CASCADE,
  price          NUMERIC(14, 2) NOT NULL CHECK (price >= 0),
  effective_from DATE NOT NULL,
  effective_to   DATE,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL,
  created_by     TEXT
);

CREATE INDEX IF NOT EXISTS ix_product_price_product
  ON product_price (product_id, effective_from DESC);

-- =====================================================================
-- 4. เกษตรกร
-- =====================================================================

CREATE TABLE IF NOT EXISTS farmer (
  id                        TEXT PRIMARY KEY,
  code                      TEXT    NOT NULL UNIQUE,
  first_name                TEXT    NOT NULL,
  last_name                 TEXT    NOT NULL,
  national_id               TEXT,
  phone                     TEXT,
  address                   TEXT,
  sub_district              TEXT,
  district                  TEXT,
  province                  TEXT,
  branch_id                 TEXT    NOT NULL REFERENCES branch (id),
  status                    TEXT    NOT NULL CHECK (status IN ('ACTIVE', 'INACTIVE', 'SUSPENDED')),
  joined_at                 DATE    NOT NULL,
  -- ธงโครงการที่พิมพ์อยู่บนใบรับซื้อ
  program_jul_uam_jai       BOOLEAN NOT NULL DEFAULT FALSE,
  program_debt_relief       BOOLEAN NOT NULL DEFAULT FALSE,
  program_guaranteed_price  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at                TIMESTAMPTZ    NOT NULL,
  updated_at                TIMESTAMPTZ    NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_farmer_branch ON farmer (branch_id, status);

-- =====================================================================
-- 5. ใบจอง → บันทึกส่งของ
-- =====================================================================

CREATE TABLE IF NOT EXISTS booking (
  id                     TEXT PRIMARY KEY,
  booking_no             TEXT    NOT NULL UNIQUE,
  booking_date           DATE    NOT NULL,
  farmer_id              TEXT    NOT NULL REFERENCES farmer (id),
  branch_id              TEXT    NOT NULL REFERENCES branch (id),
  project_id             TEXT             REFERENCES project (id),
  -- รอบการเลี้ยง เกษตรกรหนึ่งคนเปิดได้ครั้งละหนึ่งรอบ
  batch_no               TEXT    NOT NULL,
  hatch_date             DATE,
  expected_delivery_date DATE    NOT NULL,
  remark                 TEXT,
  status                 TEXT    NOT NULL
    CHECK (status IN ('DRAFT', 'CONFIRMED', 'PREPARING', 'DELIVERED', 'CANCELLED')),
  created_at             TIMESTAMPTZ    NOT NULL,
  updated_at             TIMESTAMPTZ    NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_booking_farmer ON booking (farmer_id, status);
CREATE INDEX IF NOT EXISTS ix_booking_batch ON booking (farmer_id, batch_no);

-- ราคาต่อหน่วยถูกคัดลอกมาตอนบันทึก เอกสารจึงไม่เปลี่ยนตามราคาใหม่
CREATE TABLE IF NOT EXISTS booking_item (
  id         TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES booking (id) ON DELETE CASCADE,
  line_no    INTEGER NOT NULL,
  product_id TEXT NOT NULL REFERENCES product (id),
  quantity   NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  UNIQUE (booking_id, product_id)
);

CREATE INDEX IF NOT EXISTS ix_booking_item_booking ON booking_item (booking_id, line_no);

-- การส่งของคือเหตุการณ์ที่ทำให้เกิดหนี้ — หนึ่งใบจอง ส่งได้ครั้งเดียว
CREATE TABLE IF NOT EXISTS booking_delivery (
  booking_id        TEXT PRIMARY KEY REFERENCES booking (id) ON DELETE CASCADE,
  delivered_at      TIMESTAMPTZ NOT NULL,
  delivered_by      TEXT NOT NULL REFERENCES app_user (id),
  delivered_by_name TEXT NOT NULL,
  received_by       TEXT,
  debt_id           TEXT NOT NULL,
  remark            TEXT
);

-- ตั้งหนี้ตามจำนวนที่ส่งจริง ไม่ใช่จำนวนที่จอง
CREATE TABLE IF NOT EXISTS delivery_item (
  id              TEXT PRIMARY KEY,
  booking_id      TEXT NOT NULL REFERENCES booking_delivery (booking_id) ON DELETE CASCADE,
  booking_item_id TEXT NOT NULL,
  product_name    TEXT NOT NULL,
  quantity        NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  unit_name       TEXT NOT NULL,
  unit_price      NUMERIC(14, 2) NOT NULL,
  amount          NUMERIC(14, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_delivery_item_booking ON delivery_item (booking_id);

-- =====================================================================
-- 6. จุดคัดแยก → จุดชั่งน้ำหนัก
-- =====================================================================

-- ใบคิวเป็นเอกสารจริง: เขียนแล้วรีเฟรชหน้าจอ ใบต้องยังอยู่
CREATE TABLE IF NOT EXISTS queue_ticket (
  id                   TEXT PRIMARY KEY,
  queue_no             INTEGER,          -- NULL จนกว่าจะออกใบคิว
  queue_date           DATE    NOT NULL,
  branch_id            TEXT    NOT NULL REFERENCES branch (id),
  branch_name          TEXT    NOT NULL,
  farmer_id            TEXT    NOT NULL REFERENCES farmer (id),
  farmer_code          TEXT    NOT NULL,
  farmer_name          TEXT    NOT NULL,
  booking_id           TEXT             REFERENCES booking (id),
  booking_no           TEXT,
  breed_id             TEXT,
  breed_name           TEXT,
  project_id           TEXT,
  project_name         TEXT,
  hatch_date           DATE,
  split_from_boxes     NUMERIC(14, 2),
  expected_boxes       NUMERIC(14, 2),
  status               TEXT    NOT NULL
    CHECK (status IN ('SORTING', 'WAITING_WEIGH', 'CALLED', 'WEIGHING', 'COMPLETED', 'CANCELLED')),
  arrived_at           TIMESTAMPTZ    NOT NULL,
  issued_at            TIMESTAMPTZ,
  called_at            TIMESTAMPTZ,
  started_weighing_at  TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  counter              TEXT,
  remark               TEXT,
  -- ส่งใบรับซื้อ (ซื้อวัตถุดิบ) ไประบบบัญชีแล้วเมื่อไร
  -- ใบรับซื้อคำนวณสดจากใบคิว + ใบชั่ง ไม่ได้เก็บเป็นตาราง จึงประทับตรานี้ไว้ที่
  -- ใบคิว ซึ่งเป็นแถวเดียวที่ใบรับซื้อหนึ่งใบมีอยู่จริง
  exported_at          TIMESTAMPTZ,
  export_batch_no      TEXT
);

CREATE INDEX IF NOT EXISTS ix_queue_ticket_date ON queue_ticket (queue_date, branch_id);
CREATE INDEX IF NOT EXISTS ix_queue_ticket_export ON queue_ticket (exported_at);
CREATE INDEX IF NOT EXISTS ix_queue_ticket_booking ON queue_ticket (booking_id);

-- ผลคัดแยก (ส่วน detail ของใบคิว) หน่วยนับเป็นถุงตามใบจริง
CREATE TABLE IF NOT EXISTS receiving_quality (
  queue_id               TEXT PRIMARY KEY REFERENCES queue_ticket (id) ON DELETE CASCADE,
  good_cocoon_qty        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  after_screen_qty       NUMERIC(14, 2) NOT NULL DEFAULT 0,
  damaged_cocoon_qty     NUMERIC(14, 2) NOT NULL DEFAULT 0,
  double_cocoon_qty      NUMERIC(14, 2) NOT NULL DEFAULT 0,
  thin_cocoon_qty        NUMERIC(14, 2) NOT NULL DEFAULT 0,
  floss_qty              NUMERIC(14, 2) NOT NULL DEFAULT 0,
  drying_level           TEXT,
  dead_silkworm          BOOLEAN NOT NULL DEFAULT FALSE,
  not_degummed           BOOLEAN NOT NULL DEFAULT FALSE,
  guaranteed_good_price  BOOLEAN NOT NULL DEFAULT FALSE,
  debt_relief            BOOLEAN NOT NULL DEFAULT FALSE,
  jul_uam_jai            BOOLEAN NOT NULL DEFAULT FALSE,
  moisture_percent       NUMERIC(14, 2),
  remark                 TEXT,
  saved_at               TIMESTAMPTZ,
  confirmed              BOOLEAN NOT NULL DEFAULT FALSE
);

-- ใบชั่งน้ำหนักรังไหมสด (ใบที่ 1)
CREATE TABLE IF NOT EXISTS fresh_weigh_slip (
  queue_id           TEXT PRIMARY KEY REFERENCES queue_ticket (id) ON DELETE CASCADE,
  slip_no            TEXT    NOT NULL,
  -- MANUAL = คีย์เอง, SCALE = ดึงจากระบบชั่ง
  source             TEXT    NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'SCALE')),
  locked             BOOLEAN NOT NULL DEFAULT FALSE,
  weighed_at         TIMESTAMPTZ,
  weighed_by         TEXT,
  floor_session_id   BIGINT
);

-- หนึ่งแถวต่อหนึ่งถุง — ยอดรวมไม่เก็บ เพราะคำนวณใหม่ได้เสมอ
CREATE TABLE IF NOT EXISTS weigh_bag (
  id         TEXT PRIMARY KEY,
  queue_id   TEXT    NOT NULL REFERENCES fresh_weigh_slip (queue_id) ON DELETE CASCADE,
  seq        INTEGER NOT NULL,
  grade      TEXT    NOT NULL CHECK (grade IN ('GOOD', 'DAMAGED', 'DOUBLE', 'THIN', 'FLOSS')),
  weight_kg  NUMERIC(14, 2)    NOT NULL CHECK (weight_kg > 0)
);

CREATE INDEX IF NOT EXISTS ix_weigh_bag_queue ON weigh_bag (queue_id, seq);

-- ใบชั่งน้ำหนักเปลือกรัง (ใบที่ 2) — %เปลือกรังคำนวณตอนอ่าน ไม่เก็บซ้ำ
CREATE TABLE IF NOT EXISTS shell_weigh_slip (
  queue_id               TEXT PRIMARY KEY REFERENCES queue_ticket (id) ON DELETE CASCADE,
  slip_no                TEXT    NOT NULL,
  sample_cocoon_count    INTEGER,
  sample_cocoon_weight_g NUMERIC(14, 2),
  shell_weight_g         NUMERIC(14, 2),
  moisture_percent       NUMERIC(14, 2),
  locked                 BOOLEAN NOT NULL DEFAULT FALSE,
  weighed_at             TIMESTAMPTZ,
  weighed_by             TEXT
);

-- ปูมการดึงข้อมูลจากระบบ Floor Weight
-- กัน session เดียวถูกดึงซ้ำเข้าสองคิว: PRIMARY KEY อยู่ที่ session_id
CREATE TABLE IF NOT EXISTS floor_weight_import (
  session_id      BIGINT PRIMARY KEY,
  session_no      TEXT    NOT NULL,
  queue_id        TEXT    NOT NULL REFERENCES queue_ticket (id) ON DELETE CASCADE,
  farmer_code     TEXT    NOT NULL,
  weigh_date      DATE    NOT NULL,
  bag_count       INTEGER NOT NULL,
  total_weight_kg NUMERIC(14, 2)    NOT NULL,
  imported_at     TIMESTAMPTZ    NOT NULL,
  imported_by     TEXT
);

CREATE INDEX IF NOT EXISTS ix_floor_import_queue ON floor_weight_import (queue_id);

-- =====================================================================
-- 7. บัญชีหนี้
-- =====================================================================

CREATE TABLE IF NOT EXISTS debt (
  id                TEXT PRIMARY KEY,
  -- หนี้เกิดจากการส่งของตามใบจอง source_id/source_no ชี้ไปที่ใบจอง
  source_type       TEXT NOT NULL DEFAULT 'BOOKING_DELIVERY',
  source_id         TEXT NOT NULL,
  source_no         TEXT NOT NULL,
  farmer_id         TEXT NOT NULL REFERENCES farmer (id),
  farmer_name       TEXT NOT NULL,
  farmer_code       TEXT NOT NULL,
  branch_id         TEXT NOT NULL REFERENCES branch (id),
  branch_name       TEXT NOT NULL,
  -- รอบ: ตัดหนี้จับคู่กับใบรับซื้อของรอบเดียวกันเท่านั้น
  batch_no          TEXT NOT NULL,
  hatch_date        DATE,
  breed_name        TEXT,
  original_amount   NUMERIC(14, 2) NOT NULL,
  deducted_amount   NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(14, 2) NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('OPEN', 'PARTIAL', 'SETTLED', 'HOLD')),
  remark            TEXT,
  -- ส่งออกไปตั้งหนี้ที่ระบบบัญชี (BPlus) แล้วเมื่อไร และอยู่ในชุดไหน
  -- NULL = ยังไม่ได้ส่ง ป้องกันการส่งซ้ำและใช้กระทบยอดกับฝ่ายบัญชี
  exported_at       TIMESTAMPTZ,
  export_batch_no   TEXT,
  created_at        TIMESTAMPTZ NOT NULL,
  updated_at        TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_debt_farmer_batch ON debt (farmer_id, batch_no);
CREATE INDEX IF NOT EXISTS ix_debt_export ON debt (exported_at);

-- รายการที่เกษตรกรรับไปตอนส่งของ — คือที่มาของยอดหนี้
CREATE TABLE IF NOT EXISTS debt_item (
  id           TEXT PRIMARY KEY,
  debt_id      TEXT NOT NULL REFERENCES debt (id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  quantity     NUMERIC(14, 2) NOT NULL,
  unit_name    TEXT NOT NULL,
  unit_price   NUMERIC(14, 2) NOT NULL,
  amount       NUMERIC(14, 2) NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_debt_item_debt ON debt_item (debt_id);

-- การตัดหนี้แต่ละครั้ง อ้างใบรับซื้อที่นำรวมรายได้มาหัก
CREATE TABLE IF NOT EXISTS debt_deduction (
  id             TEXT PRIMARY KEY,
  debt_id        TEXT NOT NULL REFERENCES debt (id) ON DELETE CASCADE,
  purchase_id    TEXT,
  transaction_no TEXT,
  amount         NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  at             TIMESTAMPTZ NOT NULL,
  actor_name     TEXT NOT NULL,
  remark         TEXT,
  -- ส่งออกไปหักกลบหนี้ที่ระบบบัญชีแล้วเมื่อไร
  exported_at     TIMESTAMPTZ,
  export_batch_no TEXT
);

CREATE INDEX IF NOT EXISTS ix_debt_deduction_debt ON debt_deduction (debt_id);
CREATE INDEX IF NOT EXISTS ix_debt_deduction_export ON debt_deduction (exported_at);
CREATE INDEX IF NOT EXISTS ix_debt_deduction_purchase ON debt_deduction (purchase_id);

-- =====================================================================
-- 7b. จ่ายเงินเกษตรกร
-- =====================================================================

-- หนึ่งแถวต่อหนึ่งใบรับซื้อ: รวมรายได้ − หักหนี้ = ยอดที่ต้องจ่าย
-- ยอดทั้งสามเก็บไว้ด้วยกันเพื่อให้ตอบเกษตรกรได้จากแถวเดียว
CREATE TABLE IF NOT EXISTS farmer_payment (
  id               TEXT PRIMARY KEY,
  payment_no       TEXT    NOT NULL UNIQUE,
  purchase_id      TEXT    NOT NULL UNIQUE,
  transaction_no   TEXT    NOT NULL,
  farmer_id        TEXT    NOT NULL REFERENCES farmer (id),
  farmer_code      TEXT    NOT NULL,
  farmer_name      TEXT    NOT NULL,
  branch_id        TEXT    NOT NULL REFERENCES branch (id),
  branch_name      TEXT    NOT NULL,
  batch_no         TEXT,
  gross_amount     NUMERIC(14, 2)    NOT NULL,
  deducted_amount  NUMERIC(14, 2)    NOT NULL DEFAULT 0,
  net_amount       NUMERIC(14, 2)    NOT NULL,
  status           TEXT    NOT NULL CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
  method           TEXT    CHECK (method IN ('CASH', 'BANK_TRANSFER')),
  paid_date        DATE,
  bank_name        TEXT,
  account_no       TEXT,
  transfer_ref     TEXT,
  remark           TEXT,
  paid_by          TEXT    REFERENCES app_user (id),
  paid_by_name     TEXT,
  created_at       TIMESTAMPTZ    NOT NULL,
  updated_at       TIMESTAMPTZ    NOT NULL,
  -- ส่งออกใบสำคัญจ่ายไประบบบัญชีแล้วเมื่อไร
  exported_at      TIMESTAMPTZ,
  export_batch_no  TEXT
);

CREATE INDEX IF NOT EXISTS ix_farmer_payment_status ON farmer_payment (status, paid_date);
CREATE INDEX IF NOT EXISTS ix_farmer_payment_farmer ON farmer_payment (farmer_id);

-- =====================================================================
-- 8. ค่าใช้จ่าย
-- =====================================================================

CREATE TABLE IF NOT EXISTS expense (
  id               TEXT PRIMARY KEY,
  expense_no       TEXT    NOT NULL UNIQUE,
  expense_date     DATE    NOT NULL,
  branch_id        TEXT    NOT NULL REFERENCES branch (id),
  category_id      TEXT    NOT NULL REFERENCES expense_category (id),
  expense_type_id  TEXT             REFERENCES expense_type (id),
  description      TEXT    NOT NULL,
  vendor           TEXT,
  reference_no     TEXT,
  quantity         NUMERIC(14, 2)    NOT NULL CHECK (quantity > 0),
  unit             TEXT,
  unit_price       NUMERIC(14, 2)    NOT NULL CHECK (unit_price >= 0),
  -- amount = quantity × unit_price คำนวณตอนอ่าน ไม่เก็บซ้ำ
  payment_method   TEXT    NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER')),
  paid_date        DATE,
  bank_name        TEXT,
  account_no       TEXT,
  transfer_date    DATE,
  transfer_ref     TEXT,
  remark           TEXT,
  status           TEXT    NOT NULL
    CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
  created_by       TEXT    NOT NULL REFERENCES app_user (id),
  created_by_name  TEXT    NOT NULL,
  -- ใครปล่อยเงิน และเมื่อไร
  approved_by      TEXT             REFERENCES app_user (id),
  approved_by_name TEXT,
  approved_at      TIMESTAMPTZ,
  rejected_reason  TEXT,
  created_at       TIMESTAMPTZ    NOT NULL,
  updated_at       TIMESTAMPTZ    NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_expense_status ON expense (status, expense_date DESC);
CREATE INDEX IF NOT EXISTS ix_expense_category ON expense (category_id);

CREATE TABLE IF NOT EXISTS expense_attachment (
  id          TEXT PRIMARY KEY,
  expense_id  TEXT    NOT NULL REFERENCES expense (id) ON DELETE CASCADE,
  file_name   TEXT    NOT NULL,
  size_bytes  BIGINT NOT NULL,
  mime_type   TEXT    NOT NULL,
  url         TEXT    NOT NULL,
  uploaded_at TIMESTAMPTZ    NOT NULL,
  uploaded_by TEXT
);

CREATE INDEX IF NOT EXISTS ix_expense_attachment_expense ON expense_attachment (expense_id);

-- =====================================================================
-- 9. ประวัติการใช้งาน และค่าตั้งระบบ
-- =====================================================================

CREATE TABLE IF NOT EXISTS audit_entry (
  id         TEXT PRIMARY KEY,
  at         TIMESTAMPTZ NOT NULL,
  actor_id   TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT NOT NULL,
  reference  TEXT,
  -- ค่าก่อน/หลัง เก็บเป็น JSON เพราะรูปร่างต่างกันไปตามชนิดเอกสาร
  before_json JSONB,
  after_json  JSONB
);

CREATE INDEX IF NOT EXISTS ix_audit_entity ON audit_entry (entity, entity_id);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit_entry (at DESC);

-- ค่าตั้งระบบ เก็บค่าเป็นข้อความ + ชนิด เพื่อให้เพิ่มคีย์ใหม่ได้โดยไม่แก้ schema
CREATE TABLE IF NOT EXISTS app_setting (
  key                  TEXT PRIMARY KEY,
  group_name           TEXT    NOT NULL,
  label                TEXT    NOT NULL,
  description          TEXT,
  value_type           TEXT    NOT NULL CHECK (value_type IN ('text', 'number', 'boolean', 'select')),
  value                INTEGER    NOT NULL,
  options_json         JSONB,
  -- ธง §20: ค่านี้ยังรอยืนยันจากฝ่ายผลิต/บัญชี
  pending_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at           TIMESTAMPTZ    NOT NULL
);

-- =====================================================================
-- 10. การส่งออกไปยังระบบบัญชี (BPlus)
-- =====================================================================

-- หนึ่งแถวต่อการกดส่งออกหนึ่งครั้ง เก็บไว้เพื่อกระทบยอดกับฝ่ายบัญชี
-- และเพื่อให้ส่งซ้ำชุดเดิมได้ถ้าไฟล์หาย
CREATE TABLE IF NOT EXISTS export_batch (
  batch_no     TEXT PRIMARY KEY,
  -- DEBT = ตั้งหนี้ (ลูกหนี้), DEDUCTION = ตัดหนี้ (หักกลบ)
  kind         TEXT    NOT NULL CHECK (kind IN ('DEBT', 'PURCHASE', 'DEDUCTION', 'PAYMENT')),
  target       TEXT    NOT NULL DEFAULT 'BPLUS',
  file_name    TEXT    NOT NULL,
  row_count    INTEGER NOT NULL,
  total_amount NUMERIC(14, 2)    NOT NULL,
  exported_at  TIMESTAMPTZ    NOT NULL,
  exported_by  TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_export_batch_at ON export_batch (exported_at DESC);

-- รุ่นของโครงสร้าง/ชุดข้อมูลตั้งต้นในไฟล์นี้
-- ใช้ตัดสินว่าฐานที่บันทึกไว้ยังใช้ต่อได้ หรือต้องสร้างใหม่ทั้งชุด
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- ตัวนับเลขที่เอกสาร เก็บในฐานเพื่อไม่ให้เลขซ้ำเมื่อรีสตาร์ต
CREATE TABLE IF NOT EXISTS document_counter (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);
