import { Button, Paper, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { useAuth } from '../auth/context'

// Placeholder until the dashboard screens (DSH, Admin dashboard) are built.
export function DashboardPage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <Paper variant="outlined" sx={{ p: 4 }}>
      <Typography component="h1" variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        Welcome, {user.fullName}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        You are signed in. The dashboard is the next screen to build.
      </Typography>
      {user.role === 'LS_ADMIN' && (
        <Button component={RouterLink} to="/admin/registrations" variant="contained">
          Review registrations
        </Button>
      )}
    </Paper>
  )
}
