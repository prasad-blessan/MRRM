import { api } from './client'

export type UserRole = 'CLIENT_USER' | 'LS_ADMIN' | 'LS_USER'

export interface SessionUser {
  id: string
  email: string
  fullName: string
  role: UserRole
  timezone: string | null
  organization: { id: string; name: string; type: 'CLIENT' | 'AGENCY' } | null
}

export interface MeResponse {
  user: SessionUser
  session: { idleExpiresAt: string }
}

export interface OtpChallenge {
  challengeId: string
  expiresAt: string
  maskedEmail: string
}

export interface RegistrationInput {
  organizationName: string
  organizationType: 'CLIENT' | 'AGENCY'
  contactName: string
  email: string
  phone: string
  address: string
  password: string
  acceptTerms: true
}

export const authApi = {
  register: (input: RegistrationInput) => api<{ status: string }>('/auth/register', { method: 'POST', body: input }),
  verifyEmail: (token: string) => api<{ status: string }>('/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: (email: string) =>
    api<{ status: string }>('/auth/resend-verification', { method: 'POST', body: { email } }),
  forgotPassword: (email: string) =>
    api<{ status: string }>('/auth/forgot-password', { method: 'POST', body: { email } }),
  checkResetLink: (token: string) =>
    api<{ status: string }>('/auth/reset-password/check', { method: 'POST', body: { token } }),
  resetPassword: (token: string, password: string) =>
    api<{ status: string }>('/auth/reset-password', { method: 'POST', body: { token, password } }),
  login: (email: string, password: string) =>
    api<OtpChallenge>('/auth/login', { method: 'POST', body: { email, password } }),
  verifyOtp: (challengeId: string, code: string) =>
    api<MeResponse>('/auth/verify-otp', { method: 'POST', body: { challengeId, code } }),
  resendOtp: (challengeId: string) => api<OtpChallenge>('/auth/resend-otp', { method: 'POST', body: { challengeId } }),
  me: () => api<MeResponse>('/auth/me'),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
}
