import { zodResolver } from '@hookform/resolvers/zod'
import LockOutlined from '@mui/icons-material/LockOutlined'
import { Alert, Button, CircularProgress, Link } from '@mui/material'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link as RouterLink, useNavigate } from 'react-router'
import { z } from 'zod'
import { authApi } from '../api/auth'
import { ApiError, errorMessage } from '../api/client'
import { meetsPasswordRules } from '../auth/passwordPolicy'
import { AuthCard } from '../components/AuthCard'
import { FieldLabel } from '../components/FieldLabel'
import { PasswordField } from '../components/PasswordField'
import { PasswordRules } from '../components/PasswordRules'
import { useUrlToken } from '../hooks/useUrlToken'

const schema = z
  .object({
    password: z.string().refine(meetsPasswordRules, 'Your password does not meet the rules below'),
    confirmPassword: z.string().min(1, 'Re-enter your new password'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' })

type LinkState = 'checking' | 'valid' | 'invalid'

// REG-05 / REG-08 / REG-09: single-use link; a successful reset signs out every session.
export function ResetPasswordPage() {
  const token = useUrlToken()
  const navigate = useNavigate()
  const [linkState, setLinkState] = useState<LinkState>(token ? 'checking' : 'invalid')
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { password: '', confirmPassword: '' } })
  const password = useWatch({ control, name: 'password' })

  useEffect(() => {
    if (!token) return
    authApi.checkResetLink(token).then(
      () => setLinkState('valid'),
      () => setLinkState('invalid'),
    )
  }, [token])

  const { ref: passwordRef, ...passwordField } = register('password')
  const { ref: confirmRef, ...confirmField } = register('confirmPassword')

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return
    setError(null)
    try {
      await authApi.resetPassword(token, password)
      navigate('/login?reason=reset', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.code === 'INVALID_LINK') setLinkState('invalid')
      else if (err instanceof ApiError && (err.code === 'WEAK_PASSWORD' || err.code === 'REUSED_PASSWORD'))
        setFieldError('password', { message: err.message }, { shouldFocus: true })
      else setError(errorMessage(err))
    }
  })

  if (linkState === 'checking') {
    return (
      <AuthCard title="Reset your password">
        <CircularProgress aria-label="Checking your link" />
      </AuthCard>
    )
  }

  if (linkState === 'invalid') {
    return (
      <AuthCard title="This link cannot be used">
        <div className="form-stack">
          <Alert severity="error">This link has expired or has already been used. Please request a new one.</Alert>
          <Button component={RouterLink} to="/forgot-password" variant="contained" fullWidth className="btn-primary-lg">
            Request a new link
          </Button>
          <Link component={RouterLink} to="/login" className="form-text form-link form-link--center">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Choose a new password"
      subtitle="After you change your password you will be signed out of all devices."
    >
      <form noValidate onSubmit={onSubmit}>
        <div className="form-stack">
          {error && <Alert severity="error">{error}</Alert>}
          <div>
            <FieldLabel htmlFor="password">New password</FieldLabel>
            <PasswordField
              {...passwordField}
              inputRef={passwordRef}
              id="password"
              placeholder="Enter a new password"
              autoComplete="new-password"
              autoFocus
              required
              fullWidth
              startIcon={<LockOutlined />}
              className="field-lg"
              error={!!errors.password}
              helperText={errors.password?.message}
              slotProps={{ htmlInput: { 'aria-describedby': 'password-rules' } }}
            />
            <div className="password-rules-gap">
              <PasswordRules id="password-rules" password={password} />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="confirmPassword">Confirm new password</FieldLabel>
            <PasswordField
              {...confirmField}
              inputRef={confirmRef}
              id="confirmPassword"
              placeholder="Re-enter the new password"
              autoComplete="new-password"
              required
              fullWidth
              startIcon={<LockOutlined />}
              className="field-lg"
              error={!!errors.confirmPassword}
              helperText={errors.confirmPassword?.message}
            />
          </div>
          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting} className="btn-primary-lg">
            {isSubmitting ? 'Saving…' : 'Change password'}
          </Button>
        </div>
      </form>
    </AuthCard>
  )
}
