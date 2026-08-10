import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import type { RunRecord, VersionRunsResponse } from '../api/types'
import { VarianceChart } from '../components/Charts'
import { Card, formatJson, StatusBadge } from '../components/shared'

function RunRow({ run }: { run: RunRecord }) {
  const [open, setOpen] = useState(false)
  const hasAudit = run.grader_notes || run.independent_read

  return (
    <>
      <tr>
        <td>{run.doc_id}</td>
        <td className="mono">{run.timestamp?.slice(0, 19)}</td>
        <td>{run.overall_score ?? '—'}</td>
        <td>{run.deviation_recall ?? '—'}</td>
        <td>{run.deviation_precision ?? '—'}</td>
        <td>{run.severity_correctness ?? '—'}</td>
        <td>{run.reasoning_quality ?? '—'}</td>
        <td>{run.schema_integrity ?? '—'}</td>
        <td>{run.scope_discipline ?? '—'}</td>
        <td>{run.extraction_ok ? '✓' : '✗'}</td>
        <td>
          {hasAudit && (
            <button type="button" className="audit-toggle" onClick={() => setOpen(!open)}>
              {open ? 'Hide audit' : 'Grader audit'}
            </button>
          )}
        </td>
      </tr>
      {open && hasAudit && (
        <tr>
          <td colSpan={11}>
            <div className="audit-panel">
              <strong>Grader notes</strong>
              <pre>{run.grader_notes || '—'}</pre>
              <strong>Independent read (call 1)</strong>
              <pre>{formatJson(run.independent_read)}</pre>
            </div>
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

  const scored = data.runs
    .filter((r) => r.status === 'scored')
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
  const excluded = data.runs.filter((r) => r.status === 'excluded')
  const pending = data.runs.filter((r) => r.status === 'pending')

  return (
    <div className="section-gap">
      <p>
        <Link to="/versions">← Versions</Link>
      </p>
      <h1>{label}</h1>
      <p className="mono">{data.version.prompt_hash}</p>

      <Card title="Actions">
        <button type="button" className="button-primary" onClick={grade} disabled={grading}>
          {grading ? 'Grading…' : 'Grade pending runs'}
        </button>
        {gradeResult && <p className="help-text">{gradeResult}</p>}
      </Card>

      <Card title="Variance by document">
        <VarianceChart variance={data.variance_by_doc} />
        <table className="data-table">
          <thead>
            <tr>
              <th>Doc</th>
              <th>Count</th>
              <th>Mean</th>
              <th>Stdev</th>
              <th>Min</th>
              <th>Max</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(data.variance_by_doc).map(([doc, s]) => (
              <tr key={doc}>
                <td>{doc}</td>
                <td>{s.count}</td>
                <td>{s.mean ?? '—'}</td>
                <td>{s.stdev ?? '—'}</td>
                <td>{s.min ?? '—'}</td>
                <td>{s.max ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title={`Scored runs (${scored.length})`}>
        {scored.length === 0 ? (
          <p className="empty-state">No scored runs yet.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc</th>
                <th>Time</th>
                <th>Overall</th>
                <th>Recall</th>
                <th>Precision</th>
                <th>Severity</th>
                <th>Reason</th>
                <th>Schema</th>
                <th>Scope</th>
                <th>Extract</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {scored.map((r) => (
                <RunRow key={r.id} run={r} />
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {pending.length > 0 && (
        <Card title={`Pending grade (${pending.length})`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => (
                <tr key={r.id}>
                  <td>{r.doc_id}</td>
                  <td className="mono">{r.timestamp?.slice(0, 19)}</td>
                  <td>
                    <StatusBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {excluded.length > 0 && (
        <Card title={`Excluded (${excluded.length})`}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Doc</th>
                <th>Time</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {excluded.map((r) => (
                <tr key={r.id}>
                  <td>{r.doc_id}</td>
                  <td className="mono">{r.timestamp?.slice(0, 19)}</td>
                  <td className="mono">{r.exclusion_reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
