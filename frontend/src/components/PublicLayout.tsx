import { Box, Container, Link, Stack, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { Link as RouterLink } from 'react-router'
import { POLICY_LINKS } from './policyLinks'

const YEAR = new Date().getFullYear()

export function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <Box component="header" sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', py: 1.5 }}>
        <Container maxWidth="lg">
          <Typography component="p" variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            MRRM
          </Typography>
          <Typography component="p" variant="body2" sx={{ opacity: 0.9 }}>
            Client Document Submission and Tracking Portal
          </Typography>
        </Container>
      </Box>

      <Box component="main" sx={{ flex: 1, display: 'flex', alignItems: 'center', py: { xs: 3, sm: 6 } }}>
        <Container maxWidth="sm">{children}</Container>
      </Box>

      <Box component="footer" sx={{ py: 2, borderTop: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
        <Container maxWidth="lg">
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={{ xs: 1, sm: 3 }}
            sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}
          >
            <Typography variant="body2" color="text.secondary">
              © {YEAR} LevelShift
            </Typography>
            <Stack component="nav" aria-label="Policies and support" direction="row" spacing={3} useFlexGap sx={{ flexWrap: 'wrap' }}>
              {POLICY_LINKS.map((link) => (
                <Link key={link.to} component={RouterLink} to={link.to} variant="body2">
                  {link.label}
                </Link>
              ))}
            </Stack>
          </Stack>
        </Container>
      </Box>
    </Box>
  )
}
