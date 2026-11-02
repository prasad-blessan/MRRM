import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Box, Button, Link, Stack, TextField, Typography } from '@mui/material'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link as RouterLink } from 'react-router'
import { z } from 'zod'
import { authApi } from '../api/auth'
import { errorMessage } from '../api/client'
import { AuthCard } from '../components/AuthCard'

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
        <Stack spacing={2.5}>
          <Alert severity="success">
            If an account exists for that email address, we have sent a link to reset your password.
          </Alert>
          <Typography color="text.secondary">
            The link can be used once and expires in 60 minutes. If it does not arrive, check your spam folder or
            request a new link; earlier links stop working.
          </Typography>
          <Link component={RouterLink} to="/login">
            Back to sign in
          </Link>
        </Stack>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Reset your password" subtitle="Enter your email address and we will send you a reset link.">
      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            {...emailField}
            inputRef={ref}
            id="email"
            label="Email address"
            type="email"
            autoComplete="email"
            autoFocus
            required
            fullWidth
            error={!!errors.email}
            helperText={errors.email?.message}
          />
          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send reset link'}
          </Button>
          <Link component={RouterLink} to="/login" sx={{ textAlign: 'center' }}>
            Back to sign in
          </Link>
        </Stack>
      </Box>
    </AuthCard>
  )
}
