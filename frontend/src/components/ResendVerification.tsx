import { Alert, Button } from '@mui/material'
import { useState } from 'react'
import { authApi } from '../api/auth'
import { errorMessage } from '../api/client'
import { useCountdown } from '../hooks/useCountdown'

const COOLDOWN_MS = 30_000

// REG-08: re-send a verification link; the response never reveals whether the email exists.
export function ResendVerification({ email }: { email: string }) {
  const [sentAt, setSentAt] = useState(() => Date.now())
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const wait = useCountdown(sentAt + COOLDOWN_MS)

  const resend = async () => {
    setSending(true)
    setMessage(null)
    try {
      await authApi.resendVerification(email)
      setSentAt(Date.now())
      setMessage({ ok: true, text: 'If a registration is waiting for verification, we have sent a new link. Earlier links no longer work.' })
    } catch (err) {
      setMessage({ ok: false, text: errorMessage(err) })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="resend">
      {message && <Alert severity={message.ok ? 'success' : 'error'} className="resend-alert">{message.text}</Alert>}
      <Button variant="outlined" onClick={resend} disabled={sending || wait > 0} className="btn-secondary-lg">
        {wait > 0 ? `Resend verification email in ${wait}s` : sending ? 'Sending…' : 'Resend verification email'}
      </Button>
    </div>
  )
}
