import { Alert, Box, CircularProgress } from '@mui/material'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { UserRole } from '../api/auth'
import { AppShell } from '../components/AppShell'
import { useAuth } from './context'

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: UserRole[] }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <Box sx={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    )
  }
  if (status === 'anonymous' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (roles && !roles.includes(user.role)) {
    return (
      <AppShell>
        <Alert severity="error">You do not have access to this page.</Alert>
      </AppShell>
    )
  }
  return <AppShell>{children}</AppShell>
}
