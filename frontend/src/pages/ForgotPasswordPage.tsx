import { zodResolver } from '@hookform/resolvers/zod'
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import { Alert, Button, InputAdornment, Link, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link as RouterLink } from 'react-router'
import { z } from 'zod'
import { authApi } from '../api/auth'
import { errorMessage } from '../api/client'
import { AuthCard } from '../components/AuthCard'
import { FieldLabel } from '../components/FieldLabel'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email address').email('Enter a valid email address'),
})

// REG-05: the confirmation is identical whether or not the email exists.
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: { email: '' } })
  const { ref, ...emailField } = register('email')

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(errorMessage(err))
    }
  })

  if (sent) {
    return (
      <AuthCard title="Check your email">
        <div className="form-stack">
          <Alert severity="success">
            If an account exists for that email address, we have sent a link to reset your password.
          </Alert>
          <Typography color="textSecondary" className="form-text">
            The link can be used once and expires in 60 minutes. If it does not arrive, check your spam folder or
            request a new link; earlier links stop working.
          </Typography>
          <Link component={RouterLink} to="/login" className="form-text form-link">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter your email address and we will send you a reset link.">
      <form noValidate onSubmit={onSubmit}>
        <div className="form-stack">
          {error && <Alert severity="error">{error}</Alert>}
          <div>
            <FieldLabel htmlFor="email">Email address</FieldLabel>
            <TextField
              {...emailField}
              inputRef={ref}
              id="email"
              type="email"
              placeholder="Enter your email address"
              autoComplete="email"
              autoFocus
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
          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting} className="btn-primary-lg">
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
          <Link component={RouterLink} to="/login" className="form-text form-link form-link--center">
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthCard>
  )
}
