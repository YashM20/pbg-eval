import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { ClauseHeatmapResponse, PipelineVersion, VersionClauseMatrixResponse } from '../api/types'
import { ClauseHeatmap } from '../components/ClauseHeatmap'
import { Card } from '../components/shared'

export function ClauseMatrixPage() {
  const [heatmap, setHeatmap] = useState<ClauseHeatmapResponse | null>(null)
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<string>('')
  const [versionMatrix, setVersionMatrix] = useState<VersionClauseMatrixResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const loadInitial = useCallback(async () => {
    setLoading(true)
    try {
      const [hmRes, verRes] = await Promise.all([
        api.getClauseHeatmap(),
        api.listVersions(),
      ])
      setHeatmap(hmRes)
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

  useEffect(() => {
    if (!selectedVersion) return
    api.getVersionClauseMatrix(selectedVersion).then(setVersionMatrix).catch(() => {})
  }, [selectedVersion])

  if (loading && !heatmap) return <p className="loading-state">Loading clause analytics…</p>

  return (
    <div className="section-gap">
      <h1>Clause-by-Clause Confusion Matrix & Heatmaps</h1>
      <p className="help-text">
        Section-level deviation accuracy, false alarm distribution, and regression tracking across pipeline versions.
      </p>

      {heatmap && (
        <Card title="Multi-Version Section Accuracy Heatmap (F1 Score %)">
          <ClauseHeatmap data={heatmap} />
        </Card>
      )}

      <Card title="Granular Section Confusion Matrix">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
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

        {versionMatrix && (
          <>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th style={{ textAlign: 'right' }}>TP</th>
                  <th style={{ textAlign: 'right' }}>FP</th>
                  <th style={{ textAlign: 'right' }}>FN</th>
                  <th style={{ textAlign: 'right' }}>Recall</th>
                  <th style={{ textAlign: 'right' }}>Precision</th>
                  <th style={{ textAlign: 'right' }}>F1</th>
                  <th style={{ textAlign: 'right' }}>Critical</th>
                  <th style={{ textAlign: 'right' }}>Major</th>
                  <th style={{ textAlign: 'right' }}>Minor</th>
                </tr>
              </thead>
              <tbody>
                {versionMatrix.sections.map((sec) => (
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

            {/* Error Inspection Cards */}
            <div style={{ marginTop: '1.5rem' }}>
              <h4 style={{ color: 'var(--color-accent-teal)' }}>Identified Section Anomaly Clusters</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginTop: '0.75rem' }}>
                {versionMatrix.sections
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
          </>
        )}
      </Card>
    </div>
  )
}
