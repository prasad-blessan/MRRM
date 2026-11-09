import { Link, Paper, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { PublicLayout } from '../components/PublicLayout'

// Temporary stand-in for screens that are not built yet.
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <PublicLayout>
      <Paper variant="outlined" className="auth-card placeholder-page">
        <Typography component="h1" variant="h5" className="placeholder-page__title">
          {title}
        </Typography>
        <Typography color="textSecondary" className="placeholder-page__text">
          This page is coming soon.
        </Typography>
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      </Paper>
    </PublicLayout>
  )
}
