import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { VersionRunsResponse } from '../api/types'
import { VarianceChart } from '../components/Charts'
import { MetadataDiffViewer } from '../components/MetadataDiffViewer'
import { Card, formatJson, StatusBadge } from '../components/shared'
import { TraceViewer } from '../components/TraceViewer'

function RunRow({ run, onRegrade }: { run: any; onRegrade: () => void }) {
  const [openAudit, setOpenAudit] = useState(false)
  const [openTrace, setOpenTrace] = useState(false)
  const [openExtract, setOpenExtract] = useState(false)
  const [regrading, setRegrading] = useState(false)

  const hasAudit = run.grader_notes || run.independent_read
  const hasTrace = Boolean(run.thinking_trace)
  const hasExtractGrade = Boolean(run.field_discrepancies && run.field_discrepancies.length > 0)

  const handleRegrade = async () => {
    setRegrading(true)
    try {
      await api.regradeRun(run.id)
      onRegrade()
    } catch {
      // ignore
    } finally {
      setRegrading(false)
    }
  }

  return (
    <>
      <tr>
        <td className="mono" style={{ fontWeight: 600 }}>{run.doc_id}</td>
        <td className="mono">{run.timestamp?.slice(0, 19)}</td>
        <td style={{ fontWeight: 600, color: (run.overall_score ?? 0) >= 7 ? 'var(--color-success)' : 'inherit' }}>
          {run.overall_score ?? '—'}
        </td>
        <td style={{ fontWeight: 600, color: (run.overall_extraction_score ?? 0) >= 7 ? '#0d9488' : 'inherit' }}>
          {run.overall_extraction_score ? run.overall_extraction_score.toFixed(1) : (run.extraction_ok ? '✓' : '✗')}
        </td>
        <td>{run.deviation_recall ?? '—'}</td>
        <td>{run.deviation_precision ?? '—'}</td>
        <td>{run.severity_correctness ?? '—'}</td>
        <td>{run.reasoning_quality ?? '—'}</td>
        <td>{run.schema_integrity ?? '—'}</td>
        <td>{run.scope_discipline ?? '—'}</td>
        <td style={{ textAlign: 'center' }}>
          {(run.heal_count ?? 0) > 0 ? (
            <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>{run.heal_count}</span>
          ) : (
            '0'
          )}
        </td>
        <td>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            {hasAudit && (
              <button type="button" className="audit-toggle" onClick={() => setOpenAudit(!openAudit)}>
                {openAudit ? 'Hide audit' : 'Grader audit'}
              </button>
            )}
            {hasExtractGrade && (
              <button
                type="button"
                className="audit-toggle"
                style={{ borderColor: '#0d9488', color: '#0d9488' }}
                onClick={() => setOpenExtract(!openExtract)}
              >
                {openExtract ? 'Hide extract' : 'Extract audit'}
              </button>
            )}
            {hasTrace && (
              <button
                type="button"
                className="audit-toggle"
                style={{ borderColor: 'var(--color-accent-teal)', color: 'var(--color-accent-teal)' }}
                onClick={() => setOpenTrace(!openTrace)}
              >
                {openTrace ? 'Hide trace' : 'Trace'}
              </button>
            )}
            <button
              type="button"
              className="audit-toggle"
              onClick={handleRegrade}
              disabled={regrading}
            >
              {regrading ? '…' : '↻'}
            </button>
          </div>
        </td>
      </tr>

      {openAudit && hasAudit && (
        <tr>
          <td colSpan={12}>
            <div className="audit-panel">
              <strong>Gemini Grader Notes</strong>
              <pre>{run.grader_notes || '—'}</pre>
              <strong>Independent Read (Ground Truth Derivation)</strong>
              <pre>{formatJson(run.independent_read)}</pre>
            </div>
          </td>
        </tr>
      )}

      {openExtract && hasExtractGrade && (
        <tr>
          <td colSpan={12}>
            <MetadataDiffViewer
              fieldDiscrepancies={run.field_discrepancies}
              overallScore={run.overall_extraction_score || 0}
            />
          </td>
        </tr>
      )}

      {openTrace && hasTrace && (
        <tr>
          <td colSpan={12}>
            <TraceViewer runId={run.id} traceText={run.thinking_trace} />
          </td>
        </tr>
      )}
    </>
  )
}

