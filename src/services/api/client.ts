import { ApiError } from '@/types/common'

/**
 * Thin HTTP client used by the real API adapter.
 *
 * §14 — no secret ever lives in source. The base URL comes from the
 * environment; the bearer token comes from the in-memory session holder set by
 * the auth feature, never from a hard-coded constant.
 */

const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '/api'

let authToken: string | null = null
let onUnauthorized: (() => void) | null = null

export function setAuthToken(token: string | null): void {
  authToken = token
}

/** The current bearer token. The mock backend reads it the way a real API would. */
export function getAuthToken(): string | null {
  return authToken
}

/** Registered by the auth provider so a 401 anywhere ends the session (§14). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  query?: Record<string, string | number | boolean | undefined | null>
  /** Guards a retried mutation against being applied twice (DEBT-004). */
  idempotencyKey?: string
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${BASE_URL}${path}`
  if (!query) return url
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    search.append(key, String(value))
  }
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, query, idempotencyKey, headers, ...rest } = options

  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  }
  if (body !== undefined && !(body instanceof FormData)) {
    finalHeaders['Content-Type'] = 'application/json'
  }
  if (authToken) finalHeaders.Authorization = `Bearer ${authToken}`
  if (idempotencyKey) finalHeaders['Idempotency-Key'] = idempotencyKey

  let response: Response
  try {
    response = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    })
  } catch (cause) {
    // Network / CORS / offline — surfaced as a TypeError by fetch.
    throw new TypeError(
      cause instanceof Error ? cause.message : 'network request failed',
    )
  }

  if (response.status === 401) {
    onUnauthorized?.()
    throw new ApiError(401, 'Unauthorized')
  }

  if (!response.ok) {
    let message = response.statusText
    let code: string | undefined
    let details: Record<string, string[]> | undefined
    try {
      const payload = (await response.json()) as {
        message?: string
        code?: string
        errors?: Record<string, string[]>
      }
      message = payload.message ?? message
      code = payload.code
      details = payload.errors
    } catch {
      /* body was not JSON — keep the status text */
    }
    throw new ApiError(response.status, message, code, details)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const http = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
}
