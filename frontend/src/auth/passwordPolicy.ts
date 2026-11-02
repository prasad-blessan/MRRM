// Client-side mirror of the REG-09 rules for live feedback. The server is the authority:
// it also rejects common passwords and the last 5 passwords.
export const PASSWORD_MIN_LENGTH = 12

const CLASSES = [/[A-Z]/, /[a-z]/, /\d/, /[^A-Za-z0-9]/]

export interface PasswordRule {
  label: string
  met: boolean
}

export function passwordRules(password: string): PasswordRule[] {
  const classes = CLASSES.filter((re) => re.test(password)).length
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'At least 3 of: upper-case, lower-case, number, symbol', met: classes >= 3 },
  ]
}

export function meetsPasswordRules(password: string): boolean {
  return passwordRules(password).every((r) => r.met)
}
