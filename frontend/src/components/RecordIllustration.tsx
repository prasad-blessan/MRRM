import { useId } from 'react'
import { cx } from '../lib/cx'

const BARS = [
  { width: 196, teal: false },
  { width: 188, teal: false },
  { width: 140, teal: false },
  { width: 186, teal: true },
  { width: 128, teal: false },
  { width: 196, teal: false },
  { width: 150, teal: false },
]

// Gentle float from the design video (keyframes in styles: .record-illus-*): the card and each chip bob on their
// own beat, the arc's dots drift. Animations wrap the drawn groups so the CSS transform does not replace their SVG
// transform attribute.

const LABEL = { fontFamily: '"Inter Variable", sans-serif', fontSize: 19, fontWeight: 500, fill: '#0d154e' }

// Decorative medical-record card from the sign-in design, drawn on the design's 1920px grid.
// Size it with a className (CSS width).
export function RecordIllustration({ className }: { className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const shadow = `rec-shadow-${id}`
  const back = `rec-back-${id}`

  return (
    <svg viewBox="0 0 500 640" aria-hidden="true" className={cx('record-illus', className)}>
      <defs>
        <filter id={shadow} x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="14" stdDeviation="16" floodColor="#0d154e" floodOpacity="0.12" />
        </filter>
        <linearGradient id={back} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#cfe0fc" />
          <stop offset="1" stopColor="#b8cff9" />
        </linearGradient>
      </defs>

      <path
        className="record-illus-arc"
        d="M176 142 C 196 70, 280 12, 372 16"
        fill="none"
        stroke="#9dbcf2"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeDasharray="0 10"
      />

      <rect x="165" y="140" width="270" height="420" rx="28" fill={`url(#${back})`} transform="rotate(8 300 350)" />

      <g className="record-illus-card">
        <rect x="60" y="190" width="300" height="400" rx="30" fill="#ffffff" opacity="0.6" transform="rotate(-10 210 390) translate(-10 -22)" />

        <g transform="rotate(-10 220 410)" filter={`url(#${shadow})`}>
          <rect x="70" y="210" width="300" height="400" rx="30" fill="#ffffff" />
          <rect x="106" y="262" width="56" height="56" rx="14" fill="#e9f0fd" />
          <path d="M134 278v24M122 290h24" stroke="#1f6ff0" strokeWidth="3.6" strokeLinecap="round" />
          <text x="178" y="298" {...LABEL} fontSize="23" fontWeight="600">
            Medical Record
          </text>
          {BARS.map((bar, i) => (
            <rect key={i} x="106" y={350 + i * 30} width={bar.width} height="12" rx="6" fill={bar.teal ? '#3dcbc2' : '#e7ecf4'} />
          ))}
        </g>
      </g>

      <g filter={`url(#${shadow})`}>
        <g className="record-illus-chip">
          <rect x="103" y="175" width="157" height="50" rx="12" fill="#ffffff" />
          <path d="M124 191h9l9 9-9 9h-9z" fill="#17a7b0" transform="rotate(45 130 200) translate(-2 0)" />
          <circle cx="128" cy="196" r="2" fill="#ffffff" />
          <text x="155" y="207" {...LABEL}>
            Classified
          </text>
        </g>

        <g className="record-illus-chip record-illus-chip--2">
          <rect x="298" y="330" width="194" height="50" rx="12" fill="#ffffff" />
          <path d="M319 345v20M319 365h16" stroke="#7c5cf0" strokeWidth="2" strokeLinecap="round" />
          <path d="M324 360v-6M329 360v-10M334 360v-4" stroke="#7c5cf0" strokeWidth="2.6" strokeLinecap="round" />
          <text x="353" y="362" {...LABEL} fontWeight="600">
            48 data points
          </text>
        </g>

        <g className="record-illus-chip record-illus-chip--3">
          <g transform="rotate(-4 298 529)">
            <rect x="187" y="498" width="222" height="62" rx="14" fill="#ffffff" />
            <circle cx="226" cy="529" r="19" fill="#12a36b" />
            <path d="M217 529l6 6 12-12" fill="none" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
            <text x="257" y="536" {...LABEL}>
              Summary ready
            </text>
          </g>
        </g>
      </g>
    </svg>
  )
}
