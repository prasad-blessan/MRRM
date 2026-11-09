import '@fontsource-variable/inter/index.css'
import './styles.css'
import { CssBaseline, GlobalStyles, StyledEngineProvider, ThemeProvider } from '@mui/material'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App.tsx'
import { AuthProvider } from './auth/AuthProvider'
import { theme } from './theme'

// enableCssLayer puts MUI's styles in `@layer mui`, so the later layers in styles.css override them.
// MUI inserts its styles at the top of <head>, so the layer order must be its first global style
// (same list as the top of styles.css).
const LAYER_ORDER = '@layer tokens, reset, base, mui, theme, layout, components, pages, utilities;'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StyledEngineProvider enableCssLayer>
      <GlobalStyles styles={LAYER_ORDER} />
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </StyledEngineProvider>
  </StrictMode>,
)
