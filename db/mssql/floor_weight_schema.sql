/* =====================================================================
   Floor Weight Cocoon — external weighing system (MSSQL)

   จุดชั่งน้ำหนักไม่ได้อยู่ในระบบนี้: เครื่องชั่งพื้น (Floor Weight) ชั่งรังไหม
   ทีละถุงแล้วบันทึกลง MSSQL ของตัวเอง ระบบ ChunERP ทำหน้าที่ "ดึง" ข้อมูล
   มาออกใบรับซื้อรังไหมสดต่อ — ไม่เขียนกลับ

   สคริปต์นี้เป็น mockup ของฝั่ง Floor Weight ใช้เพื่อ
     1. เป็นสัญญาโครงสร้างข้อมูล (contract) ให้ทีม backend ทำ integration จริง
     2. สร้างข้อมูลตัวอย่างให้ทดสอบการดึงข้อมูลได้

   การกรองข้อมูล: ระบบดึงด้วย "รหัสเกษตรกร" + "วันที่ชั่งล่าสุด"
     EXEC dbo.usp_GetFloorWeightByFarmer @FarmerCode = 'FM-00123'
     EXEC dbo.usp_GetFloorWeightByFarmer @FarmerCode = 'FM-00123', @WeighDate = '2569-09-07'

   หมายเหตุวันที่: คอลัมน์วันที่ทั้งหมดเก็บเป็น ค.ศ. (DATE / DATETIME2)
   การแปลงเป็น พ.ศ. เป็นหน้าที่ของชั้นแสดงผล
   ===================================================================== */

IF DB_ID('FloorWeightCocoon') IS NULL
    CREATE DATABASE FloorWeightCocoon;
GO

USE FloorWeightCocoon;
GO

/* ── Master: ชั้นคุณภาพที่เครื่องชั่งรู้จัก ────────────────────────────── */

IF OBJECT_ID('dbo.FloorWeightGrade', 'U') IS NOT NULL DROP TABLE dbo.FloorWeightGrade;
GO
CREATE TABLE dbo.FloorWeightGrade
(
    GradeCode   VARCHAR(4)   NOT NULL CONSTRAINT PK_FloorWeightGrade PRIMARY KEY,
    GradeName   NVARCHAR(60) NOT NULL,
    /* รหัสฝั่ง ChunERP — integration ใช้คอลัมน์นี้ map ค่า ไม่ hard-code ในโค้ด */
    ErpGrade    VARCHAR(16)  NOT NULL,
    /* COCOON = คิดเป็นน้ำหนักรัง, SCRAP = คิดเป็นน้ำหนักเศษ */
    WeightGroup VARCHAR(8)   NOT NULL,
    SortOrder   INT          NOT NULL,
    IsActive    BIT          NOT NULL CONSTRAINT DF_FloorWeightGrade_Active DEFAULT (1)
);
GO

INSERT INTO dbo.FloorWeightGrade (GradeCode, GradeName, ErpGrade, WeightGroup, SortOrder)
VALUES ('01', N'รังดี',   'GOOD',    'COCOON', 1),
       ('02', N'รังเสีย',  'DAMAGED', 'COCOON', 2),
       ('03', N'รังแฝด',   'DOUBLE',  'COCOON', 3),
       ('04', N'รังบาง',   'THIN',    'SCRAP',  4),
       ('05', N'ปุยไหม',   'FLOSS',   'SCRAP',  5);
GO

/* ── Header: หนึ่งครั้งที่เกษตรกรมาชั่ง ────────────────────────────────── */

