import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DaemonStatusResponse } from '../api/types'
import { FaultTelemetry } from '../components/FaultTelemetry'
import { Card } from '../components/shared'

export function AutoEvalPage() {
  const [status, setStatus] = useState<DaemonStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [intervalSec, setIntervalSec] = useState(3600)
  const [repeats, setRepeats] = useState(3)
  const [docsDir, setDocsDir] = useState('sample_docs')
  const [message, setMessage] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.getDaemonStatus()
      setStatus(res)
      if (res.interval_seconds) setIntervalSec(res.interval_seconds)
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStatus()
    const timer = setInterval(loadStatus, 4000)
    return () => clearInterval(timer)
  }, [loadStatus])

  const handleStart = async () => {
    setActing(true)
    setMessage(null)
    try {
      const res = await api.startDaemon({
        interval_seconds: intervalSec,
        docs_dir: docsDir,
        repeats,
      })
      setStatus(res)
      setMessage('Autonomous daemon started successfully.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to start daemon')
    } finally {
      setActing(false)
    }
  }

  const handleStop = async () => {
    setActing(true)
    setMessage(null)
    try {
      const res = await api.stopDaemon()
      setStatus(res)
      setMessage('Autonomous daemon stopped.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to stop daemon')
    } finally {
      setActing(false)
    }
  }

  const handleTriggerSweep = async () => {
    setActing(true)
    setMessage(null)
    try {
      await api.triggerSweep({
        docs_dir: docsDir,
        repeats,
      })
      setMessage('Immediate evaluation sweep scheduled and running in background.')
      await loadStatus()
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to trigger sweep')
    } finally {
      setActing(false)
    }
  }

  if (loading && !status) return <p className="loading-state">Loading autonomous daemon status…</p>

  const isRunning = status?.is_running ?? false

  return (
    <div className="section-gap">
      <h1>Autonomous Evaluation & Self-Healing</h1>
      <p className="help-text">
        Continuous unattended evaluation sweeps with automated fault detection, GPU task recovery, and Gemini LLM judging.
      </p>

      <Card title="Daemon Control & Schedule">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <strong>Status: </strong>
            {isRunning ? (
              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>● RUNNING (Continuous Mode)</span>
            ) : (
              <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>○ STOPPED</span>
            )}
            {status?.last_sweep_at && (
              <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Last Sweep: {status.last_sweep_at} (Total: {status.total_sweeps})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {isRunning ? (
              <button
                type="button"
                className="button-secondary"
                style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                onClick={handleStop}
                disabled={acting}
              >
                Stop Daemon
              </button>
            ) : (
              <button
                type="button"
                className="button-primary"
                onClick={handleStart}
                disabled={acting}
              >
                Start Continuous Daemon
              </button>
            )}
            <button
              type="button"
              className="button-primary"
              style={{ background: 'var(--color-accent-teal)', borderColor: 'var(--color-accent-teal)' }}
              onClick={handleTriggerSweep}
              disabled={acting}
            >
              Trigger Immediate Sweep
            </button>
          </div>
        </div>

        {message && (
          <p style={{ padding: '0.5rem 0.75rem', borderRadius: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', marginBottom: '1rem', fontSize: '0.9rem' }}>
            {message}
          </p>
        )}

        <div className="form-row">
          <div>
            <label className="text-input-label" htmlFor="interval">
              Sweep Interval (Seconds)
            </label>
            <input
              id="interval"
              type="number"
              min={60}
              className="text-input"
              value={intervalSec}
              onChange={(e) => setIntervalSec(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="text-input-label" htmlFor="repeats">
              Repeats per Doc
            </label>
            <input
              id="repeats"
              type="number"
              min={1}
              max={20}
              className="text-input"
              value={repeats}
              onChange={(e) => setRepeats(Number(e.target.value))}
              disabled={isRunning}
            />
          </div>
          <div>
            <label className="text-input-label" htmlFor="docsDir">
              Docs Corpus Path
            </label>
            <input
              id="docsDir"
              className="text-input"
              value={docsDir}
              onChange={(e) => setDocsDir(e.target.value)}
              disabled={isRunning}
            />
          </div>
        </div>
      </Card>

      <FaultTelemetry />
    </div>
  )
}
