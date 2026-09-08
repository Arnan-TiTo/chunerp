import floorWeightSchema from '../../../db/sqlite/floor_weight.sql?raw'
import type {
  FloorWeightBag,
  FloorWeightQuery,
  FloorWeightSession,
} from '@/types/integration'
import type { CocoonGrade } from '@/types/domain'
import { openDatabase, SEED_VERSION, type SqliteConnection } from './engine'
import { floorWeightSeed } from '@/services/mocks/db'

/**
 * The external Floor Weight Cocoon database.
 *
 * ChunERP only ever SELECTs from here. The queries below are deliberately the
 * ones the real MSSQL stored procedure runs (see
 * `db/mssql/floor_weight_schema.sql`), so the day this becomes a network call
 * the SQL does not have to be reinvented.
 */

export const FLOOR_WEIGHT_DB = 'floorweight'

let conn: SqliteConnection | null = null

export async function openFloorWeightDb(): Promise<SqliteConnection> {
  if (conn) return conn
  conn = await openDatabase(
    FLOOR_WEIGHT_DB,
    (db) => db.exec(floorWeightSchema),
    (db) => {
      seed(db)
      db.run(`INSERT OR REPLACE INTO FloorWeightMeta (key, value) VALUES ('seed_version', ?)`, [
        SEED_VERSION,
      ])
    },
    // The weighings belong to the farmers in the other database, so the two
    // have to be rebuilt together or the codes stop matching.
    (db) =>
      db.one<{ value: string }>(
        `SELECT value FROM FloorWeightMeta WHERE key = 'seed_version'`,
      )?.value === SEED_VERSION,
  )
  return conn
}

/** The open connection, for callers that need the file rather than the rows. */
export function floorWeightConnection(): SqliteConnection {
  return db()
}

function db(): SqliteConnection {
  if (!conn) throw new Error('Floor Weight database is not open')
  return conn
}

/* ── Seed ───────────────────────────────────────────────────────────────── */

