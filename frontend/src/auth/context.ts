import { createContext, useContext } from 'react'
import type { MeResponse, SessionUser } from '../api/auth'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthState {
  status: AuthStatus
  user: SessionUser | null
  signedIn: (me: MeResponse) => void
  signOut: (reason?: 'timeout') => Promise<void>
  extendSession: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
