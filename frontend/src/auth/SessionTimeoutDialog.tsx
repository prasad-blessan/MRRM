import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { formatMmSs, useCountdown } from '../hooks/useCountdown'

interface Props {
  expiresAt: number
  onStay: () => void
  onSignOut: () => void
}

// REG-11 / SEC-07: idle warning that lets the user extend the session.
// Rendered only while the warning is showing, so the countdown starts fresh.
export function SessionTimeoutDialog({ expiresAt, onStay, onSignOut }: Props) {
  const seconds = useCountdown(expiresAt)

  return (
    <Dialog open aria-labelledby="timeout-title" aria-describedby="timeout-text">
      <DialogTitle id="timeout-title">Are you still there?</DialogTitle>
      <DialogContent>
        <DialogContentText id="timeout-text">
          For your security, you will be signed out in {formatMmSs(seconds)} because of inactivity.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onSignOut}>Sign out</Button>
        <Button variant="contained" onClick={onStay} autoFocus>
          Stay signed in
        </Button>
      </DialogActions>
    </Dialog>
  )
}