function seed(target: SqliteConnection) {
  for (const session of floorWeightSeed) {
    target.run(
      `INSERT INTO FloorWeightSession
         (SessionId, SessionNo, FarmerCode, FarmerName, BranchCode, StationCode, ScaleNo,
          WeighDate, StartedAt, FinishedAt, OperatorName, Status, TotalBags, TotalWeightKg, CreatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.sessionId,
        session.sessionNo,
        session.farmerCode,
        session.farmerName ?? null,
        session.branchCode,
        session.stationCode,
        session.scaleNo ?? null,
        session.weighDate,
        session.startedAt,
        session.finishedAt ?? null,
        session.operatorName ?? null,
        session.status,
        session.totalBags,
        session.totalWeightKg,
        session.startedAt,
      ],
    )

    for (const bag of session.bags) {
      target.run(
        `INSERT INTO FloorWeightDetail
           (DetailId, SessionId, BagNo, GradeCode, WeightKg, ReadSource, WeighedAt, IsVoid)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          bag.detailId,
          session.sessionId,
          bag.bagNo,
          bag.gradeCode,
          bag.weightKg,
          bag.readSource,
          bag.weighedAt,
        ],
      )
    }

    const sample = session.shellSample
    if (sample) {
      target.run(
        `INSERT INTO FloorWeightShellSample
           (SampleId, SessionId, CocoonCount, CocoonWeightG, ShellWeightG, MoisturePercent, SampledAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          session.sessionId,
          session.sessionId,
          sample.cocoonCount,
          sample.cocoonWeightG,
          sample.shellWeightG,
          sample.moisturePercent,
          sample.sampledAt ?? null,
        ],
      )
    }
  }
}

/* ── Queries — the pull contract ────────────────────────────────────────── */

interface SessionRow {
  SessionId: number
  SessionNo: string
  FarmerCode: string
  FarmerName: string | null
  BranchCode: string
  StationCode: string
  ScaleNo: string | null
  WeighDate: string
  StartedAt: string
  FinishedAt: string | null
  OperatorName: string | null
  Status: 'OPEN' | 'CLOSED'
  TotalBags: number
  TotalWeightKg: number
}

interface DetailRow {
  DetailId: number
  SessionId: number
  BagNo: number
  GradeCode: string
  GradeName: string
  ErpGrade: string
  WeightGroup: 'COCOON' | 'SCRAP'
  WeightKg: number
  ReadSource: 'MANUAL' | 'SCALE'
  WeighedAt: string
}

interface SampleRow {
  SessionId: number
  CocoonCount: number | null
  CocoonWeightG: number | null
  ShellWeightG: number | null
  MoisturePercent: number | null
  SampledAt: string | null
}

/** วันที่ชั่งล่าสุดของเกษตรกรรายนี้ที่ปิดใบชั่งแล้ว. */
export function latestWeighDate(farmerCode: string): string | null {
  const row = db().one<{ WeighDate: string | null }>(
    `SELECT MAX(WeighDate) AS WeighDate
       FROM FloorWeightSession
      WHERE FarmerCode = ? AND Status = 'CLOSED'`,
    [farmerCode],
  )
  return row?.WeighDate ?? null
}

/**
 * The equivalent of `usp_GetFloorWeightByFarmer`: filter by รหัสเกษตรกร and
 * วันที่ชั่ง, defaulting to the farmer's latest closed weigh date.
 *
 * Only CLOSED sessions are returned — a slip still being weighed is not ours to
 * import, and pulling it half-finished would silently under-report the load.
 */
export function findSessions({ farmerCode, weighDate }: FloorWeightQuery): FloorWeightSession[] {
  const date = weighDate ?? latestWeighDate(farmerCode)
  if (!date) return []

  const sessions = db().all<SessionRow>(
    `SELECT SessionId, SessionNo, FarmerCode, FarmerName, BranchCode, StationCode, ScaleNo,
            WeighDate, StartedAt, FinishedAt, OperatorName, Status, TotalBags, TotalWeightKg
       FROM FloorWeightSession
      WHERE FarmerCode = ? AND WeighDate = ? AND Status = 'CLOSED'
      ORDER BY WeighDate DESC, StartedAt DESC`,
    [farmerCode, date],
  )
  if (sessions.length === 0) return []

  const ids = sessions.map((s) => s.SessionId)
  const placeholders = ids.map(() => '?').join(', ')

  const details = db().all<DetailRow>(
    `SELECT d.DetailId, d.SessionId, d.BagNo, d.GradeCode, g.GradeName, g.ErpGrade,
            g.WeightGroup, d.WeightKg, d.ReadSource, d.WeighedAt
       FROM FloorWeightDetail AS d
       JOIN FloorWeightGrade  AS g ON g.GradeCode = d.GradeCode
      WHERE d.SessionId IN (${placeholders}) AND d.IsVoid = 0
      ORDER BY d.SessionId, d.BagNo`,
    ids,
  )

  const samples = db().all<SampleRow>(
    `SELECT SessionId, CocoonCount, CocoonWeightG, ShellWeightG, MoisturePercent, SampledAt
       FROM FloorWeightShellSample
      WHERE SessionId IN (${placeholders})`,
    ids,
  )

  return sessions.map((row) => ({
    sessionId: row.SessionId,
    sessionNo: row.SessionNo,
    farmerCode: row.FarmerCode,
    farmerName: row.FarmerName ?? undefined,
    branchCode: row.BranchCode,
    stationCode: row.StationCode,
    scaleNo: row.ScaleNo ?? undefined,
    weighDate: row.WeighDate,
    startedAt: row.StartedAt,
    finishedAt: row.FinishedAt ?? undefined,
    operatorName: row.OperatorName ?? undefined,
    status: row.Status,
    totalBags: row.TotalBags,
    totalWeightKg: row.TotalWeightKg,
    bags: details
      .filter((d) => d.SessionId === row.SessionId)
      .map<FloorWeightBag>((d) => ({
        detailId: d.DetailId,
        bagNo: d.BagNo,
        gradeCode: d.GradeCode,
        gradeName: d.GradeName,
        erpGrade: d.ErpGrade as CocoonGrade,
        weightGroup: d.WeightGroup,
        weightKg: d.WeightKg,
        readSource: d.ReadSource,
        weighedAt: d.WeighedAt,
      })),
    shellSample: samples
      .filter((sample) => sample.SessionId === row.SessionId)
      .map((sample) => ({
        cocoonCount: sample.CocoonCount,
        cocoonWeightG: sample.CocoonWeightG,
        shellWeightG: sample.ShellWeightG,
        moisturePercent: sample.MoisturePercent,
        sampledAt: sample.SampledAt ?? undefined,
      }))[0],
  }))
}

export function getSession(sessionId: number): FloorWeightSession | null {
  const row = db().one<{ FarmerCode: string; WeighDate: string }>(
    `SELECT FarmerCode, WeighDate FROM FloorWeightSession WHERE SessionId = ?`,
    [sessionId],
  )
  if (!row) return null
  return (
    findSessions({ farmerCode: row.FarmerCode, weighDate: row.WeighDate }).find(
      (s) => s.sessionId === sessionId,
    ) ?? null
  )
}

export function closedSessionCount(): number {
  return (
    db().one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM FloorWeightSession WHERE Status = 'CLOSED'`,
    )?.n ?? 0
  )
}
