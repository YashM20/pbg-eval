import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type {
  ExtractionLeaderboardItem,
  PipelineVersion,
  VersionExtractionMatrixResponse,
} from '../api/types'
import { MetadataDiffViewer } from '../components/MetadataDiffViewer'
import { Card } from '../components/shared'

export function ExtractionPage() {
  const [leaderboard, setLeaderboard] = useState<ExtractionLeaderboardItem[]>([])
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string>('')
  const [matrix, setMatrix] = useState<VersionExtractionMatrixResponse | null>(null)
  const [openRunId, setOpenRunId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [grading, setGrading] = useState(false)
  const [gradeResult, setGradeResult] = useState<string | null>(null)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    try {
      const [lbRes, verRes] = await Promise.all([
        api.getExtractionLeaderboard(),
        api.listVersions(),
      ])
      setLeaderboard(lbRes)
      setVersions(verRes)
      if (verRes.length > 0) {
        setSelectedVersion(verRes[0].label)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInitial()
  }, [loadInitial])

  const loadMatrix = useCallback(async (label: string) => {
    if (!label) return
    try {
      const m = await api.getVersionExtractionMatrix(label)
      setMatrix(m)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (selectedVersion) {
      loadMatrix(selectedVersion)
    }
  }, [selectedVersion, loadMatrix])

  const handleGrade = async () => {
    if (!selectedVersion) return
    setGrading(true)
    setGradeResult(null)
    try {
      const res = await api.gradeVersionMetadata(selectedVersion)
      setGradeResult(`Metadata evaluation completed: ${res.graded_runs} runs graded.`)
      await Promise.all([
        api.getExtractionLeaderboard().then(setLeaderboard),
        loadMatrix(selectedVersion),
      ])
    } catch (err) {
      setGradeResult(err instanceof Error ? err.message : 'Metadata evaluation failed')
    } finally {
      setGrading(false)
    }
  }

  if (loading && leaderboard.length === 0 && versions.length === 0) {
    return <p className="loading-state">Loading metadata extraction analytics…</p>
  }

  return (
    <div className="section-gap">
      <h1>Metadata Extraction Evaluation Dashboard</h1>
      <p className="help-text">
        Dedicated 8-field semantic evaluation (BG Number, Dates, Amount, PO Number, Vendor Name, Bank Branch Address with Stop-Marker validation).
      </p>

      {leaderboard.length > 0 ? (
        <Card title="Extraction Quality Leaderboard">
          <table className="data-table">
            <thead>
              <tr>
                <th>Version Label</th>
                <th>Evaluated Runs</th>
                <th style={{ textAlign: 'right' }}>Overall Extraction Score</th>
                <th style={{ textAlign: 'right' }}>BG No (EM)</th>
                <th style={{ textAlign: 'right' }}>Dates (EM)</th>
                <th style={{ textAlign: 'right' }}>Amount (EM)</th>
                <th style={{ textAlign: 'right' }}>Vendor (EM)</th>
                <th style={{ textAlign: 'right' }}>Bank Address Quality</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map((item) => (
                <tr key={item.version_id}>
                  <td style={{ fontWeight: 600 }}>{item.label}</td>
                  <td>{item.evaluated_runs}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: item.overall_extraction_score >= 7.5 ? '#10b981' : '#f59e0b', fontSize: '1.05rem' }}>
                    {item.overall_extraction_score.toFixed(2)} / 10
                  </td>
                  <td style={{ textAlign: 'right' }}>{(item.exact_match_rates.bgNumber * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: 'right' }}>{(item.exact_match_rates.validityDate * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: 'right' }}>{(item.exact_match_rates.amount * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: 'right' }}>{(item.exact_match_rates.vendorName * 100).toFixed(0)}%</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: item.field_averages.bankBranchAddress >= 7.0 ? '#10b981' : '#f59e0b' }}>
                    {item.field_averages.bankBranchAddress.toFixed(1)} / 10
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <p className="empty-state">No metadata evaluation grades yet. Select a version below to evaluate.</p>
      )}

      <Card title="Field-by-Field Breakdown & Run Audits">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <label className="text-input-label" style={{ margin: 0 }}>
              Select Version:
            </label>
            <select
              className="text-input"
              style={{ width: '220px' }}
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
            >
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label} ({v.run_count} runs)
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="button-primary"
            onClick={handleGrade}
            disabled={grading || !selectedVersion}
          >
            {grading ? 'Evaluating Metadata…' : '⚡ Grade Version Metadata'}
          </button>
        </div>

        {gradeResult && <p className="help-text">{gradeResult}</p>}

        {matrix && matrix.fields.length > 0 && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
              {matrix.fields.map((f) => (
                <div
                  key={f.field}
                  style={{
                    background: 'var(--color-surface)',
                    padding: '0.75rem 1rem',
                    borderRadius: '6px',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <span className="mono" style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{f.field}</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: f.mean_score >= 7.5 ? '#10b981' : '#f59e0b' }}>
                    {f.mean_score.toFixed(1)} <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--color-text-muted)' }}>/ 10</span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Exact Match: {(f.exact_match_rate * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {matrix && matrix.runs.length > 0 && (
          <div>
            <h4>Evaluated Runs for {selectedVersion} ({matrix.runs.length})</h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Doc ID</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: 'right' }}>Extraction Score</th>
                  <th style={{ textAlign: 'center' }}>Vendor Match</th>
                  <th style={{ textAlign: 'center' }}>Amount Match</th>
                  <th style={{ textAlign: 'center' }}>Address Score</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {matrix.runs.map((r) => (
                  <tr key={r.run_id}>
                    <td className="mono" style={{ fontWeight: 600 }}>{r.doc_id}</td>
                    <td className="mono">{r.timestamp.slice(0, 19)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.overall_score >= 7.5 ? '#10b981' : '#f59e0b' }}>
                      {r.overall_score.toFixed(2)}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                      {r.target_metadata.vendorName || '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                      {r.target_metadata.amount || '—'}
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 600 }}>
                      {r.field_discrepancies.find((d) => d.field === 'bankBranchAddress')?.score.toFixed(1) ?? '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="audit-toggle"
                        onClick={() => setOpenRunId(openRunId === r.run_id ? null : r.run_id)}
                      >
                        {openRunId === r.run_id ? 'Hide Diff' : 'Field Diff'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {openRunId && (
              <div style={{ marginTop: '1rem' }}>
                {(() => {
                  const r = matrix.runs.find((x) => x.run_id === openRunId)
                  if (!r) return null
                  return (
                    <MetadataDiffViewer
                      fieldDiscrepancies={r.field_discrepancies}
                      overallScore={r.overall_score}
                    />
                  )
                })()}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
