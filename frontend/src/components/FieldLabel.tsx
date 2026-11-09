import { Typography } from '@mui/material'
import type { ReactNode } from 'react'

// Label shown above an input (design style), linked to it for screen readers.
export function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <Typography component="label" htmlFor={htmlFor} className="field-label">
      {children}
    </Typography>
  )
}
