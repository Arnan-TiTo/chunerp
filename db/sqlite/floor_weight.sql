-- =====================================================================
-- Floor Weight Cocoon — external weighing system (SQLite stand-in)
--
-- จุดชั่งน้ำหนักไม่ได้อยู่ในระบบ ChunERP: เครื่องชั่งพื้น (Floor Weight)
-- ชั่งรังไหมทีละถุงแล้วบันทึกลงฐานข้อมูลของตัวเอง ระบบเราทำหน้าที่ "ดึง"
-- ข้อมูลมาออกใบรับซื้อรังไหมสดต่อ — อ่านอย่างเดียว ไม่เขียนกลับ
--
-- ของจริงเป็น MSSQL (โครงสร้างเดียวกัน ดู db/mssql/floor_weight_schema.sql)
-- ระหว่างยังไม่มีเซิร์ฟเวอร์ ใช้ SQLite เก็บแทน
--
-- การกรอง: รหัสเกษตรกร + วันที่ชั่งล่าสุด
-- =====================================================================

PRAGMA foreign_keys = ON;

-- ── Master: ชั้นคุณภาพที่เครื่องชั่งรู้จัก ──────────────────────────────
CREATE TABLE IF NOT EXISTS FloorWeightGrade (
  GradeCode   TEXT PRIMARY KEY,
  GradeName   TEXT    NOT NULL,
  -- รหัสฝั่ง ChunERP — integration map ผ่านคอลัมน์นี้ ไม่ hard-code ในโค้ด
  ErpGrade    TEXT    NOT NULL,
  -- COCOON = คิดเป็นน้ำหนักรัง, SCRAP = คิดเป็นน้ำหนักเศษ
  WeightGroup TEXT    NOT NULL CHECK (WeightGroup IN ('COCOON', 'SCRAP')),
  SortOrder   INTEGER NOT NULL,
  IsActive    INTEGER NOT NULL DEFAULT 1
);

-- ── Header: หนึ่งครั้งที่เกษตรกรมาชั่ง ──────────────────────────────────
CREATE TABLE IF NOT EXISTS FloorWeightSession (
  SessionId     INTEGER PRIMARY KEY,
  SessionNo     TEXT    NOT NULL UNIQUE,
  -- คีย์หลักที่ ChunERP ใช้กรอง
  FarmerCode    TEXT    NOT NULL,
  FarmerName    TEXT,
  BranchCode    TEXT    NOT NULL,
  StationCode   TEXT    NOT NULL,
  ScaleNo       TEXT,
  -- คีย์หลักที่ ChunERP ใช้กรอง — ชั่งวันไหน (YYYY-MM-DD)
  WeighDate     TEXT    NOT NULL,
  StartedAt     TEXT    NOT NULL,
  FinishedAt    TEXT,
  OperatorName  TEXT,
  -- OPEN = ยังชั่งอยู่, CLOSED = ปิดใบชั่งแล้ว (ดึงได้เฉพาะที่ปิดแล้ว)
  Status        TEXT    NOT NULL DEFAULT 'OPEN' CHECK (Status IN ('OPEN', 'CLOSED')),
  TotalBags     INTEGER NOT NULL DEFAULT 0,
  TotalWeightKg REAL    NOT NULL DEFAULT 0,
  CreatedAt     TEXT    NOT NULL,
  UpdatedAt     TEXT
);

-- กรองด้วย FarmerCode + WeighDate เป็นเส้นทางหลัก จึงทำ index ให้ตรงรูป
CREATE INDEX IF NOT EXISTS IX_FloorWeightSession_Farmer_Date
  ON FloorWeightSession (FarmerCode, WeighDate DESC);

-- ── Detail: หนึ่งแถวต่อหนึ่งถุงที่วางบนเครื่องชั่ง ─────────────────────
CREATE TABLE IF NOT EXISTS FloorWeightDetail (
  DetailId   INTEGER PRIMARY KEY,
  SessionId  INTEGER NOT NULL REFERENCES FloorWeightSession (SessionId),
  BagNo      INTEGER NOT NULL,
  GradeCode  TEXT    NOT NULL REFERENCES FloorWeightGrade (GradeCode),
  WeightKg   REAL    NOT NULL CHECK (WeightKg > 0),
  -- MANUAL = พนักงานคีย์, SCALE = อ่านจากหัวชั่งอัตโนมัติ
  ReadSource TEXT    NOT NULL DEFAULT 'SCALE' CHECK (ReadSource IN ('MANUAL', 'SCALE')),
  WeighedAt  TEXT    NOT NULL,
  IsVoid     INTEGER NOT NULL DEFAULT 0,
  UNIQUE (SessionId, BagNo)
);

CREATE INDEX IF NOT EXISTS IX_FloorWeightDetail_Session
  ON FloorWeightDetail (SessionId, BagNo);

-- ── ตัวอย่างเปลือกรัง — เครื่องชั่งละเอียด คนละหัวกับเครื่องชั่งพื้น ───
CREATE TABLE IF NOT EXISTS FloorWeightShellSample (
  SampleId        INTEGER PRIMARY KEY,
  SessionId       INTEGER NOT NULL UNIQUE REFERENCES FloorWeightSession (SessionId),
  CocoonCount     INTEGER,   -- จำนวนรังตัวอย่าง
  CocoonWeightG   REAL,      -- นน.รังรวม (กรัม)
  ShellWeightG    REAL,      -- นน.เปลือกรัง (กรัม)
  MoisturePercent REAL,      -- %ความชื้น
  SampledAt       TEXT
);

-- รุ่นของชุดข้อมูลตั้งต้น ใช้ตัดสินว่าต้องสร้างใหม่พร้อมฐานหลักหรือไม่
CREATE TABLE IF NOT EXISTS FloorWeightMeta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO FloorWeightGrade (GradeCode, GradeName, ErpGrade, WeightGroup, SortOrder)
VALUES ('01', 'รังดี',  'GOOD',    'COCOON', 1),
       ('02', 'รังเสีย', 'DAMAGED', 'COCOON', 2),
       ('03', 'รังแฝด',  'DOUBLE',  'COCOON', 3),
       ('04', 'รังบาง',  'THIN',    'SCRAP',  4),
       ('05', 'ปุยไหม',  'FLOSS',   'SCRAP',  5);