IF OBJECT_ID('dbo.FloorWeightSession', 'U') IS NOT NULL DROP TABLE dbo.FloorWeightSession;
GO
CREATE TABLE dbo.FloorWeightSession
(
    SessionId     BIGINT        NOT NULL CONSTRAINT PK_FloorWeightSession PRIMARY KEY,
    /* เลขที่ใบชั่งของเครื่อง — ใช้อ้างอิงกลับเมื่อมีข้อโต้แย้ง */
    SessionNo     VARCHAR(30)   NOT NULL,
    /* คีย์หลักที่ ChunERP ใช้กรอง */
    FarmerCode    VARCHAR(20)   NOT NULL,
    FarmerName    NVARCHAR(120) NULL,
    BranchCode    VARCHAR(20)   NOT NULL,
    StationCode   VARCHAR(20)   NOT NULL,
    ScaleNo       VARCHAR(20)   NULL,
    /* คีย์หลักที่ ChunERP ใช้กรอง — ชั่งวันไหน */
    WeighDate     DATE          NOT NULL,
    StartedAt     DATETIME2(0)  NOT NULL,
    FinishedAt    DATETIME2(0)  NULL,
    OperatorName  NVARCHAR(120) NULL,
    /* OPEN = ยังชั่งอยู่, CLOSED = ปิดใบชั่งแล้ว (ดึงได้เฉพาะที่ปิดแล้ว) */
    Status        VARCHAR(10)   NOT NULL CONSTRAINT DF_FWS_Status DEFAULT ('OPEN'),
    TotalBags     INT           NOT NULL CONSTRAINT DF_FWS_Bags DEFAULT (0),
    TotalWeightKg DECIMAL(12,2) NOT NULL CONSTRAINT DF_FWS_Weight DEFAULT (0),
    CreatedAt     DATETIME2(0)  NOT NULL CONSTRAINT DF_FWS_Created DEFAULT (SYSDATETIME()),
    UpdatedAt     DATETIME2(0)  NULL
);
GO

/* กรองด้วย FarmerCode + WeighDate เป็นเส้นทางหลัก จึงทำ index ให้ตรงรูป */
CREATE INDEX IX_FloorWeightSession_Farmer_Date
    ON dbo.FloorWeightSession (FarmerCode, WeighDate DESC)
    INCLUDE (SessionNo, Status, TotalBags, TotalWeightKg);
GO

/* ── Detail: หนึ่งแถวต่อหนึ่งถุงที่วางบนเครื่องชั่ง ───────────────────── */

IF OBJECT_ID('dbo.FloorWeightDetail', 'U') IS NOT NULL DROP TABLE dbo.FloorWeightDetail;
GO
CREATE TABLE dbo.FloorWeightDetail
(
    DetailId   BIGINT        NOT NULL CONSTRAINT PK_FloorWeightDetail PRIMARY KEY,
    SessionId  BIGINT        NOT NULL
        CONSTRAINT FK_FloorWeightDetail_Session REFERENCES dbo.FloorWeightSession (SessionId),
    BagNo      INT           NOT NULL,
    GradeCode  VARCHAR(4)    NOT NULL
        CONSTRAINT FK_FloorWeightDetail_Grade REFERENCES dbo.FloorWeightGrade (GradeCode),
    WeightKg   DECIMAL(10,2) NOT NULL,
    /* MANUAL = พนักงานคีย์, SCALE = อ่านจากหัวชั่งอัตโนมัติ */
    ReadSource VARCHAR(10)   NOT NULL CONSTRAINT DF_FWD_Source DEFAULT ('SCALE'),
    WeighedAt  DATETIME2(0)  NOT NULL,
    IsVoid     BIT           NOT NULL CONSTRAINT DF_FWD_Void DEFAULT (0),
    CONSTRAINT UQ_FloorWeightDetail_Bag UNIQUE (SessionId, BagNo),
    CONSTRAINT CK_FloorWeightDetail_Weight CHECK (WeightKg > 0)
);
GO

CREATE INDEX IX_FloorWeightDetail_Session ON dbo.FloorWeightDetail (SessionId, BagNo);
GO

/* ── ตัวอย่างเปลือกรัง — เครื่องชั่งละเอียดคนละหัวกับเครื่องชั่งพื้น ──── */

IF OBJECT_ID('dbo.FloorWeightShellSample', 'U') IS NOT NULL DROP TABLE dbo.FloorWeightShellSample;
GO
CREATE TABLE dbo.FloorWeightShellSample
(
    SampleId        BIGINT        NOT NULL CONSTRAINT PK_FloorWeightShellSample PRIMARY KEY,
    SessionId       BIGINT        NOT NULL
        CONSTRAINT FK_FloorWeightShell_Session REFERENCES dbo.FloorWeightSession (SessionId),
    CocoonCount     INT           NULL,   -- จำนวนรังตัวอย่าง
    CocoonWeightG   DECIMAL(10,2) NULL,   -- นน.รังรวม (กรัม)
    ShellWeightG    DECIMAL(10,2) NULL,   -- นน.เปลือกรัง (กรัม)
    MoisturePercent DECIMAL(5,2)  NULL,   -- %ความชื้น
    SampledAt       DATETIME2(0)  NULL,
    CONSTRAINT UQ_FloorWeightShell_Session UNIQUE (SessionId)
);
GO

