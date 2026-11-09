import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import { Alert, Button, CircularProgress, InputAdornment, Link, TextField, Typography } from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { Link as RouterLink } from 'react-router'
import { authApi } from '../api/auth'
import { errorMessage } from '../api/client'
import { AuthCard } from '../components/AuthCard'
import { FieldLabel } from '../components/FieldLabel'
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
        <div className="verify-status" role="status">
          {/* The size comes from CSS (--verify-spinner-size); MUI writes `size` into the element's width/height. */}
          <CircularProgress size="var(--verify-spinner-size)" aria-hidden />
          <Typography className="form-text">Please wait…</Typography>
        </div>
      </AuthCard>
    )
  }

  if (state.kind === 'verified') {
    return (
      <AuthCard title="Email verified">
        <div className="form-stack">
          <Alert severity="success">Thank you. Your email address is verified.</Alert>
          <Typography className="form-text">
            Your registration is now with LevelShift for review. We will email you when it is approved, and you can
            then sign in.
          </Typography>
          <Link component={RouterLink} to="/login" className="form-text form-link">
            Go to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="We could not verify your email">
      <div className="form-stack">
        <Alert severity="error">{state.message}</Alert>
        <Typography className="form-text">Enter the email address you registered with and we will send you a new link.</Typography>
        <ResendForm />
        <Link component={RouterLink} to="/login" className="form-text form-link">
          Back to sign in
        </Link>
      </div>
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
    <form
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
      <div className="form-stack">
        <div>
          <FieldLabel htmlFor="email">Email address</FieldLabel>
          <TextField
            id="email"
            type="email"
            placeholder="Enter your email address"
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
            className="field-lg"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <MailOutlineRounded />
                  </InputAdornment>
                ),
              },
            }}
          />
        </div>
        <Button type="submit" variant="contained" fullWidth className="btn-primary-lg">
          Send a new link
        </Button>
      </div>
    </form>
  )
}