export function RunsPage() {
  const { label = '' } = useParams()
  const [data, setData] = useState<VersionRunsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [grading, setGrading] = useState(false)
  const [gradeResult, setGradeResult] = useState<string | null>(null)
  const [filterDoc, setFilterDoc] = useState('')

  const load = useCallback(async () => {
    if (!label) return
    setLoading(true)
    try {
      setData(await api.getVersionRuns(label))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [label])

  useEffect(() => {
    load()
  }, [load])

  const grade = async () => {
    setGrading(true)
    setGradeResult(null)
    try {
      const res = await api.gradeVersion(label)
      await api.gradeVersionMetadata(label).catch(() => {})
      setGradeResult(`Graded ${res.graded}, excluded ${res.excluded}${res.errors.length ? `; errors: ${res.errors.join('; ')}` : ''}`)
      await load()
    } catch (e) {
      setGradeResult(e instanceof Error ? e.message : 'Grade failed')
    } finally {
      setGrading(false)
    }
  }

  if (loading) return <p className="loading-state">Loading runs…</p>
  if (error) return <p className="error-state">{error}</p>
  if (!data) return null

  const filteredRuns = filterDoc
    ? data.runs.filter((r) => r.doc_id.toLowerCase().includes(filterDoc.toLowerCase()))
    : data.runs

  const scored = filteredRuns
    .filter((r) => r.status === 'scored')
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
  const excluded = filteredRuns.filter((r) => r.status === 'excluded')
  const pending = filteredRuns.filter((r) => r.status === 'pending')

  return (
    <div className="section-gap">
      <p>
        <Link to="/versions">← Versions Leaderboard</Link>
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{label}</h1>
          <p className="mono" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Prompt Hash: {data.version.prompt_hash} | Model Config: {data.version.model_config}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Filter by doc ID..."
            className="text-input"
            style={{ width: '180px' }}
            value={filterDoc}
            onChange={(e) => setFilterDoc(e.target.value)}
          />
          <button type="button" className="button-primary" onClick={grade} disabled={grading}>
            {grading ? 'Grading…' : 'Grade Pending Runs'}
          </button>
        </div>
      </div>

      {gradeResult && <p className="help-text">{gradeResult}</p>}

      <Card title="Variance Analysis by Document">
        <VarianceChart variance={data.variance_by_doc} />
        <table className="data-table">
          <thead>
            <tr>
              <th>Doc ID</th>
              <th>Runs</th>
              <th>Mean Score</th>
              <th>Stdev</th>
              <th>Min</th>
              <th>Median</th>
              <th>Max</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.variance_by_doc).map(([doc, s]) => (
              <tr key={doc}>
                <td className="mono">{doc}</td>
                <td>{s.count}</td>
                <td>{s.mean ?? '—'}</td>
                <td>{s.stdev ?? '—'}</td>
                <td>{s.min ?? '—'}</td>
                <td>{s.median ?? '—'}</td>
                <td>{s.max ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Scored Runs (${scored.length})`}>
        {scored.length === 0 ? (
          <p className="empty-state">No scored runs matching criteria.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc</th>
                <th>Time</th>
                <th>Overall</th>
                <th>Extraction</th>
                <th>Recall</th>
                <th>Precision</th>
                <th>Severity</th>
                <th>Reason</th>
                <th>Schema</th>
                <th>Scope</th>
                <th>Heals</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scored.map((r) => (
                <RunRow key={r.id} run={r} onRegrade={load} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {pending.length > 0 && (
        <Card title={`Pending Evaluation Grade (${pending.length})`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc</th>
                <th>Time</th>
                <th>Status</th>
                <th>Heals</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td className="mono">{r.doc_id}</td>
                  <td className="mono">{r.timestamp?.slice(0, 19)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                  <td>{r.heal_count || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {excluded.length > 0 && (
        <Card title={`Excluded Runs (${excluded.length})`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc</th>
                <th>Time</th>
                <th>Exclusion Reason</th>
                <th>Heal Attempts</th>
              </tr>
            </thead>
            <tbody>
              {excluded.map((r) => (
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
  )
}
