import { AppBar, Box, Button, Container, Link, Stack, Toolbar, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import type { UserRole } from '../api/auth'
import { useAuth } from '../auth/context'
import { POLICY_LINKS } from './policyLinks'

const NAV: { to: string; label: string; roles: UserRole[] }[] = [
  { to: '/dashboard', label: 'Dashboard', roles: ['CLIENT_USER', 'LS_ADMIN', 'LS_USER'] },
  { to: '/admin/registrations', label: 'Registrations', roles: ['LS_ADMIN'] },
]

// Layout for signed-in screens. Navigation shows only what the role may use; the server enforces it too.
export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()
  if (!user) return null

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography component="p" variant="h6" sx={{ fontWeight: 700 }}>
            MRRM
          </Typography>
          <Stack component="nav" aria-label="Main" direction="row" spacing={0.5} sx={{ flexGrow: 1 }}>
            {NAV.filter((item) => item.roles.includes(user.role)).map((item) => (
              <Button
                key={item.to}
                component={NavLink}
                to={item.to}
                color="inherit"
                sx={{ '&.active': { bgcolor: 'rgba(255,255,255,0.18)' } }}
              >
                {item.label}
              </Button>
            ))}
          </Stack>
          <Typography variant="body2" sx={{ display: { xs: 'none', md: 'block' } }}>
            {user.fullName} · {user.organization?.name ?? 'LevelShift'}
          </Typography>
          <Button color="inherit" variant="outlined" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Container maxWidth="lg" component="main" sx={{ py: 4, flex: 1 }}>
        {children}
      </Container>
      <Box component="footer" sx={{ py: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg">
          <Stack component="nav" aria-label="Policies and support" direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {POLICY_LINKS.map((link) => (
              <Link key={link.to} component={NavLink} to={link.to} variant="body2">
                {link.label}
              </Link>
            ))}
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
