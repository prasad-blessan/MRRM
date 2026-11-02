import { Link, Paper, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { PublicLayout } from '../components/PublicLayout'

// Temporary stand-in for screens that are not built yet.
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <PublicLayout>
      <Paper variant="outlined" sx={{ p: { xs: 3, sm: 5 } }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          {title}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          This page is coming soon.
        </Typography>
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      </Paper>
    </PublicLayout>
  )
}
