import type { Services } from './api/contracts'
import { httpServices } from './adapters/httpAdapter'
import { mockServices } from './mocks/mockAdapter'
import { ensureSqlite } from './sqlite/bootstrap'

/**
 * Adapter selection. `VITE_USE_MOCK_API=false` (plus a real
 * `VITE_API_BASE_URL`) switches every feature to the HTTP adapter without
 * touching a single page or hook.
 */
const useMock = import.meta.env.VITE_USE_MOCK_API !== 'false'

export const services: Services = useMock ? mockServices : httpServices

export const isMockMode = useMock

/**
 * In mock mode the "backend" is two SQLite databases, and they have to be open
 * before the first query runs. Awaiting this at boot is what lets every adapter
 * method stay synchronous about its data.
 */
export function initServices(): Promise<void> {
  return useMock ? ensureSqlite() : Promise.resolve()
}

export type { Services }
