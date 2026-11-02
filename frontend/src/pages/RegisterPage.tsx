import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  Link,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useState } from 'react'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { Link as RouterLink } from 'react-router'
import { z } from 'zod'
import { authApi } from '../api/auth'
import { ApiError, errorMessage } from '../api/client'
import { meetsPasswordRules } from '../auth/passwordPolicy'
import { AuthCard } from '../components/AuthCard'
import { PasswordField } from '../components/PasswordField'
import { PasswordRules } from '../components/PasswordRules'
import { ResendVerification } from '../components/ResendVerification'

// REG-01: every field is mandatory; email and phone formats are validated.
const schema = z
  .object({
    organizationName: z.string().trim().min(1, 'Enter your organization name').max(200),
    organizationType: z.enum(['CLIENT', 'AGENCY'], { error: 'Choose client or agency' }),
    contactName: z.string().trim().min(1, 'Enter the contact name').max(120),
    email: z.string().trim().min(1, 'Enter an email address').email('Enter a valid email address'),
    phone: z
      .string()
      .trim()
      .min(1, 'Enter a phone number')
      .regex(/^\+?[\d\s().-]{7,20}$/, 'Enter a valid phone number, for example +1 555 123 4567')
      .refine((v) => v.replace(/\D/g, '').length >= 7, 'Enter a valid phone number'),
    address: z.string().trim().min(1, 'Enter the organization address').max(500),
    password: z.string().refine(meetsPasswordRules, 'Your password does not meet the rules below'),
    confirmPassword: z.string().min(1, 'Re-enter your password'),
    acceptTerms: z.boolean().refine((v) => v, 'You must accept the privacy notice and terms to register'),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })

type FormValues = z.input<typeof schema>

const FIELD_MESSAGES: Partial<Record<FieldPath<FormValues>, string>> = {
  email: 'Enter a valid email address',
  phone: 'Enter a valid phone number',
}

export function RegisterPage() {
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    control,
    handleSubmit,
    setError: setFieldError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      organizationName: '',
      contactName: '',
      email: '',
      phone: '',
      address: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  })

  const password = useWatch({ control, name: 'password' })

  const field = (name: FieldPath<FormValues>) => {
    const { ref, ...rest } = register(name)
    return { ...rest, inputRef: ref, id: name, error: !!errors[name], helperText: errors[name]?.message }
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      await authApi.register({
        organizationName: values.organizationName,
        organizationType: values.organizationType as 'CLIENT' | 'AGENCY',
        contactName: values.contactName,
        email: values.email,
        phone: values.phone,
        address: values.address,
        password: values.password,
        acceptTerms: true,
      })
      setRegisteredEmail(values.email.trim())
    } catch (err) {
      if (err instanceof ApiError && err.code === 'WEAK_PASSWORD') {
        setFieldError('password', { message: err.message }, { shouldFocus: true })
      } else if (err instanceof ApiError && err.code === 'EMAIL_TAKEN') {
        setFieldError('email', { message: err.message }, { shouldFocus: true })
      } else if (err instanceof ApiError && Array.isArray(err.details.fields)) {
        for (const name of err.details.fields as FieldPath<FormValues>[]) {
          setFieldError(name, { message: FIELD_MESSAGES[name] ?? 'Check this field' })
        }
        setError(err.message)
      } else {
        setError(errorMessage(err))
      }
    }
  })

  if (registeredEmail) {
    return (
      <AuthCard title="Check your email">
        <Stack spacing={2.5}>
          <Alert severity="success">Your registration has been received.</Alert>
          <Typography>
            We sent a verification link to <strong>{registeredEmail}</strong>. Open it within 24 hours to send your
            registration to LevelShift for approval.
          </Typography>
          <Typography color="text.secondary">
            After LevelShift approves your organization, we will email you a sign-in link.
          </Typography>
          <ResendVerification email={registeredEmail} />
          <Link component={RouterLink} to="/login">
            Back to sign in
          </Link>
        </Stack>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title="Register your organization"
      subtitle="Clients and agencies register once. LevelShift reviews every registration before access is granted."
    >
      <Box component="form" noValidate onSubmit={onSubmit}>
        <Stack spacing={2.5}>
          {error && <Alert severity="error">{error}</Alert>}

          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700 }}>
            Organization
          </Typography>
          <TextField {...field('organizationName')} label="Organization name" required fullWidth autoFocus />
          <Controller
            name="organizationType"
            control={control}
            render={({ field: radio }) => (
              <FormControl error={!!errors.organizationType} required>
                <FormLabel id="organizationType-label">Organization type</FormLabel>
                <RadioGroup
                  row
                  aria-labelledby="organizationType-label"
                  name={radio.name}
                  value={radio.value ?? ''}
                  onChange={(e) => radio.onChange(e.target.value)}
                  onBlur={radio.onBlur}
                >
                  <FormControlLabel value="CLIENT" control={<Radio slotProps={{ input: { ref: radio.ref } }} />} label="Client" />
                  <FormControlLabel value="AGENCY" control={<Radio />} label="Agency" />
                </RadioGroup>
                {errors.organizationType && <FormHelperText>{errors.organizationType.message}</FormHelperText>}
              </FormControl>
            )}
          />
          <TextField {...field('address')} label="Address" required fullWidth multiline minRows={2} autoComplete="street-address" />

          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, pt: 1 }}>
            Primary contact
          </Typography>
          <TextField {...field('contactName')} label="Contact name" required fullWidth autoComplete="name" />
          <TextField {...field('email')} label="Work email" type="email" required fullWidth autoComplete="email" />
          <TextField {...field('phone')} label="Phone" type="tel" required fullWidth autoComplete="tel" />

          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 700, pt: 1 }}>
            Password
          </Typography>
          <PasswordField
            {...field('password')}
            label="Password"
            required
            fullWidth
            autoComplete="new-password"
            slotProps={{ htmlInput: { 'aria-describedby': 'password-rules' } }}
          />
          <PasswordRules id="password-rules" password={password ?? ''} />
          <PasswordField {...field('confirmPassword')} label="Confirm password" required fullWidth autoComplete="new-password" />

          <Controller
            name="acceptTerms"
            control={control}
            render={({ field: box }) => (
              <FormControl error={!!errors.acceptTerms}>
                <FormControlLabel
                  control={
                    <Checkbox
                      slotProps={{ input: { ref: box.ref } }}
                      checked={!!box.value}
                      onChange={(e) => box.onChange(e.target.checked)}
                      onBlur={box.onBlur}
                    />
                  }
                  label={
                    <Typography variant="body2">
                      I accept the{' '}
                      <Link component={RouterLink} to="/policies/privacy" target="_blank" rel="noopener">
                        privacy & HIPAA policy
                      </Link>{' '}
                      and terms of use.
                    </Typography>
                  }
                />
                {errors.acceptTerms && <FormHelperText>{errors.acceptTerms.message}</FormHelperText>}
              </FormControl>
            )}
          />

          <Alert severity="info" variant="outlined">
            Do not enter patient names or medical details in this form.
          </Alert>

          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit registration'}
          </Button>
          <Typography variant="body2" sx={{ textAlign: 'center' }}>
            Already registered?{' '}
            <Link component={RouterLink} to="/login">
              Sign in
            </Link>
          </Typography>
        </Stack>
      </Box>
    </AuthCard>
  )
}
