import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { authApi, type MeResponse, type SessionUser } from '../api/auth'
import { AuthContext, type AuthState, type AuthStatus } from './context'
import { SessionTimeoutDialog } from './SessionTimeoutDialog'

// REG-11: warn this long before the idle timeout ends the session.
const WARNING_MS = 60_000

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [user, setUser] = useState<SessionUser | null>(null)
  const [idleExpiresAt, setIdleExpiresAt] = useState<number | null>(null)
  const [warningOpen, setWarningOpen] = useState(false)

  const signedIn = useCallback((me: MeResponse) => {
    setUser(me.user)
    setIdleExpiresAt(Date.parse(me.session.idleExpiresAt))
    setStatus('authenticated')
    setWarningOpen(false)
  }, [])

  const clear = useCallback(() => {
    setUser(null)
    setIdleExpiresAt(null)
    setStatus('anonymous')
    setWarningOpen(false)
  }, [])

  const signOut = useCallback(
    async (reason?: 'timeout') => {
      if (reason !== 'timeout') await authApi.logout().catch(() => undefined)
      clear()
      navigate(reason === 'timeout' ? '/login?reason=timeout' : '/login', { replace: true })
    },
    [clear, navigate],
  )

  const extendSession = useCallback(async () => {
    try {
      signedIn(await authApi.me())
    } catch {
      await signOut('timeout')
    }
  }, [signedIn, signOut])

  useEffect(() => {
    authApi.me().then(signedIn, clear)
  }, [signedIn, clear])

  useEffect(() => {
    if (idleExpiresAt === null) return
    const now = Date.now()
    const warnTimer = window.setTimeout(() => setWarningOpen(true), Math.max(0, idleExpiresAt - WARNING_MS - now))
    const expireTimer = window.setTimeout(() => void signOut('timeout'), Math.max(0, idleExpiresAt - now))
    return () => {
      window.clearTimeout(warnTimer)
      window.clearTimeout(expireTimer)
    }
  }, [idleExpiresAt, signOut])

  const value = useMemo<AuthState>(
    () => ({ status, user, signedIn, signOut, extendSession }),
    [status, user, signedIn, signOut, extendSession],
  )

  return (
    <AuthContext.Provider value={value}>
      {children}
      {warningOpen && idleExpiresAt !== null && (
        <SessionTimeoutDialog
          expiresAt={idleExpiresAt}
          onStay={extendSession}
          onSignOut={() => void signOut()}
        />
      )}
    </AuthContext.Provider>
  )
}