/* ── สัญญาการดึงข้อมูล ────────────────────────────────────────────────

   ChunERP เรียกผ่าน stored procedure ตัวเดียว ไม่ query ตารางตรง เพื่อให้
   ฝั่ง Floor Weight เปลี่ยนโครงสร้างภายในได้โดยไม่กระทบ integration

   @WeighDate = NULL หมายถึง "เอาวันที่ชั่งล่าสุดของเกษตรกรรายนี้"
   ------------------------------------------------------------------- */

IF OBJECT_ID('dbo.usp_GetFloorWeightByFarmer', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_GetFloorWeightByFarmer;
GO

CREATE PROCEDURE dbo.usp_GetFloorWeightByFarmer
    @FarmerCode VARCHAR(20),
    @WeighDate  DATE = NULL
AS
BEGIN
    SET NOCOUNT ON;

    /* ไม่ระบุวันที่ = วันที่ชั่งล่าสุดที่ปิดใบแล้วของเกษตรกรรายนี้ */
    IF @WeighDate IS NULL
        SELECT @WeighDate = MAX(WeighDate)
        FROM dbo.FloorWeightSession
        WHERE FarmerCode = @FarmerCode
          AND Status = 'CLOSED';

    /* 1) หัวใบชั่ง */
    SELECT s.SessionId,
           s.SessionNo,
           s.FarmerCode,
           s.FarmerName,
           s.BranchCode,
           s.StationCode,
           s.ScaleNo,
           s.WeighDate,
           s.StartedAt,
           s.FinishedAt,
           s.OperatorName,
           s.Status,
           s.TotalBags,
           s.TotalWeightKg
    FROM dbo.FloorWeightSession AS s
    WHERE s.FarmerCode = @FarmerCode
      AND (@WeighDate IS NULL OR s.WeighDate = @WeighDate)
      AND s.Status = 'CLOSED'
    ORDER BY s.WeighDate DESC, s.StartedAt DESC;

    /* 2) รายการถุง พร้อมรหัสชั้นคุณภาพฝั่ง ERP */
    SELECT d.DetailId,
           d.SessionId,
           d.BagNo,
           d.GradeCode,
           g.GradeName,
           g.ErpGrade,
           g.WeightGroup,
           d.WeightKg,
           d.ReadSource,
           d.WeighedAt
    FROM dbo.FloorWeightDetail AS d
        INNER JOIN dbo.FloorWeightSession AS s ON s.SessionId = d.SessionId
        INNER JOIN dbo.FloorWeightGrade   AS g ON g.GradeCode = d.GradeCode
    WHERE s.FarmerCode = @FarmerCode
      AND (@WeighDate IS NULL OR s.WeighDate = @WeighDate)
      AND s.Status = 'CLOSED'
      AND d.IsVoid = 0
    ORDER BY d.SessionId, d.BagNo;

    /* 3) ตัวอย่างเปลือกรัง */
    SELECT p.SampleId,
           p.SessionId,
           p.CocoonCount,
           p.CocoonWeightG,
           p.ShellWeightG,
           p.MoisturePercent,
           p.SampledAt
    FROM dbo.FloorWeightShellSample AS p
        INNER JOIN dbo.FloorWeightSession AS s ON s.SessionId = p.SessionId
    WHERE s.FarmerCode = @FarmerCode
      AND (@WeighDate IS NULL OR s.WeighDate = @WeighDate)
      AND s.Status = 'CLOSED';
END;
GO

/* ── Mockup data ──────────────────────────────────────────────────────

   ข้อมูลตัวอย่าง 3 ใบชั่ง สำหรับเกษตรกร 2 ราย รวมกรณีที่ต้องรองรับ:
     • เกษตรกรที่มีหลายรอบ (ต้องเลือกวันที่ชั่งล่าสุด)
     • ใบชั่งที่ยังไม่ปิด (ต้องไม่ถูกดึงมา)
     • ถุงที่ถูกยกเลิก IsVoid = 1 (ต้องไม่ถูกนับ)
   ------------------------------------------------------------------- */

INSERT INTO dbo.FloorWeightSession
    (SessionId, SessionNo, FarmerCode, FarmerName, BranchCode, StationCode, ScaleNo,
     WeighDate, StartedAt, FinishedAt, OperatorName, Status, TotalBags, TotalWeightKg)
VALUES
    (100001, 'FW-2569-000101', 'FM-00123', N'สมชาย ทองอินทร์', 'BR-KPP', 'ST-01', 'SCALE-A',
     '2026-09-07', '2026-09-07T08:12:00', '2026-09-07T08:41:00', N'อรุณี ดวงแก้ว', 'CLOSED', 13, 31.10),
    (100002, 'FW-2569-000102', 'FM-00123', N'สมชาย ทองอินทร์', 'BR-KPP', 'ST-01', 'SCALE-A',
     '2026-08-02', '2026-08-02T09:05:00', '2026-08-02T09:33:00', N'อรุณี ดวงแก้ว', 'CLOSED', 3, 7.30),
    (100003, 'FW-2569-000103', 'FM-00456', N'บุญมี ศรีสุข',     'BR-KPP', 'ST-02', 'SCALE-B',
     '2026-09-07', '2026-09-07T10:20:00', NULL, N'ประเสริฐ ใจดี', 'OPEN', 2, 5.10);
GO

INSERT INTO dbo.FloorWeightDetail (DetailId, SessionId, BagNo, GradeCode, WeightKg, ReadSource, WeighedAt, IsVoid)
VALUES
    -- ใบชั่ง 100001: 11 ถุงรังดี + รังเสีย + รังบาง (และ 1 ถุงที่ยกเลิก)
    (1, 100001,  1, '01', 2.45, 'SCALE', '2026-09-07T08:14:00', 0),
    (2, 100001,  2, '01', 2.62, 'SCALE', '2026-09-07T08:15:00', 0),
    (3, 100001,  3, '01', 2.38, 'SCALE', '2026-09-07T08:17:00', 0),
    (4, 100001,  4, '01', 2.71, 'SCALE', '2026-09-07T08:18:00', 0),
    (5, 100001,  5, '01', 2.55, 'SCALE', '2026-09-07T08:20:00', 0),
    (6, 100001,  6, '01', 2.49, 'SCALE', '2026-09-07T08:22:00', 0),
    (7, 100001,  7, '01', 2.83, 'SCALE', '2026-09-07T08:24:00', 0),
    (8, 100001,  8, '01', 2.34, 'SCALE', '2026-09-07T08:26:00', 0),
    (9, 100001,  9, '01', 2.60, 'SCALE', '2026-09-07T08:28:00', 0),
    (10, 100001, 10, '01', 2.47, 'SCALE', '2026-09-07T08:30:00', 0),
    (11, 100001, 11, '02', 1.28, 'SCALE', '2026-09-07T08:33:00', 0),
    (12, 100001, 12, '03', 0.94, 'SCALE', '2026-09-07T08:35:00', 0),
    (13, 100001, 13, '04', 0.72, 'MANUAL', '2026-09-07T08:37:00', 0),
    (14, 100001, 14, '01', 2.50, 'SCALE', '2026-09-07T08:39:00', 1),  -- ยกเลิก: วางถุงซ้ำ
    -- ใบชั่ง 100002: รอบก่อนหน้าของเกษตรกรรายเดียวกัน
    (20, 100002, 1, '01', 3.10, 'SCALE', '2026-08-02T09:08:00', 0),
    (21, 100002, 2, '01', 2.95, 'SCALE', '2026-08-02T09:12:00', 0),
    (22, 100002, 3, '05', 1.25, 'MANUAL', '2026-08-02T09:18:00', 0),
    -- ใบชั่ง 100003: ยังไม่ปิดใบ
    (30, 100003, 1, '01', 2.60, 'SCALE', '2026-09-07T10:22:00', 0),
    (31, 100003, 2, '01', 2.50, 'SCALE', '2026-09-07T10:25:00', 0);
GO

INSERT INTO dbo.FloorWeightShellSample
    (SampleId, SessionId, CocoonCount, CocoonWeightG, ShellWeightG, MoisturePercent, SampledAt)
VALUES
    (1, 100001, 25, 42.00, 8.20, 14.60, '2026-09-07T08:45:00'),
    (2, 100002, 22, 37.40, 6.90, 17.20, '2026-08-02T09:36:00');
GO

/* ตรวจสอบ: ควรได้ใบชั่ง 100001 (วันที่ชั่งล่าสุดที่ปิดแล้ว) 13 ถุง 31.10 กก. */
EXEC dbo.usp_GetFloorWeightByFarmer @FarmerCode = 'FM-00123';
GO
