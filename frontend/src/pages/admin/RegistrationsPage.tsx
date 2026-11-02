import WarningAmber from '@mui/icons-material/WarningAmber'
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Paper,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import { useCallback, useEffect, useState } from 'react'
import { adminApi, type PendingRegistration } from '../../api/admin'
import { errorMessage } from '../../api/client'

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'

const typeLabel = (t: PendingRegistration['organizationType']) => (t === 'CLIENT' ? 'Client' : 'Agency')

// ADM-01 / ADM-08 / REG-03 / REG-07: queue of registrations waiting for approval.
export function RegistrationsPage() {
  const [items, setItems] = useState<PendingRegistration[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<PendingRegistration | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const fetchItems = useCallback(() => {
    adminApi.listRegistrations().then(
      (res) => setItems(res.registrations),
      (err) => setError(errorMessage(err)),
    )
  }, [])

  useEffect(fetchItems, [fetchItems])

  const reload = () => {
    setError(null)
    fetchItems()
  }

  const decided = (message: string) => {
    setSelected(null)
    setNotice(message)
    reload()
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
          Registrations waiting for approval
        </Typography>
        <Typography color="text.secondary">
          Approve only after the BAA is signed and the MSA reference is recorded.
        </Typography>
      </Box>

      {notice && (
        <Alert severity="success" onClose={() => setNotice(null)}>
          {notice}
        </Alert>
      )}
      {error && (
        <Alert severity="error" action={<Button color="inherit" onClick={reload}>Retry</Button>}>
          {error}
        </Alert>
      )}

      {items === null && !error ? (
        <CircularProgress aria-label="Loading registrations" />
      ) : items && items.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No registrations are waiting for approval.</Typography>
        </Paper>
      ) : (
        items && (
          <TableContainer component={Paper} variant="outlined">
            <Table aria-label="Registrations waiting for approval">
              <TableHead>
                <TableRow>
                  <TableCell>Organization</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Contact</TableCell>
                  <TableCell>Submitted</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Stack spacing={0.5}>
                        <span>{r.organizationName}</span>
                        {r.duplicates.length > 0 && (
                          <Chip
                            icon={<WarningAmber />}
                            label="Possible duplicate"
                            color="warning"
                            size="small"
                            variant="outlined"
                            sx={{ alignSelf: 'flex-start' }}
                          />
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>{typeLabel(r.organizationType)}</TableCell>
                    <TableCell>
                      {r.contact?.name}
                      <Typography variant="body2" color="text.secondary">
                        {r.contact?.email}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatDate(r.submittedAt)}</TableCell>
                    <TableCell align="right">
                      <Button variant="outlined" onClick={() => setSelected(r)}>
                        Review
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )
      )}

      {selected && (
        <ReviewDialog registration={selected} onClose={() => setSelected(null)} onDecided={decided} />
      )}
    </Stack>
  )
}

function ReviewDialog({
  registration: r,
  onClose,
  onDecided,
}: {
  registration: PendingRegistration
  onClose: () => void
  onDecided: (message: string) => void
}) {
  const [mode, setMode] = useState<'review' | 'reject'>('review')
  const [baa, setBaa] = useState<'' | 'yes' | 'no'>('')
  const [msa, setMsa] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canApprove = baa === 'yes' && msa.trim().length > 0
  const canReject = reason.trim().length >= 5

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onDecided(message)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(false)
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="review-title">
      <DialogTitle id="review-title">{mode === 'review' ? 'Review registration' : 'Reject registration'}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 2, rowGap: 1 }}>
            {[
              ['Organization', r.organizationName],
              ['Type', typeLabel(r.organizationType)],
              ['Address', r.address ?? '—'],
              ['Contact', r.contact?.name ?? '—'],
              ['Email', r.contact?.email ?? '—'],
              ['Phone', r.contact?.phone ?? '—'],
              ['Submitted', formatDate(r.submittedAt)],
            ].map(([label, value]) => (
              <Box key={label} sx={{ display: 'contents' }}>
                <Typography component="dt" variant="body2" color="text.secondary">
                  {label}
                </Typography>
                <Typography component="dd" variant="body2" sx={{ m: 0, whiteSpace: 'pre-line' }}>
                  {value}
                </Typography>
              </Box>
            ))}
          </Box>

          {r.duplicates.length > 0 && (
            <Alert severity="warning">
              Another organization with the same name and type already exists:{' '}
              {r.duplicates.map((d) => `${d.name} (${d.status.toLowerCase().replace('_', ' ')})`).join(', ')}. Check it is
              not a duplicate before approving.
            </Alert>
          )}

          {mode === 'review' ? (
            <>
              <FormControl required>
                <FormLabel id="baa-label">BAA signed?</FormLabel>
                <RadioGroup row aria-labelledby="baa-label" value={baa} onChange={(e) => setBaa(e.target.value as 'yes' | 'no')}>
                  <FormControlLabel value="yes" control={<Radio />} label="Yes" />
                  <FormControlLabel value="no" control={<Radio />} label="No" />
                </RadioGroup>
              </FormControl>
              {baa === 'no' && (
                <Alert severity="info">Approval stays blocked until a signed BAA is in place (ADM-08).</Alert>
              )}
              <TextField
                id="msa"
                label="MSA reference"
                value={msa}
                onChange={(e) => setMsa(e.target.value)}
                required
                fullWidth
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </>
          ) : (
            <TextField
              id="reason"
              label="Reason for rejection"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              fullWidth
              multiline
              minRows={3}
              autoFocus
              helperText="Recorded in the audit trail and visible to LevelShift only. The applicant is told the registration was not approved."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        {mode === 'review' ? (
          <>
            <Button color="error" onClick={() => setMode('reject')} disabled={busy} sx={{ mr: 'auto' }}>
              Reject…
            </Button>
            <Button onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={!canApprove || busy}
              onClick={() =>
                run(
                  () => adminApi.approveRegistration(r.id, msa.trim()),
                  `${r.organizationName} approved. The contact has been emailed a sign-in link.`,
                )
              }
            >
              Approve
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setMode('review')} disabled={busy} sx={{ mr: 'auto' }}>
              Back
            </Button>
            <Button
              variant="contained"
              color="error"
              disabled={!canReject || busy}
              onClick={() =>
                run(() => adminApi.rejectRegistration(r.id, reason.trim()), `${r.organizationName} rejected.`)
              }
            >
              Reject registration
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  )
}
