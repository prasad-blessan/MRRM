import { api, ApiError } from './client'

export type RequestStatus =
  | 'RECEIVED'
  | 'ON_HOLD'
  | 'ALLOCATED'
  | 'IN_PROCESSING'
  | 'SUMMARIZATION'
  | 'QC_VERIFICATION'
  | 'REWORK'
  | 'DELIVERED'
  | 'COMPLETED'
  | 'REJECTED'
  | 'CANCELLED'

export type StatusGroup = 'pending' | 'inProgress' | 'completed' | 'closed'
export type RequestSort = 'id' | 'receivedAt' | 'updatedAt' | 'expectedAt' | 'completedAt' | 'status'
export type SortOrder = 'asc' | 'desc'

export interface ServiceType {
  id: string
  name: string
  slaHours: number
}

export interface RequestSummary {
  total: number
  inProgress: number
  completed: number
  pending: number
}

export interface RequestRow {
  id: string
  organization: string
  service: string
  status: RequestStatus
  documents: number
  pages: number
  receivedAt: string
  expectedAt: string
  deliveredAt: string | null
  updatedAt: string
}

export interface RequestPage {
  total: number
  page: number
  pageSize: number
  items: RequestRow[]
}

export interface ListQuery {
  q?: string
  group?: StatusGroup
  exclude?: StatusGroup
  sort?: RequestSort
  order?: SortOrder
  page?: number
  pageSize?: number
}

export interface UploadedFile {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  pages: number
}

export const getServiceTypes = () => api<{ services: ServiceType[] }>('/service-types').then((r) => r.services)
export const getSummary = () => api<RequestSummary>('/requests/summary')

export function listRequests(query: ListQuery) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  return api<RequestPage>(`/requests?${params}`)
}

export const submitRequest = (serviceTypeId: string, documentIds: string[]) =>
  api<{ id: string; expectedAt: string }>('/requests', { method: 'POST', body: { serviceTypeId, documentIds } })

export const discardUpload = (id: string) => api<void>(`/uploads/${id}`, { method: 'DELETE' })

// XHR instead of fetch: fetch cannot report upload progress.
export function uploadFile(file: File, onProgress: (percent: number) => void, signal: AbortSignal) {
  return new Promise<UploadedFile>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/uploads')
    xhr.responseType = 'json'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)))
    }
    xhr.onload = () => {
      if (xhr.status === 201) return resolve(xhr.response as UploadedFile)
      const err = (xhr.response as { error?: { code?: string; message?: string } } | null)?.error
      reject(new ApiError(xhr.status, err?.code ?? 'SERVER_ERROR', err?.message ?? 'The file could not be uploaded.'))
    }
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'We could not reach MRRM. Check your connection and try again.'))
    xhr.onabort = () => reject(new ApiError(0, 'ABORTED', 'Upload cancelled.'))
    signal.addEventListener('abort', () => xhr.abort(), { once: true })
    const body = new FormData()
    body.append('file', file)
    xhr.send(body)
  })
}

// Client-facing labels (PRD 7.2). Internal steps such as allocation are not exposed separately.
export const STATUS_META: Record<RequestStatus, { label: string; tone: StatusTone }> = {
  RECEIVED: { label: 'Pending', tone: 'pending' },
  ON_HOLD: { label: 'On Hold', tone: 'warning' },
  ALLOCATED: { label: 'In Progress', tone: 'progress' },
  IN_PROCESSING: { label: 'In Progress', tone: 'progress' },
  SUMMARIZATION: { label: 'Summarization', tone: 'progress' },
  QC_VERIFICATION: { label: 'Quality Check', tone: 'quality' },
  REWORK: { label: 'Quality Check', tone: 'quality' },
  DELIVERED: { label: 'Completed', tone: 'done' },
  COMPLETED: { label: 'Completed', tone: 'done' },
  REJECTED: { label: 'Rejected', tone: 'closed' },
  CANCELLED: { label: 'Cancelled', tone: 'closed' },
}

export type StatusTone = 'pending' | 'warning' | 'progress' | 'quality' | 'done' | 'closed'

export const cancelRequest = (code: string) => api<void>(`/requests/${encodeURIComponent(code)}/cancel`, { method: 'POST' })

// Statuses a client may still cancel (matches the server's CANCELLABLE list).
export const CANCELLABLE: RequestStatus[] = ['RECEIVED', 'ALLOCATED']

// Delivered = output ready but not downloaded yet; the client's first full download makes it Completed (DEL-03).
export const isNewDeliverable = (row: { status: RequestStatus }) => row.status === 'DELIVERED'

// DEL-01: the output only (one file, or a ZIP when there are several), saved through the browser download.
export async function downloadRequest(code: string): Promise<void> {
  let res: Response
  try {
    res = await fetch(`/api/requests/${encodeURIComponent(code)}/download`, { credentials: 'same-origin' })
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'We could not reach MRRM. Check your connection and try again.')
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null
    throw new ApiError(res.status, body?.error?.code ?? 'SERVER_ERROR', body?.error?.message ?? 'The download failed. Please try again.')
  }
  const blob = await res.blob()
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `${code} - output`
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---- TRK-01..TRK-04: request detail for the Workflow Monitor ----

export type StageState = 'completed' | 'active' | 'pending'

export interface WorkflowStage {
  name: string
  state: StageState
  progress: number
  completedAt: string | null
}

export interface RequestDocument {
  id: string
  fileName: string
  mimeType: string
  sizeBytes: number
  pages: number
  outputReady: boolean
}

export interface RequestDetail {
  id: string
  service: string
  status: RequestStatus
  receivedAt: string
  expectedAt: string
  deliveredAt: string | null
  completedAt: string | null
  updatedAt: string
  cancellable: boolean
  pages: number
  documents: RequestDocument[]
  stages: WorkflowStage[]
}

export const getRequest = (code: string) => api<RequestDetail>(`/requests/${encodeURIComponent(code)}`)
