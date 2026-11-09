import { Paper, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { cx } from '../lib/cx'
import { PublicLayout } from './PublicLayout'

// Card used by every signed-out screen (sign in, register, password reset); `below` renders under the card.
export function AuthCard({
  title,
  subtitle,
  below,
  scrolls,
  largeText = true,
  subtitleClassName,
  children,
}: {
  title: string
  subtitle?: ReactNode
  // Per-screen tweaks to the subtitle (e.g. a multi-line one needs tighter lines and more room under the heading).
  subtitleClassName?: string
  below?: ReactNode
  // Long form (register): on desktop the heading stays fixed and only the form scrolls inside the card.
  scrolls?: boolean
  // Enlarges the form's text (--fs) without changing its layout.
  largeText?: boolean
  children: ReactNode
}) {
  return (
    <PublicLayout below={below} scrolls={scrolls} largeText={largeText}>
      <Paper elevation={0} className={cx('auth-card', scrolls && 'auth-card--scrolls')}>
        <Typography component="h1" className={cx('auth-card__title', !subtitle && 'auth-card__title--alone')}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="textSecondary" className={cx('auth-card__subtitle', subtitleClassName)}>
            {subtitle}
          </Typography>
        )}
        {scrolls ? <div className="auth-card__scroll">{children}</div> : children}
      </Paper>
    </PublicLayout>
  )
}
