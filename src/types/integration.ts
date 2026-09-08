import type { CocoonGrade } from './domain'

/**
 * Floor Weight Cocoon — the external scale system at จุดชั่งน้ำหนัก.
 *
 * These shapes mirror the rows of the external database one for one, including
 * its own grade codes. Mapping them onto our domain is the integration's job
 * and happens in exactly one place, so the day the source becomes MSSQL only
 * the adapter changes.
 */

export interface FloorWeightBag {
  detailId: number
  bagNo: number
  /** The scale system's own code, kept so a row can be traced back. */
  gradeCode: string
  gradeName: string
  /** Mapped through the external system's own grade master. */
  erpGrade: CocoonGrade
  weightGroup: 'COCOON' | 'SCRAP'
  weightKg: number
  readSource: 'MANUAL' | 'SCALE'
  weighedAt: string
}

export interface FloorWeightShellSample {
  cocoonCount: number | null
  cocoonWeightG: number | null
  shellWeightG: number | null
  moisturePercent: number | null
  sampledAt?: string
}

export interface FloorWeightSession {
  sessionId: number
  sessionNo: string
  farmerCode: string
  farmerName?: string
  branchCode: string
  stationCode: string
  scaleNo?: string
  /** วันที่ชั่ง — one half of the pull filter. */
  weighDate: string
  startedAt: string
  finishedAt?: string
  operatorName?: string
  status: 'OPEN' | 'CLOSED'
  totalBags: number
  totalWeightKg: number
  bags: FloorWeightBag[]
  shellSample?: FloorWeightShellSample
  /** Set from ChunERP's own import log, never from the external system. */
  importedQueueId?: string
  importedAt?: string
}

/** รหัสเกษตรกร + วันที่ชั่ง — omitting the date means "the latest weigh date". */
export interface FloorWeightQuery {
  farmerCode: string
  weighDate?: string
}

export interface IntegrationStatus {
  connected: boolean
  /** Human label of the source system, e.g. "Floor Weight Cocoon (SQLite)". */
  source: string
  database: string
  /** Rows visible through the link right now. */
  sessionCount: number
  lastCheckedAt: string
}
