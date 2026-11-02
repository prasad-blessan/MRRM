import { Alert, Box, Button, CircularProgress, Link, Stack, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { authApi } from '../api/auth'
import { errorMessage } from '../api/client'
import { AuthCard } from '../components/AuthCard'
import { ResendVerification } from '../components/ResendVerification'
import { useUrlToken } from '../hooks/useUrlToken'

type State = { kind: 'verifying' } | { kind: 'verified' } | { kind: 'failed'; message: string }

// REG-02: the verification link moves the registration to Pending Approval.
export function VerifyEmailPage() {
  const token = useUrlToken()
  const [state, setState] = useState<State>(
    token ? { kind: 'verifying' } : { kind: 'failed', message: 'This verification link is not valid.' },
  )
  // Links are single use, so the request must not repeat when React re-runs effects in development.
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    authApi.verifyEmail(token).then(
      () => setState({ kind: 'verified' }),
      (err) => setState({ kind: 'failed', message: errorMessage(err) }),
    )
  }, [token])

  if (state.kind === 'verifying') {
    return (
      <AuthCard title="Verifying your email">
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} role="status">
          <CircularProgress size={24} aria-hidden />
          <Typography>Please wait…</Typography>
        </Stack>
      </AuthCard>
    )
  }

  if (state.kind === 'verified') {
    return (
      <AuthCard title="Email verified">
        <Stack spacing={2.5}>
          <Alert severity="success">Thank you. Your email address is verified.</Alert>
          <Typography>
            Your registration is now with LevelShift for review. We will email you when it is approved, and you can
            then sign in.
          </Typography>
          <Link component={RouterLink} to="/login">
            Go to sign in
          </Link>
        </Stack>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="We could not verify your email">
      <Stack spacing={2.5}>
        <Alert severity="error">{state.message}</Alert>
        <Typography>Enter the email address you registered with and we will send you a new link.</Typography>
        <ResendForm />
        <Link component={RouterLink} to="/login">
          Back to sign in
        </Link>
      </Stack>
    </AuthCard>
  )
}

function ResendForm() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (submitted) return <ResendVerification email={submitted} />

  const valid = /^\S+@\S+\.\S+$/.test(email.trim())
  return (
    <Box
      component="form"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid) return setError('Enter a valid email address')
        try {
          await authApi.resendVerification(email.trim())
          setSubmitted(email.trim())
        } catch (err) {
          setError(errorMessage(err))
        }
      }}
    >
      <Stack spacing={2}>
        <TextField
          id="email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          error={!!error}
          helperText={error}
          required
          fullWidth
        />
        <Button type="submit" variant="contained">
          Send a new link
        </Button>
      </Stack>
    </Box>
  )
}
