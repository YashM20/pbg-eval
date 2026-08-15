import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { UnifiedVersionWorkspaceResponse } from '../api/types'
import { VarianceChart } from '../components/Charts'
import { MetadataDiffViewer } from '../components/MetadataDiffViewer'
import { Card, formatJson, StatusBadge } from '../components/shared'
import { TraceViewer } from '../components/TraceViewer'

type WorkspaceTab = 'runs' | 'clauses' | 'extraction'

export function VersionWorkspacePage() {
  const { label = '' } = useParams()
  const [data, setData] = useState<UnifiedVersionWorkspaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<WorkspaceTab>('runs')
  const [filterDoc, setFilterDoc] = useState('')
  const [openAuditRunId, setOpenAuditRunId] = useState<number | null>(null)
  const [openExtractRunId, setOpenExtractRunId] = useState<number | null>(null)
  const [openTraceRunId, setOpenTraceRunId] = useState<number | null>(null)
  const [openProvenance, setOpenProvenance] = useState(false)
  const [regradingRunId, setRegradingRunId] = useState<number | null>(null)
  const [replayingRunId, setReplayingRunId] = useState<number | null>(null)
  const [grading, setGrading] = useState(false)
  const [gradeResult, setGradeResult] = useState<string | null>(null)
  const [copiedPrompt, setCopiedPrompt] = useState(false)

  const load = useCallback(async () => {
    if (!label) return
    setLoading(true)
    try {
      const res = await api.getVersionWorkspace(label)
      setData(res)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load version workspace')
    } finally {
      setLoading(false)
    }
  }, [label])

  useEffect(() => {
    load()
  }, [load])

  const handleGradeAll = async () => {
    setGrading(true)
    setGradeResult(null)
    try {
      const res = await api.gradeVersion(label)
      setGradeResult(`Graded ${res.graded} comparison runs, ${res.excluded} excluded.`)
      await load()
    } catch (e) {
      setGradeResult(e instanceof Error ? e.message : 'Grade failed')
    } finally {
      setGrading(false)
    }
  }

  const handleRegradeSingle = async (runId: number) => {
    setRegradingRunId(runId)
    try {
      await api.regradeRun(runId)
      await load()
    } catch {
      // ignore
    } finally {
      setRegradingRunId(null)
    }
  }

  const handleReplayRun = async (runId: number) => {
    setReplayingRunId(runId)
    try {
      const res = await api.replayRun(runId)
      setGradeResult(`Run #${runId} replayed successfully as Run #${res.new_run_id}.`)
      await load()
    } catch (e) {
      setGradeResult(e instanceof Error ? e.message : 'Replay failed')
    } finally {
      setReplayingRunId(null)
    }
  }

  const copyPromptText = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  if (loading && !data) return <p className="loading-state">Loading version workspace for {label}…</p>
  if (error && !data) return <p className="error-state">{error}</p>
  if (!data) return null

  const { version, summary, health_insights, runs, variance_by_doc, clause_matrix, extraction_breakdown } = data

  const filteredRuns = filterDoc
    ? runs.filter((r) => r.doc_id.toLowerCase().includes(filterDoc.toLowerCase()))
    : runs

  const scoredRuns = filteredRuns
    .filter((r) => r.status === 'scored')
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
  const excludedRuns = filteredRuns.filter((r) => r.status === 'excluded')
  const pendingRuns = filteredRuns.filter((r) => r.status === 'pending')

  return (
    <div className="section-gap">
      {/* Breadcrumb & Top Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ margin: 0 }}>
          <Link to="/versions">← Versions Leaderboard</Link>
        </p>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <button
            type="button"
            className="button-secondary"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
            onClick={() => setOpenProvenance(!openProvenance)}
          >
            🔬 {openProvenance ? 'Hide Provenance' : 'Reproducibility & Provenance'}
          </button>
          <Link
            to={`/compare?v2=${encodeURIComponent(label)}`}
            className="button-secondary"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
          >
            Compare with Prior ↗
          </Link>
          <a
            href={`/api/gates/export/html?version=${encodeURIComponent(label)}`}
            target="_blank"
            rel="noreferrer"
            className="button-primary"
            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', background: '#0d9488', borderColor: '#0d9488' }}
          >
            Export Compliance Report ↗
          </a>
        </div>
      </div>

      {/* Header Banner */}
      <div style={{ background: 'var(--color-surface)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem' }}>{version.label}</h1>
            <p className="mono" style={{ margin: '0.35rem 0 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
              Prompt Hash: {version.prompt_hash} | Model: {version.model_config || 'qwen2.5:32b'} | Created: {version.created_at?.slice(0, 19)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--color-background)', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Comparison Score</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (summary.score_stats.mean ?? 0) >= 8.0 ? '#10b981' : '#f59e0b' }}>
                {summary.score_stats.mean?.toFixed(1) ?? '—'} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>/ 10</span>
              </div>
            </div>
            <div style={{ background: 'var(--color-background)', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Metadata Extraction</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: (summary.overall_extraction_score ?? 0) >= 8.0 ? '#0d9488' : '#f59e0b' }}>
                {summary.overall_extraction_score ? summary.overall_extraction_score.toFixed(1) : '—'} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>/ 10</span>
              </div>
            </div>
            <div style={{ background: 'var(--color-background)', padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--color-border)', textAlign: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Exclusion Rate</span>
              <div style={{ fontSize: '1.4rem', fontWeight: 700, color: summary.exclusion_rate > 0.05 ? '#ef4444' : 'inherit' }}>
                {(summary.exclusion_rate * 100).toFixed(1)}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Provenance & Reproducibility Drawer */}
      {openProvenance && (
        <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: '8px', border: '1px solid var(--color-accent-teal)', marginTop: '0.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, color: 'var(--color-accent-teal)' }}>
              🔬 Evaluation Provenance & Scientific Reproducibility Block
            </h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Deterministic snapshot of models, seeds, parameters, and prompts
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ background: 'var(--color-background)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Ollama Model Tag</span>
              <div className="mono" style={{ fontSize: '0.9rem', fontWeight: 600 }}>{version.model_config || 'qwen2.5:32b'}</div>
            </div>
            <div style={{ background: 'var(--color-background)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Inference Parameters</span>
              <div className="mono" style={{ fontSize: '0.85rem' }}>temp=0.1, ctx=50k, rep_p=1.7</div>
            </div>
            <div style={{ background: 'var(--color-background)', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>LLM Judge</span>
              <div className="mono" style={{ fontSize: '0.85rem' }}>gemini-2.0-flash (Two-Call Derive & Score)</div>
            </div>
          </div>
          {version.prompt_text && (
            <div style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Verbatim System Prompt Snapshot:</span>
                <button
                  type="button"
                  className="audit-toggle"
                  onClick={() => copyPromptText(version.prompt_text || '')}
                >
                  {copiedPrompt ? '✓ Copied' : 'Copy Prompt'}
                </button>
              </div>
              <pre style={{ maxHeight: '150px', overflowY: 'auto', background: 'var(--color-background)', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)', fontSize: '0.75rem' }}>
                {version.prompt_text}
              </pre>
            </div>
          )}
          {version.notes && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Run Notes:</span>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.85rem' }}>{version.notes}</p>
            </div>
          )}
        </div>
      )}

      {/* Zero-Click Proactive AI Health Card */}
      <div
        style={{
          background: health_insights.status === 'Healthy' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
          border: health_insights.status === 'Healthy' ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: '8px',
          padding: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <strong style={{ color: health_insights.status === 'Healthy' ? '#10b981' : '#f59e0b', fontSize: '0.95rem' }}>
            ⚡ Proactive AI Health Insights: {health_insights.status}
          </strong>
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            Auto-synthesized from {summary.total_runs} runs & {clause_matrix.length} sections
          </span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Key Weakness Observations:</span>
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
              {health_insights.weaknesses.length > 0 ? (
                health_insights.weaknesses.map((w, i) => <li key={i} style={{ color: '#f59e0b' }}>{w}</li>)
              ) : (
                <li style={{ color: '#10b981' }}>No recurring weakness patterns detected. Model execution is well-balanced.</li>
              )}
            </ul>
          </div>
          <div>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>Top Actionable Recommendations:</span>
            <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
              {health_insights.recommendations.map((r, i) => (
                <li key={i} style={{ color: 'var(--color-text)' }}>{r}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Workspace Tab Switcher */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <button
          type="button"
          className={tab === 'runs' ? 'button-primary' : 'button-secondary'}
          onClick={() => setTab('runs')}
        >
          Scored Runs & Traces ({runs.length})
        </button>
        <button
          type="button"
          className={tab === 'clauses' ? 'button-primary' : 'button-secondary'}
          onClick={() => setTab('clauses')}
        >
          Clause Confusion Matrix ({clause_matrix.length} sections)
        </button>
        <button
          type="button"
          className={tab === 'extraction' ? 'button-primary' : 'button-secondary'}
          onClick={() => setTab('extraction')}
        >
          Metadata Extraction Quality ({extraction_breakdown.length} fields)
        </button>
      </div>

      {/* TAB 1: RUNS & TRACES */}
      {tab === 'runs' && (
        <div className="section-gap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Filter by doc ID..."
              className="text-input"
              style={{ width: '220px' }}
              value={filterDoc}
              onChange={(e) => setFilterDoc(e.target.value)}
            />
            <button
              type="button"
              className="button-primary"
              onClick={handleGradeAll}
              disabled={grading}
            >
              {grading ? 'Evaluating…' : 'Grade All Pending Runs'}
            </button>
          </div>

          {gradeResult && <p className="help-text">{gradeResult}</p>}

          <Card title="Document Variance Breakdown">
            <VarianceChart variance={variance_by_doc} />
          </Card>

          <Card title={`Scored Runs (${scoredRuns.length})`}>
            {scoredRuns.length === 0 ? (
              <p className="empty-state">No scored runs matching filter.</p>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Doc ID</th>
                    <th>Time</th>
                    <th style={{ textAlign: 'right' }}>Comp Score</th>
                    <th style={{ textAlign: 'right' }}>Extract Score</th>
                    <th style={{ textAlign: 'right' }}>Recall</th>
                    <th style={{ textAlign: 'right' }}>Precision</th>
                    <th style={{ textAlign: 'right' }}>Severity</th>
                    <th style={{ textAlign: 'right' }}>Schema</th>
                    <th style={{ textAlign: 'center' }}>Heals</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {scoredRuns.map((r) => {
                    const isAuditOpen = openAuditRunId === r.id
                    const isExtractOpen = openExtractRunId === r.id
                    const isTraceOpen = openTraceRunId === r.id

                    return (
                      <>
                        <tr key={r.id}>
                          <td className="mono" style={{ fontWeight: 600 }}>
                            {r.doc_id} {r.is_replay ? <span style={{ fontSize: '0.7rem', color: '#0d9488' }}>(Replay)</span> : ''}
                          </td>
                          <td className="mono">{r.timestamp?.slice(0, 19)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: (r.overall_score ?? 0) >= 7.5 ? '#10b981' : '#f59e0b' }}>
                            {r.overall_score?.toFixed(1) ?? '—'}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: (r.overall_extraction_score ?? 0) >= 7.5 ? '#0d9488' : '#f59e0b' }}>
                            {r.overall_extraction_score ? r.overall_extraction_score.toFixed(1) : (r.extraction_ok ? '✓' : '✗')}
                          </td>
                          <td style={{ textAlign: 'right' }}>{r.deviation_recall ?? '—'}</td>
                          <td style={{ textAlign: 'right' }}>{r.deviation_precision ?? '—'}</td>
                          <td style={{ textAlign: 'right' }}>{r.severity_correctness ?? '—'}</td>
                          <td style={{ textAlign: 'right' }}>{r.schema_integrity ?? '—'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {(r.heal_count ?? 0) > 0 ? (
                              <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{r.heal_count}</span>
                            ) : (
                              '0'
                            )}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.35rem' }}>
                              {(r.grader_notes || r.independent_read) && (
                                <button
                                  type="button"
                                  className="audit-toggle"
                                  onClick={() => setOpenAuditRunId(isAuditOpen ? null : r.id)}
                                >
                                  {isAuditOpen ? 'Hide' : 'Grader'}
                                </button>
                              )}
                              {r.field_discrepancies && r.field_discrepancies.length > 0 && (
                                <button
                                  type="button"
                                  className="audit-toggle"
                                  style={{ borderColor: '#0d9488', color: '#0d9488' }}
                                  onClick={() => setOpenExtractRunId(isExtractOpen ? null : r.id)}
                                >
                                  {isExtractOpen ? 'Hide' : 'Extract'}
                                </button>
                              )}
                              {r.has_trace && (
                                <button
                                  type="button"
                                  className="audit-toggle"
                                  style={{ borderColor: 'var(--color-accent-teal)', color: 'var(--color-accent-teal)' }}
                                  onClick={() => setOpenTraceRunId(isTraceOpen ? null : r.id)}
                                >
                                  {isTraceOpen ? 'Hide' : 'Trace'}
                                </button>
                              )}
                              <button
                                type="button"
                                className="audit-toggle"
                                title="Regrade with LLM Judge"
                                onClick={() => handleRegradeSingle(r.id)}
                                disabled={regradingRunId === r.id}
                              >
                                {regradingRunId === r.id ? '…' : '↻'}
                              </button>
                              <button
                                type="button"
                                className="audit-toggle"
                                title="Replay run on backend"
                                onClick={() => handleReplayRun(r.id)}
                                disabled={replayingRunId === r.id}
                              >
                                {replayingRunId === r.id ? '…' : '↺'}
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isAuditOpen && (
                          <tr>
                            <td colSpan={10}>
                              <div className="audit-panel">
                                <strong>Gemini Grader Notes</strong>
                                <pre>{r.grader_notes || '—'}</pre>
                                <strong>Independent Ground-Truth Derivation</strong>
                                <pre>{formatJson(r.independent_read)}</pre>
                              </div>
                            </td>
                          </tr>
                        )}

                        {isExtractOpen && r.field_discrepancies && (
                          <tr>
                            <td colSpan={10}>
                              <MetadataDiffViewer
                                fieldDiscrepancies={r.field_discrepancies}
                                overallScore={r.overall_extraction_score || 0}
                              />
                            </td>
                          </tr>
                        )}

                        {isTraceOpen && r.has_trace && (
                          <tr>
                            <td colSpan={10}>
                              <TraceViewer runId={r.id} traceText={r.thinking_trace} />
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            )}
          </Card>

          {pendingRuns.length > 0 && (
            <Card title={`Pending Evaluation Runs (${pendingRuns.length})`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Doc ID</th>
                    <th>Time</th>
                    <th>Status</th>
                    <th>Heals</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingRuns.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.doc_id}</td>
                      <td className="mono">{r.timestamp?.slice(0, 19)}</td>
                      <td><StatusBadge status={r.status} /></td>
                      <td>{r.heal_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {excludedRuns.length > 0 && (
            <Card title={`Excluded Runs (${excludedRuns.length})`}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Doc ID</th>
                    <th>Time</th>
                    <th>Reason</th>
                    <th>Heals</th>
                  </tr>
                </thead>
                <tbody>
                  {excludedRuns.map((r) => (
                    <tr key={r.id}>
                      <td className="mono">{r.doc_id}</td>
                      <td className="mono">{r.timestamp?.slice(0, 19)}</td>
                      <td className="mono" style={{ color: 'var(--color-warning)' }}>{r.exclusion_reason ?? '—'}</td>
                      <td>{r.heal_count || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
      )}

      {/* TAB 2: CLAUSE CONFUSION MATRIX */}
      {tab === 'clauses' && (
        <div className="section-gap">
          <Card title="Section Accuracy Confusion Matrix">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th style={{ textAlign: 'right' }}>TP</th>
                  <th style={{ textAlign: 'right' }}>FP</th>
                  <th style={{ textAlign: 'right' }}>FN</th>
                  <th style={{ textAlign: 'right' }}>Recall</th>
                  <th style={{ textAlign: 'right' }}>Precision</th>
                  <th style={{ textAlign: 'right' }}>F1 Score</th>
                  <th style={{ textAlign: 'right' }}>Critical</th>
                  <th style={{ textAlign: 'right' }}>Major</th>
                  <th style={{ textAlign: 'right' }}>Minor</th>
                </tr>
              </thead>
              <tbody>
                {clause_matrix.map((sec) => (
                  <tr key={sec.section}>
                    <td style={{ fontWeight: 600 }}>{sec.section}</td>
                    <td style={{ textAlign: 'right' }}>{sec.true_positives}</td>
                    <td style={{ textAlign: 'right', color: sec.false_positives > 0 ? '#ef4444' : 'inherit' }}>
                      {sec.false_positives}
                    </td>
                    <td style={{ textAlign: 'right', color: sec.false_negatives > 0 ? '#f59e0b' : 'inherit' }}>
                      {sec.false_negatives}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: sec.recall >= 0.9 ? '#10b981' : '#f59e0b' }}>
                      {(sec.recall * 100).toFixed(0)}%
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: sec.precision >= 0.9 ? '#10b981' : '#f59e0b' }}>
                      {(sec.precision * 100).toFixed(0)}%
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {sec.f1_score.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{sec.critical_count}</td>
                    <td style={{ textAlign: 'right' }}>{sec.major_count}</td>
                    <td style={{ textAlign: 'right' }}>{sec.minor_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Error Anomaly Cluster Cards */}
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ color: 'var(--color-accent-teal)' }}>Identified Section Anomaly Clusters</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
                {clause_matrix
                  .filter((s) => s.sample_errors && s.sample_errors.length > 0)
                  .map((s) => (
                    <div
                      key={s.section}
                      style={{
                        background: 'var(--color-surface)',
                        padding: '1rem',
                        borderRadius: '6px',
                        border: '1px solid var(--color-border)',
                      }}
                    >
                      <strong style={{ fontSize: '0.9rem' }}>{s.section}</strong>
                      <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {s.sample_errors.map((err, i) => (
                          <div
                            key={i}
                            style={{
                              fontSize: '0.8rem',
                              padding: '0.4rem 0.6rem',
                              background: err.type.includes('Positive') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                              borderLeft: err.type.includes('Positive') ? '3px solid #ef4444' : '3px solid #f59e0b',
                              borderRadius: '4px',
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{err.type} ({err.doc_id}): </span>
                            {err.details}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: METADATA EXTRACTION QUALITY */}
      {tab === 'extraction' && (
        <div className="section-gap">
          <Card title="8-Field Metadata Extraction Performance">
            {extraction_breakdown.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                {extraction_breakdown.map((f) => (
                  <div
                    key={f.field}
                    style={{
                      background: 'var(--color-surface)',
                      padding: '1rem',
                      borderRadius: '6px',
                      border: '1px solid var(--color-border)',
                    }}
                  >
                    <span className="mono" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{f.field}</span>
                    <div style={{ fontSize: '1.4rem', fontWeight: 700, color: f.mean_score >= 7.5 ? '#10b981' : '#f59e0b', margin: '0.25rem 0' }}>
                      {f.mean_score.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>/ 10</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Exact Match: {(f.exact_match_rate * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-state">No metadata extraction evaluations recorded for this version.</p>
            )}
          </Card>
        </div>
      )}
    </div>
  )
}
