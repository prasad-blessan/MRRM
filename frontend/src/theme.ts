import { createTheme } from '@mui/material/styles'

// MUI reads its colours and fonts from the CSS tokens in styles.css, so styles.css is the single place to change them.
// nativeColor lets the palette hold CSS variables (MUI derives hover/alpha shades with color-mix()).
// All visual overrides live in styles.css (@layer theme); this file only maps tokens and sets behaviour defaults.
export const theme = createTheme({
  cssVariables: { nativeColor: true },
  palette: {
    primary: { main: 'var(--color-primary)', dark: 'var(--color-primary-dark)', light: 'var(--color-primary-soft)', contrastText: '#fff' },
    text: { primary: 'var(--color-text)', secondary: 'var(--color-text-muted)' },
    background: { default: 'var(--color-bg)', paper: 'var(--color-surface)' },
    divider: 'var(--color-divider)',
  },
  shape: { borderRadius: 10 },
  typography: { fontFamily: 'var(--font-body)' },
  components: {
    MuiLink: { defaultProps: { underline: 'hover' } },
  },
})
