import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { DaemonStatusResponse, PipelineVersion, PromptCandidate, PromptDiagnosticReport } from '../api/types'
import { FaultTelemetry } from '../components/FaultTelemetry'
import { Card } from '../components/shared'

type StudioTab = 'evolution' | 'daemon'

export function PromptStudioPage() {
  const [tab, setTab] = useState<StudioTab>('evolution')
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [baselinePrompt, setBaselinePrompt] = useState('')
  const [diagnosis, setDiagnosis] = useState<PromptDiagnosticReport | null>(null)
  const [candidates, setCandidates] = useState<PromptCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<PromptCandidate | null>(null)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [copied, setCopied] = useState(false)

  // Daemon state
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatusResponse | null>(null)
  const [intervalSec, setIntervalSec] = useState(3600)
  const [repeats, setRepeats] = useState(3)
  const [daemonMsg, setDaemonMsg] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [verList, basePromptRes, dStatus] = await Promise.all([
        api.listVersions(),
        api.getBaselinePrompt().catch(() => ({ baseline_prompt: '' })),
        api.getDaemonStatus().catch(() => null),
      ])
      setVersions(verList)
      setBaselinePrompt(basePromptRes.baseline_prompt)
      setDaemonStatus(dStatus)
      if (verList.length > 0) {
        setSelectedVersion(verList[0].label)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleDiagnose = async () => {
    if (!selectedVersion) return
    setLoading(true)
    try {
      const res = await api.diagnosePrompt(selectedVersion)
      setDiagnosis(res)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const handleMutate = async () => {
    if (!selectedVersion) return
    setMutating(true)
    try {
      const res = await api.mutatePrompt(selectedVersion, baselinePrompt, 'balanced')
      setDiagnosis(res.diagnosis)
      setCandidates(res.candidates)
      if (res.candidates.length > 0) {
        setSelectedCandidate(res.candidates[0])
      }
    } catch {
      // ignore
    } finally {
      setMutating(false)
    }
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStartDaemon = async () => {
    setActing(true)
    setDaemonMsg(null)
    try {
      const res = await api.startDaemon({ interval_seconds: intervalSec, repeats })
      setDaemonStatus(res)
      setDaemonMsg('Autonomous continuous evaluation daemon started.')
    } catch (err) {
      setDaemonMsg(err instanceof Error ? err.message : 'Failed to start daemon')
    } finally {
      setActing(false)
    }
  }

  const handleStopDaemon = async () => {
    setActing(true)
    setDaemonMsg(null)
    try {
      const res = await api.stopDaemon()
      setDaemonStatus(res)
      setDaemonMsg('Autonomous evaluation daemon stopped.')
    } catch (err) {
      setDaemonMsg(err instanceof Error ? err.message : 'Failed to stop daemon')
    } finally {
      setActing(false)
    }
  }

  const handleTriggerSweep = async () => {
    setActing(true)
    setDaemonMsg(null)
    try {
      await api.triggerSweep({ repeats })
      setDaemonMsg('Immediate evaluation sweep scheduled in background.')
    } catch (err) {
      setDaemonMsg(err instanceof Error ? err.message : 'Failed to trigger sweep')
    } finally {
      setActing(false)
    }
  }

  const isRunning = daemonStatus?.is_running ?? false

  return (
    <div className="section-gap">
      <h1>Prompt Studio & Automation Control</h1>
      <p className="help-text">
        Evolve prompts through AI genetic mutation, configure continuous background evaluation sweeps, and monitor auto-healing.
      </p>

      {/* Tab Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={tab === 'evolution' ? 'button-primary' : 'button-secondary'}
          onClick={() => setTab('evolution')}
        >
          ⚡ Prompt Evolution & AI Mutator
        </button>
        <button
          type="button"
          className={tab === 'daemon' ? 'button-primary' : 'button-secondary'}
          onClick={() => setTab('daemon')}
        >
          🔄 Continuous Daemon & Self-Healing
        </button>
      </div>

      {/* SUB-VIEW 1: PROMPT EVOLUTION */}
      {tab === 'evolution' && (
        <div className="section-gap">
          <Card title="1. Select Version & Diagnose Weaknesses">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
              <label className="text-input-label" style={{ margin: 0 }}>
                Target Pipeline Version:
              </label>
              <select
                className="text-input"
                style={{ width: '220px' }}
                value={selectedVersion}
                onChange={(e) => setSelectedVersion(e.target.value)}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.label}>
                    {v.label} (Score: {v.score_stats.mean?.toFixed(1) ?? '—'})
                  </option>
                ))}
              </select>
              <button type="button" className="button-secondary" onClick={handleDiagnose} disabled={loading || !selectedVersion}>
                {loading ? 'Analyzing Errors…' : 'Run Error Diagnosis'}
              </button>
              <button type="button" className="button-primary" onClick={handleMutate} disabled={mutating || !selectedVersion}>
                {mutating ? 'Synthesizing Mutations…' : '⚡ Auto-Mutate Prompt Candidates'}
              </button>
            </div>

            {diagnosis && (
              <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)', marginTop: '1rem' }}>
                <h4 style={{ margin: '0 0 0.5rem', color: 'var(--color-accent-teal)' }}>
                  Diagnostic Synthesis ({diagnosis.total_runs} runs analyzed, {diagnosis.low_score_count} low-scoring)
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
                  <div>
                    <strong>Key Recommendations:</strong>
                    <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
                      {diagnosis.recommendations.map((r, i) => (
                        <li key={i} style={{ marginBottom: '0.25rem' }}>{r}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <strong>Weakness Breakdown:</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                      <span>• Precision false alarms: {diagnosis.diagnostics.precision_weaknesses.length} runs</span>
                      <span>• Recall missed deviations: {diagnosis.diagnostics.recall_weaknesses.length} runs</span>
                      <span>• Severity misclassifications: {diagnosis.diagnostics.severity_weaknesses.length} runs</span>
                      <span>• Scope violations: {diagnosis.diagnostics.scope_weaknesses.length} runs</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {candidates.length > 0 && (
            <Card title="2. Evolved Prompt Candidates">
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {candidates.map((c, i) => (
                  <button
                    key={i}
                    type="button"
                    className={selectedCandidate?.name === c.name ? 'button-primary' : 'button-secondary'}
                    onClick={() => setSelectedCandidate(c)}
                  >
                    {c.name}
                  </button>
                ))}
              </div>

              {selectedCandidate && (
                <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <div>
                      <h4 style={{ margin: 0 }}>{selectedCandidate.name}</h4>
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-accent-teal)' }}>
                        Strategy: {selectedCandidate.strategy}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="button-primary"
                      onClick={() => handleCopy(selectedCandidate.mutated_prompt)}
                    >
                      {copied ? '✓ Copied to Clipboard' : 'Copy Mutated Prompt'}
                    </button>
                  </div>

                  <pre
                    style={{
                      maxHeight: '400px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      background: 'var(--color-background)',
                      padding: '1rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.8rem',
                      lineHeight: '1.4',
                    }}
                  >
                    {selectedCandidate.mutated_prompt}
                  </pre>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* SUB-VIEW 2: CONTINUOUS DAEMON & TELEMETRY */}
      {tab === 'daemon' && (
        <div className="section-gap">
          <Card title="Autonomous Evaluation Daemon Controls">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <strong>Daemon State: </strong>
                {isRunning ? (
                  <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>● RUNNING (Continuous Mode)</span>
                ) : (
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 600 }}>○ STOPPED</span>
                )}
                {daemonStatus?.last_sweep_at && (
                  <span style={{ marginLeft: '1rem', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    Last Sweep: {daemonStatus.last_sweep_at} (Total Sweeps: {daemonStatus.total_sweeps})
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {isRunning ? (
                  <button
                    type="button"
                    className="button-secondary"
                    style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)' }}
                    onClick={handleStopDaemon}
                    disabled={acting}
                  >
                    Stop Daemon
                  </button>
                ) : (
                  <button
                    type="button"
                    className="button-primary"
                    onClick={handleStartDaemon}
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

            {daemonMsg && (
              <p style={{ padding: '0.5rem 0.75rem', borderRadius: '4px', background: 'var(--color-surface)', border: '1px solid var(--color-border)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                {daemonMsg}
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
                  Repeats per Document
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
            </div>
          </Card>

          <FaultTelemetry />
        </div>
      )}
    </div>
  )
}
