import { api } from './client'

export interface PendingRegistration {
  id: string
  organizationName: string
  organizationType: 'CLIENT' | 'AGENCY'
  address: string | null
  submittedAt: string | null
  contact: { name: string; email: string; phone: string | null } | null
  duplicates: { id: string; name: string; status: string }[]
}

export const adminApi = {
  listRegistrations: () => api<{ registrations: PendingRegistration[] }>('/admin/registrations'),
  approveRegistration: (id: string, msaReference: string) =>
    api<void>(`/admin/registrations/${id}/approve`, { method: 'POST', body: { baaSigned: true, msaReference } }),
  rejectRegistration: (id: string, reason: string) =>
    api<void>(`/admin/registrations/${id}/reject`, { method: 'POST', body: { reason } }),
}
