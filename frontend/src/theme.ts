import { createTheme } from '@mui/material/styles'

// Colours chosen for WCAG 2.1 AA contrast (SEC-07).
export const theme = createTheme({
  palette: {
    primary: { main: '#0b5cad' },
    secondary: { main: '#37474f' },
    background: { default: '#f4f6f9' },
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  components: {
    MuiLink: { defaultProps: { underline: 'hover' } },
  },
})
