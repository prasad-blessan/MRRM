import { Link, Paper, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router'
import { PageHeader } from '../components/AppShell'

// Signed-in stand-in for screens that are not built yet.
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} subtitle="This screen is coming soon." />
      <Paper elevation={0} className="soon-card">
        <Typography color="textSecondary" className="soon-text">
          It is part of a later build.
        </Typography>
        <Link component={RouterLink} to="/dashboard" className="soon-link">
          Back to Dashboard
        </Link>
      </Paper>
    </>
  )
}
