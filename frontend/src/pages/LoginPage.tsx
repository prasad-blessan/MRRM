import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Box, Button, Divider, Link, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { authApi, type MeResponse, type OtpChallenge } from '../api/auth'
import { ApiError, errorMessage } from '../api/client'
import { useAuth } from '../auth/context'
import { AuthCard } from '../components/AuthCard'
import { PasswordField } from '../components/PasswordField'
import { formatMmSs, useCountdown } from '../hooks/useCountdown'

const RESEND_COOLDOWN_MS = 30_000

const REASON_NOTICES: Record<string, string> = {
  timeout: 'You were signed out because of inactivity. Please sign in again.',
  reset: 'Your password has been changed. Sign in with your new password.',
}

const credentialsSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

const otpSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code from your email'),
})

type Step = { kind: 'credentials' } | { kind: 'otp'; challenge: OtpChallenge }

// REG-04: email + password, then a one-time code sent by email.
export function LoginPage() {
  const { status, signedIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [step, setStep] = useState<Step>({ kind: 'credentials' })
  const [notice, setNotice] = useState<string | null>(null)

  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard'
  const reasonNotice = REASON_NOTICES[params.get('reason') ?? '']

  if (status === 'authenticated') return <Navigate to={from} replace />

  const handleVerified = (me: MeResponse) => {
    signedIn(me)
    navigate(from, { replace: true })
  }

  const restart = (message: string | null) => {
    setNotice(message)
    setStep({ kind: 'credentials' })
  }

  if (step.kind === 'otp') {
    return (
      <AuthCard title="Check your email">
        <OtpForm
          challenge={step.challenge}
          onChallengeChange={(challenge) => setStep({ kind: 'otp', challenge })}
          onVerified={handleVerified}
          onRestart={restart}
        />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Sign in" subtitle="Submit documents, track requests and download your outputs.">
      {reasonNotice && !notice && (
        <Alert severity="info" sx={{ mb: 2.5 }}>
          {reasonNotice}
        </Alert>
      )}
      <CredentialsForm
        initialError={notice}
        onChallenge={(challenge) => {
          setNotice(null)
          setStep({ kind: 'otp', challenge })
        }}
      />
      <Divider sx={{ my: 3 }} />
      <Typography variant="body2" sx={{ textAlign: 'center' }}>
        New client or agency?{' '}
        <Link component={RouterLink} to="/register">
          Register your organization
        </Link>
      </Typography>
    </AuthCard>
  )
}

function CredentialsForm({
  initialError,
  onChallenge,
}: {
  initialError: string | null
  onChallenge: (challenge: OtpChallenge) => void
}) {
  const [error, setError] = useState(initialError)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(credentialsSchema), defaultValues: { email: '', password: '' } })

  const { ref: emailRef, ...emailField } = register('email')
  const { ref: passwordRef, ...passwordField } = register('password')

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null)
    try {
      onChallenge(await authApi.login(email, password))
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <Stack spacing={2.5}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField
          {...emailField}
          inputRef={emailRef}
          id="email"
          label="Email address"
          type="email"
          autoComplete="username"
          autoFocus
          required
          fullWidth
          error={!!errors.email}
          helperText={errors.email?.message}
        />
        <PasswordField
          {...passwordField}
          inputRef={passwordRef}
          id="password"
          label="Password"
          autoComplete="current-password"
          required
          fullWidth
          error={!!errors.password}
          helperText={errors.password?.message}
        />
        <Box sx={{ textAlign: 'right', mt: '8px !important' }}>
          <Link component={RouterLink} to="/forgot-password" variant="body2">
            Forgot password?
          </Link>
        </Box>
        <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}>
          {isSubmitting ? 'Signing in…' : 'Sign in'}
        </Button>
      </Stack>
    </Box>
  )
}

function OtpForm({
  challenge,
  onChallengeChange,
  onVerified,
  onRestart,
}: {
  challenge: OtpChallenge
  onChallengeChange: (challenge: OtpChallenge) => void
  onVerified: (me: MeResponse) => void
  onRestart: (message: string | null) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [resending, setResending] = useState(false)
  const [resendAt, setResendAt] = useState(() => Date.now() + RESEND_COOLDOWN_MS)
  const expiresIn = useCountdown(Date.parse(challenge.expiresAt))
  const resendIn = useCountdown(resendAt)
  const {
    register,
    handleSubmit,
    reset,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(otpSchema), defaultValues: { code: '' } })

  const { ref: codeRef, ...codeField } = register('code')
  const expired = expiresIn === 0

  const clearCode = () => {
    reset({ code: '' })
    setFocus('code')
  }

  const onSubmit = handleSubmit(async ({ code }) => {
    setError(null)
    setInfo(null)
    try {
      onVerified(await authApi.verifyOtp(challenge.challengeId, code))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LOCKED') return onRestart(err.message)
      const attemptsLeft = err instanceof ApiError ? err.details.attemptsLeft : undefined
      setError(
        typeof attemptsLeft === 'number'
          ? `${errorMessage(err)} You have ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} left.`
          : errorMessage(err),
      )
      clearCode()
    }
  })

  const resend = async () => {
    setResending(true)
    setError(null)
    setInfo(null)
    try {
      onChallengeChange(await authApi.resendOtp(challenge.challengeId))
      setResendAt(Date.now() + RESEND_COOLDOWN_MS)
      setInfo('We sent you a new code. Earlier codes no longer work.')
      clearCode()
    } catch (err) {
      if (err instanceof ApiError && err.code === 'LOCKED') onRestart(err.message)
      else if (err instanceof ApiError && err.code === 'EXPIRED')
        onRestart('Your sign-in attempt has expired. Please sign in again.')
      else setError(errorMessage(err))
    } finally {
      setResending(false)
    }
  }

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        We sent a 6-digit sign-in code to <strong>{challenge.maskedEmail}</strong>.
      </Typography>
      <Stack spacing={2.5}>
        {error && <Alert severity="error">{error}</Alert>}
        {info && !error && <Alert severity="success">{info}</Alert>}
        {expired && !error && (
          <Alert severity="warning">This code has expired. Request a new code to continue.</Alert>
        )}
        <TextField
          {...codeField}
          inputRef={codeRef}
          id="code"
          label="6-digit code"
          autoComplete="one-time-code"
          autoFocus
          required
          fullWidth
          disabled={expired}
          error={!!errors.code}
          helperText={errors.code?.message ?? (expired ? ' ' : `Code expires in ${formatMmSs(expiresIn)}`)}
          slotProps={{
            htmlInput: {
              inputMode: 'numeric',
              pattern: '[0-9]*',
              maxLength: 6,
              style: { letterSpacing: '0.4em', fontSize: '1.25rem' },
            },
          }}
        />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting || expired}>
          {isSubmitting ? 'Verifying…' : 'Verify and sign in'}
        </Button>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Button onClick={() => onRestart(null)} size="small">
            Use a different account
          </Button>
          <Button onClick={resend} size="small" disabled={resending || resendIn > 0}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : resending ? 'Sending…' : 'Resend code'}
          </Button>
        </Stack>
      </Stack>
    </Box>
  )
}
