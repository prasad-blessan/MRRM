import { Typography } from '@mui/material'
import { useId } from 'react'
import levelShiftLogo from '../assets/levelshift-logo.png'
import { cx } from '../lib/cx'

// MRRM mark redrawn from the MRRM v8 design; replace with the official SVG when available.

// SVG ids must be unique per instance: a gradient inside a hidden copy of a logo would not render.
const useSvgId = (name: string) => `${name}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`

// Size the logos with a className (CSS width).
type LogoProps = { className?: string }

export function MrrmMark({ className }: LogoProps) {
  const teal = useSvgId('mrrm-teal')
  const blue = useSvgId('mrrm-blue')
  return (
    <svg viewBox="0 0 64 72" aria-hidden="true" className={cx('brand-mark', className)}>
      <defs>
        <linearGradient id={teal} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1fc0dc" />
          <stop offset="1" stopColor="#119fc4" />
        </linearGradient>
        <linearGradient id={blue} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f6ff0" />
          <stop offset="1" stopColor="#2049cf" />
        </linearGradient>
      </defs>
      <path d="M27 5 6 17v38l21 12" fill="none" stroke={`url(#${teal})`} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M6 36h18M17 25v22" stroke={`url(#${teal})`} strokeWidth="6" strokeLinecap="round" />
      <path d="M34 3 58 16v40L34 69z" fill={`url(#${blue})`} />
      <path d="M41 26h10M41 36h10M41 46h10" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
    </svg>
  )
}

// Full size is measured from the 1920px design; compact is the fixed phone header size.
export function MrrmLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cx('brand-logo', compact && 'brand-logo--compact', className)}>
      <MrrmMark className="brand-logo__mark" />
      <Typography component="span" className="brand-logo__word">
        MRRM
      </Typography>
      <div className="brand-logo__divider">
        <Typography component="span" className="brand-logo__sub">
          MEDICAL RECORDS
          <br />
          REVIEW MANAGEMENT
        </Typography>
      </div>
    </div>
  )
}

// Official LevelShift wordmark (592 x 67).
// Size it with a className (CSS width).
export function LevelShiftLogo({ className }: LogoProps) {
  return (
    <img
      src={levelShiftLogo}
      alt="LevelShift"
      className={cx('brand-levelshift', className)}
    />
  )
}
