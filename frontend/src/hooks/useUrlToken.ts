import { useState } from 'react'

// Reads ?token= once, then removes it from the address bar and history so it is not
// leaked through screenshots, shared URLs or the Referer header.
export function useUrlToken(): string | null {
  const [token] = useState(() => {
    const url = new URL(window.location.href)
    const value = url.searchParams.get('token')
    if (value) {
      url.searchParams.delete('token')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
    return value
  })
  return token
}
