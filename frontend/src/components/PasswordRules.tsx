import CheckCircle from '@mui/icons-material/CheckCircle'
import RadioButtonUnchecked from '@mui/icons-material/RadioButtonUnchecked'
import { Box, Stack, Typography } from '@mui/material'
import { passwordRules } from '../auth/passwordPolicy'

// REG-09: rules are shown to the user. Each rule uses an icon and text, not colour alone (SEC-07).
export function PasswordRules({ password, id }: { password: string; id: string }) {
  return (
    <Box id={id} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
      {passwordRules(password).map((rule) => (
        <Stack component="li" key={rule.label} direction="row" spacing={1} sx={{ alignItems: 'center', py: 0.25 }}>
          {rule.met ? (
            <CheckCircle fontSize="small" color="success" aria-hidden />
          ) : (
            <RadioButtonUnchecked fontSize="small" color="disabled" aria-hidden />
          )}
          <Typography variant="body2" color={rule.met ? 'text.primary' : 'text.secondary'}>
            {rule.label}
            <Box component="span" sx={visuallyHidden}>
              {rule.met ? ' (met)' : ' (not met)'}
            </Box>
          </Typography>
        </Stack>
      ))}
      <Typography component="li" variant="body2" color="text.secondary" sx={{ pt: 0.5 }}>
        Avoid common passwords, your email address and your last 5 passwords.
      </Typography>
    </Box>
  )
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const
