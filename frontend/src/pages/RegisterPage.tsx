import { zodResolver } from '@hookform/resolvers/zod'
import LockOutlined from '@mui/icons-material/LockOutlined'
import MailOutlineRounded from '@mui/icons-material/MailOutlineRounded'
import PhoneOutlined from '@mui/icons-material/PhoneOutlined'
import {
  Alert,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormHelperText,
  FormLabel,
  InputAdornment,
  Link,
  Radio,
  RadioGroup,
  TextField,
  Typography,
} from '@mui/material'
import { useState, type ReactNode } from 'react'
import { Controller, useForm, useWatch, type FieldPath } from 'react-hook-form'
import { Link as RouterLink } from 'react-router'
import { z } from 'zod'
import { authApi } from '../api/auth'
import { ApiError, errorMessage } from '../api/client'
import { meetsPasswordRules } from '../auth/passwordPolicy'
import { AuthCard } from '../components/AuthCard'
import { FieldLabel } from '../components/FieldLabel'
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

const adornment = (icon: ReactNode) => <InputAdornment position="start">{icon}</InputAdornment>

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
        <div className="form-stack">
          <Alert severity="success">Your registration has been received.</Alert>
          <Typography className="form-text">
            We sent a verification link to <strong>{registeredEmail}</strong>. Open it within 24 hours to send your
            registration to LevelShift for approval.
          </Typography>
          <Typography color="textSecondary" className="form-text">
            After LevelShift approves your organization, we will email you a sign-in link.
          </Typography>
          <ResendVerification email={registeredEmail} />
          <Link component={RouterLink} to="/login" className="form-text form-link">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      scrolls
      title="Register"
      subtitle="Clients and agencies register once. LevelShift reviews every registration before access is granted."
      subtitleClassName="register-subtitle"
    >
      <form noValidate onSubmit={onSubmit}>
        <div className="form-stack">
          {error && <Alert severity="error">{error}</Alert>}

          <Typography component="h2" className="register-section">
            Organization
          </Typography>
          <div>
            <FieldLabel htmlFor="organizationName">Organization name *</FieldLabel>
            <TextField
              {...field('organizationName')}
              placeholder="Enter your organization name"
              required
              fullWidth
              autoFocus
              className="field-lg"
            />
          </div>
          <Controller
            name="organizationType"
            control={control}
            render={({ field: radio }) => (
              <FormControl error={!!errors.organizationType} required>
                <FormLabel id="organizationType-label" className="register-label">
                  Organization type
                </FormLabel>
                <RadioGroup
                  row
                  aria-labelledby="organizationType-label"
                  name={radio.name}
                  value={radio.value ?? ''}
                  onChange={(e) => radio.onChange(e.target.value)}
                  onBlur={radio.onBlur}
                  className="register-choices"
                >
                  <FormControlLabel value="CLIENT" control={<Radio slotProps={{ input: { ref: radio.ref } }} />} label="Client" />
                  <FormControlLabel value="AGENCY" control={<Radio />} label="Agency" />
                </RadioGroup>
                {errors.organizationType && <FormHelperText className="register-helper">{errors.organizationType.message}</FormHelperText>}
              </FormControl>
            )}
          />
          <div>
            <FieldLabel htmlFor="address">Address *</FieldLabel>
            <TextField
              {...field('address')}
              placeholder="Enter the organization address"
              required
              fullWidth
              multiline
              minRows={2}
              autoComplete="street-address"
              className="field-lg field-lg--multiline"
            />
          </div>

          <Typography component="h2" className="register-section register-section--spaced">
            Primary contact
          </Typography>
          <div>
            <FieldLabel htmlFor="contactName">Contact name *</FieldLabel>
            <TextField {...field('contactName')} placeholder="Enter the contact name" required fullWidth autoComplete="name" className="field-lg" />
          </div>
          <div>
            <FieldLabel htmlFor="email">Work email *</FieldLabel>
            <TextField
              {...field('email')}
              type="email"
              placeholder="Enter your work email"
              required
              fullWidth
              autoComplete="email"
              className="field-lg"
              slotProps={{ input: { startAdornment: adornment(<MailOutlineRounded />) } }}
            />
          </div>
          <div>
            <FieldLabel htmlFor="phone">Phone *</FieldLabel>
            <TextField
              {...field('phone')}
              type="tel"
              placeholder="+1 555 123 4567"
              required
              fullWidth
              autoComplete="tel"
              className="field-lg"
              slotProps={{ input: { startAdornment: adornment(<PhoneOutlined />) } }}
            />
          </div>

          <Typography component="h2" className="register-section register-section--spaced">
            Password
          </Typography>
          <div>
            <FieldLabel htmlFor="password">Password *</FieldLabel>
            <PasswordField
              {...field('password')}
              placeholder="Create a password"
              required
              fullWidth
              autoComplete="new-password"
              startIcon={<LockOutlined />}
              className="field-lg"
              slotProps={{ htmlInput: { 'aria-describedby': 'password-rules' } }}
            />
            <div className="password-rules-gap">
              <PasswordRules id="password-rules" password={password ?? ''} />
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="confirmPassword">Confirm password *</FieldLabel>
            <PasswordField
              {...field('confirmPassword')}
              placeholder="Re-enter the password"
              required
              fullWidth
              autoComplete="new-password"
              startIcon={<LockOutlined />}
              className="field-lg"
            />
          </div>

          <Controller
            name="acceptTerms"
            control={control}
            render={({ field: box }) => (
              <FormControl error={!!errors.acceptTerms}>
                <FormControlLabel
                  className="register-terms"
                  control={
                    <Checkbox
                      slotProps={{ input: { ref: box.ref } }}
                      checked={!!box.value}
                      onChange={(e) => box.onChange(e.target.checked)}
                      onBlur={box.onBlur}
                      className="register-terms__box"
                    />
                  }
                  label={
                    <Typography className="register-terms__label">
                      I accept the{' '}
                      <Link component={RouterLink} to="/policies/privacy" target="_blank" rel="noopener">
                        privacy & HIPAA policy
                      </Link>{' '}
                      and terms of use.
                    </Typography>
                  }
                />
                {errors.acceptTerms && <FormHelperText className="register-helper">{errors.acceptTerms.message}</FormHelperText>}
              </FormControl>
            )}
          />

          <Alert severity="info" variant="outlined">
            Do not enter patient names or medical details in this form.
          </Alert>

          <Button type="submit" variant="contained" size="large" fullWidth disabled={isSubmitting} className="btn-primary-lg">
            {isSubmitting ? 'Submitting…' : 'Submit registration'}
          </Button>
          <Typography color="textSecondary" className="form-text register-signin">
            Already registered?{' '}
            <Link component={RouterLink} to="/login" className="form-link">
              Sign in
            </Link>
          </Typography>
        </div>
      </form>
    </AuthCard>
  )
}
