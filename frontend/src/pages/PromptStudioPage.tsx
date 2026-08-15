import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { PipelineVersion, PromptCandidate, PromptDiagnosticReport } from '../api/types'
import { Card } from '../components/shared'

export function PromptStudioPage() {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState('')
  const [baselinePrompt, setBaselinePrompt] = useState('')
  const [diagnosis, setDiagnosis] = useState<PromptDiagnosticReport | null>(null)
  const [candidates, setCandidates] = useState<PromptCandidate[]>([])
  const [selectedCandidate, setSelectedCandidate] = useState<PromptCandidate | null>(null)
  const [loading, setLoading] = useState(false)
  const [mutating, setMutating] = useState(false)
  const [copied, setCopied] = useState(false)

  const loadData = useCallback(async () => {
    try {
      const [verList, basePromptRes] = await Promise.all([
        api.listVersions(),
        api.getBaselinePrompt(),
      ])
      setVersions(verList)
      setBaselinePrompt(basePromptRes.baseline_prompt)
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

  return (
    <div className="section-gap">
      <h1>Autonomous Prompt Evolution Studio</h1>
      <p className="help-text">
        AI-driven failure diagnosis and genetic prompt mutation engine. Evolve prompt candidates based on actual model errors.
      </p>

      <Card title="1. Select Version & Diagnose Weaknesses">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
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
                {v.label} (Score: {v.score_stats.mean ?? '—'})
              </option>
            ))}
          </select>
          <button type="button" className="button-secondary" onClick={handleDiagnose} disabled={loading}>
            {loading ? 'Analyzing Errors…' : 'Run Error Diagnosis'}
          </button>
          <button type="button" className="button-primary" onClick={handleMutate} disabled={mutating}>
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
  )
}
