import { useEffect, useState } from 'react'
import type { BatchStatus } from '../api/types'
import { api } from '../api/client'

export function usePollBatch(batchId: number | null, intervalMs = 5000) {
  const [status, setStatus] = useState<BatchStatus | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (batchId == null) return

    let active = true
    let timer: ReturnType<typeof setTimeout>

    const poll = async () => {
      try {
        const s = await api.getBatch(batchId)
        if (!active) return
        setStatus(s)
        setError(null)
        if (s.status === 'running') {
          timer = setTimeout(poll, intervalMs)
        }
      } catch (e) {
        if (active) {
          setError(e instanceof Error ? e.message : 'Poll failed')
          timer = setTimeout(poll, intervalMs)
        }
      }
    }

    poll()
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [batchId, intervalMs])

  return { status, error }
}
