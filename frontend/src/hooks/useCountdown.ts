import { useEffect, useState } from 'react'

// Whole seconds remaining until `target` (epoch ms), updated every second.
// Mount the caller when the countdown starts so the first value is current.
export function useCountdown(target: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (target === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [target])

  return target === null ? 0 : Math.max(0, Math.ceil((target - now) / 1000))
}

export function formatMmSs(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
