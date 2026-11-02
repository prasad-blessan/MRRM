import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin API calls in development so the session cookie stays SameSite=Strict.
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
