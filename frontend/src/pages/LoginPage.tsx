import { zodResolver } from '@hookform/resolvers/zod'
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded'
import LockOutlined from '@mui/icons-material/LockOutlined'
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import {
  Alert,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Link,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Navigate, Link as RouterLink, useLocation, useNavigate, useSearchParams } from 'react-router'
import { z } from 'zod'
import { authApi, type MeResponse, type OtpChallenge } from '../api/auth'
import { ApiError, errorMessage } from '../api/client'
import { useAuth } from '../auth/context'
import { AuthCard } from '../components/AuthCard'
import { FieldLabel } from '../components/FieldLabel'
import { PasswordField } from '../components/PasswordField'
import { formatMmSs, useCountdown } from '../hooks/useCountdown'

const RESEND_COOLDOWN_MS = 30_000

// "Remember me" keeps only the email address on this device; sessions still time out (REG-11).
const REMEMBERED_EMAIL_KEY = 'mrrm.rememberedEmail'

function readRememberedEmail() {
  try {
    return localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveRememberedEmail(email: string | null) {
  try {
    if (email) localStorage.setItem(REMEMBERED_EMAIL_KEY, email)
    else localStorage.removeItem(REMEMBERED_EMAIL_KEY)
  } catch {
    // Storage unavailable (private window); nothing to remember.
  }
}

const REASON_NOTICES: Record<string, string> = {
  timeout: 'You were signed out because of inactivity. Please sign in again.',
  reset: 'Your password has been changed. Sign in with your new password.',
}

// Code-step actions are text links styled like Forgot password?
const TEXT_ACTION = 'form-text login__text-action'

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
      <AuthCard title="Check your email" subtitle="Enter the code to finish signing in">
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
    <AuthCard
      title="Welcome"
      subtitle="Sign in to your MRRM account"
      below={
        <Typography color="textSecondary" className="login__register">
          New client or agency?{' '}
          <Link component={RouterLink} to="/register" className="login__link-strong">
            Register your organization
          </Link>
        </Typography>
      }
    >
      {reasonNotice && !notice && (
        <Alert severity="info" className="login__notice">
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
  const [rememberedEmail] = useState(readRememberedEmail)
  const [remember, setRemember] = useState(rememberedEmail !== '')
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(credentialsSchema), defaultValues: { email: rememberedEmail, password: '' } })

  const { ref: emailRef, ...emailField } = register('email')
  const { ref: passwordRef, ...passwordField } = register('password')

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setError(null)
    try {
      const challenge = await authApi.login(email, password)
      saveRememberedEmail(remember ? email.trim() : null)
      onChallenge(challenge)
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  return (
    <form noValidate onSubmit={onSubmit}>
      <div className="form-stack">
        {error && <Alert severity="error">{error}</Alert>}
        <div>
          <FieldLabel htmlFor="email">Email</FieldLabel>
          <TextField
            {...emailField}
            inputRef={emailRef}
            id="email"
            type="email"
            placeholder="Enter your email address"
            autoComplete="username"
            autoFocus={!rememberedEmail}
            required
            fullWidth
            className="field-lg"
            error={!!errors.email}
            helperText={errors.email?.message}
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
        <div>
          <FieldLabel htmlFor="password">Password</FieldLabel>
          <PasswordField
            {...passwordField}
            inputRef={passwordRef}
            id="password"
            placeholder="Enter your password"
            autoComplete="current-password"
            autoFocus={!!rememberedEmail}
            required
            fullWidth
            startIcon={<LockOutlined />}
            className="field-lg"
            error={!!errors.password}
            helperText={errors.password?.message}
          />
        </div>
        <div className="login__row login__row--options">
          <FormControlLabel
            control={
              <Checkbox
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="login__remember-box"
              />
            }
            label="Remember me"
            className="login__remember"
          />
          <Link component={RouterLink} to="/forgot-password" underline="hover" className="form-text login__link-strong">
            Forgot password?
          </Link>
        </div>
        <Button
          type="submit"
          variant="contained"
          size="large"
          fullWidth
          disabled={isSubmitting}
          className="btn-primary-lg login__submit"
          startIcon={isSubmitting && <CircularProgress size={17} color="inherit" />}
          endIcon={!isSubmitting && <ArrowForwardRounded />}
        >
          {isSubmitting ? 'Signing in…' : 'Sign In'}
        </Button>
      </div>
    </form>
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
    <form noValidate onSubmit={onSubmit}>
      <Typography color="textSecondary" className="login__otp-intro">
        We sent a 6-digit sign-in code to <strong>{challenge.maskedEmail}</strong>.
      </Typography>
      <div className="form-stack">
        {error && <Alert severity="error">{error}</Alert>}
        {info && !error && <Alert severity="success">{info}</Alert>}
        {expired && !error && (
          <Alert severity="warning">This code has expired. Request a new code to continue.</Alert>
        )}
        <div>
          <FieldLabel htmlFor="code">6-digit code</FieldLabel>
          <TextField
            {...codeField}
            inputRef={codeRef}
            id="code"
            placeholder="••••••"
            autoComplete="one-time-code"
            autoFocus
            required
            fullWidth
            disabled={expired}
            className="field-lg login__code"
            error={!!errors.code}
            helperText={errors.code?.message ?? (expired ? ' ' : `Code expires in ${formatMmSs(expiresIn)}`)}
            slotProps={{
              htmlInput: {
                inputMode: 'numeric',
                pattern: '[0-9]*',
                maxLength: 6,
              },
            }}
          />
        </div>
        <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting || expired} className="btn-primary-lg">
          {isSubmitting ? 'Verifying…' : 'Verify and Sign In'}
        </Button>
        <div className="login__row">
          <Link component="button" type="button" underline="hover" onClick={() => onRestart(null)} className={TEXT_ACTION}>
            Use a different account
          </Link>
          <Link component="button" type="button" underline="hover" onClick={resend} disabled={resending || resendIn > 0} className={TEXT_ACTION}>
            {resendIn > 0 ? `Resend code in ${resendIn}s` : resending ? 'Sending…' : 'Resend code'}
          </Link>
        </div>
      </div>
    </form>
  )
}
