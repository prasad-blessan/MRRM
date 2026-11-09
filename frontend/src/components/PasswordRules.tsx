import CheckCircle from '@mui/icons-material/CheckCircle'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import { Typography } from '@mui/material'
import { passwordRules } from '../auth/passwordPolicy'

// REG-09: rules are shown to the user. Each rule uses an icon and text, not colour alone (SEC-07).
export function PasswordRules({ password, id }: { password: string; id: string }) {
  return (
    <ul id={id} className="password-rules">
      {passwordRules(password).map((rule) => (
        <li key={rule.label} className="password-rules__rule">
          {rule.met ? (
            <CheckCircle color="success" className="password-rules__icon" aria-hidden />
          ) : (
            <RadioButtonUnchecked color="disabled" className="password-rules__icon" aria-hidden />
          )}
          <Typography color={rule.met ? 'textPrimary' : 'textSecondary'} className="password-rules__text">
            {rule.label}
            <span className="sr-only">{rule.met ? ' (met)' : ' (not met)'}</span>
          </Typography>
        </li>
      ))}
      <Typography component="li" color="textSecondary" className="password-rules__text password-rules__note">
        Avoid common passwords, your email address and your last 5 passwords.
      </Typography>
    </ul>
  )
}
