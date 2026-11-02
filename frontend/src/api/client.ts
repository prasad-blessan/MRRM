const GENERIC_ERROR = 'Something went wrong. Please try again.'
const NETWORK_ERROR = 'We could not reach MRRM. Check your connection and try again.'

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : GENERIC_ERROR
}

interface ErrorBody {
  error?: { code?: string; message?: string } & Record<string, unknown>
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', NETWORK_ERROR)
  }

  if (res.status === 204) return undefined as T

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const err = (data as ErrorBody | null)?.error
    throw new ApiError(res.status, err?.code ?? 'SERVER_ERROR', err?.message ?? GENERIC_ERROR, err ?? {})
  }
  return data as T
}
