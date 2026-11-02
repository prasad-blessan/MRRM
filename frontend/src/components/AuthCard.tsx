import { Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { PublicLayout } from './PublicLayout'

// Card used by every signed-out screen (sign in, register, password reset).
export function AuthCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <PublicLayout>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 700, mb: subtitle ? 0.5 : 3 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            {subtitle}
          </Typography>
        )}
        {children}
      </Paper>
    </PublicLayout>
  )
}
