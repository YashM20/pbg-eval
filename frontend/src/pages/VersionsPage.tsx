import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PipelineVersion } from '../api/types'
import { VersionMeanChart } from '../components/Charts'
import { JobProgress } from '../components/JobProgress'
import { usePollBatch } from '../hooks/usePollBatch'

type SortKey = 'label' | 'mean' | 'exclusion_rate' | 'run_count' | 'extraction_score'
type InputMode = 'discovered' | 'upload' | 'dir'

export function VersionsPage() {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [discoveredDocs, setDiscoveredDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('mean')
  const [sortAsc, setSortAsc] = useState(false)

  const [mode, setMode] = useState<InputMode>('discovered')
  const [version, setVersion] = useState('v1.0')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [docsDir, setDocsDir] = useState('sample_docs')
  const [repeats, setRepeats] = useState(3)
  const [allowProd, setAllowProd] = useState(false)
  const [autoGrade, setAutoGrade] = useState(true)
  const [batchId, setBatchId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { status: batchStatus, error: pollError } = usePollBatch(batchId)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [verList, suggestRes, discRes] = await Promise.all([
        api.listVersions(),
        api.suggestVersionLabel().catch(() => ({ suggested_label: 'v1.0' })),
        api.discoverDocuments().catch(() => ({ documents: [] })),
      ])
      setVersions(verList)
      setVersion(suggestRes.suggested_label)
      setDiscoveredDocs(discRes.documents)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load versions')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (batchStatus?.status === 'done' || batchStatus?.status === 'completed') load()
  }, [batchStatus?.status, load])

  const sorted = [...versions].sort((a, b) => {
    let av: number | string = 0
    let bv: number | string = 0
    if (sortKey === 'label') {
      av = a.label
      bv = b.label
    } else if (sortKey === 'mean') {
      av = a.score_stats.mean ?? -1
      bv = b.score_stats.mean ?? -1
    } else if (sortKey === 'extraction_score') {
      av = a.extraction_score ?? -1
      bv = b.extraction_score ?? -1
    } else if (sortKey === 'exclusion_rate') {
      av = a.exclusion_rate
      bv = b.exclusion_rate
    } else {
      av = a.run_count
      bv = b.run_count
    }
    if (av < bv) return sortAsc ? -1 : 1
    if (av > bv) return sortAsc ? 1 : -1
    return 0
  })

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc)
    else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const added = Array.from(e.target.files)
      setSelectedFiles((prev) => [...prev, ...added])
    }
  }

  const removeFile = (idx: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  const startBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      let res
      if (mode === 'upload') {
        if (selectedFiles.length === 0) {
          throw new Error('Please select at least one PDF file to upload')
        }
        res = await api.startBatchWithUpload(selectedFiles, {
          version,
          repeats,
          allowProd,
          autoGrade,
        })
      } else {
        const targetDir = mode === 'discovered' ? 'sample_docs' : docsDir
        res = await api.startBatch({ version, docs_dir: targetDir, repeats, allow_prod: allowProd })
      }
      setBatchId(res.batch_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch failed to start')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && versions.length === 0) return <p className="loading-state">Loading versions…</p>

  return (
    <div className="section-gap">
      <h1>Evaluation Hub & Leaderboard</h1>
      <p className="help-text">
        Track comparison accuracy, metadata extraction quality, score stability, and auto-healing telemetry.
      </p>

      {/* 1-Click Evaluation Launcher */}
      <section className="feature-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Start Evaluation Suite</h3>
          <span style={{ fontSize: '0.8rem', color: 'var(--color-accent-teal)' }}>
            ✓ Auto-Version & Zero-Touch Multi-Grading Enabled
          </span>
        </div>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={mode === 'discovered' ? 'button-primary' : 'button-secondary'}
            onClick={() => setMode('discovered')}
          >
            ⚡ Discovered Benchmark Docs ({discoveredDocs.length})
          </button>
          <button
            type="button"
            className={mode === 'upload' ? 'button-primary' : 'button-secondary'}
            onClick={() => setMode('upload')}
          >
            Upload New PDFs
          </button>
          <button
            type="button"
            className={mode === 'dir' ? 'button-primary' : 'button-secondary'}
            onClick={() => setMode('dir')}
          >
            Custom Server Path
          </button>
        </div>

        <form onSubmit={startBatch}>
          <div className="form-row">
            <div>
              <label className="text-input-label" htmlFor="version">
                Target Version Label (Auto-Suggested)
              </label>
              <input
                id="version"
                className="text-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. v1.4"
                required
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
              />
            </div>
          </div>

          {mode === 'discovered' && (
            <div style={{ marginBottom: '1rem', background: 'var(--color-surface)', padding: '0.75rem 1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Auto-Detected Benchmark Documents ({discoveredDocs.length}):
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.35rem' }}>
                {discoveredDocs.map((d) => (
                  <span
                    key={d.doc_id}
                    className="mono"
                    style={{ fontSize: '0.75rem', background: 'var(--color-background)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border)' }}
                  >
                    📄 {d.filename}
                  </span>
                ))}
              </div>
            </div>
          )}

          {mode === 'upload' && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="text-input-label">Select PDF Documents:</label>
              <input
                type="file"
                accept="application/pdf,.pdf,.json"
                multiple
                className="text-input"
                onChange={handleFileChange}
              />
              {selectedFiles.length > 0 && (
                <div style={{ marginTop: '0.5rem' }}>
                  <span className="help-text">Selected ({selectedFiles.length}):</span>
                  <ul style={{ fontSize: '0.85rem', paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
                    {selectedFiles.map((f, i) => (
                      <li key={i}>
                        {f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB){' '}
                        <button
                          type="button"
                          style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer' }}
                          onClick={() => removeFile(i)}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {mode === 'dir' && (
            <div style={{ marginBottom: '1rem' }}>
              <label className="text-input-label" htmlFor="docs_dir">
                Directory Path
              </label>
              <input
                id="docs_dir"
                className="text-input"
                value={docsDir}
                onChange={(e) => setDocsDir(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-row" style={{ marginBottom: '1rem' }}>
            <div>
              <label className="text-input-label">
                <input
                  type="checkbox"
                  checked={autoGrade}
                  onChange={(e) => setAutoGrade(e.target.checked)}
                />{' '}
                Zero-Touch Multi-Grading (Comparison + Metadata Extraction)
              </label>
            </div>
            <div>
              <label className="text-input-label">
                <input
                  type="checkbox"
                  checked={allowProd}
                  onChange={(e) => setAllowProd(e.target.checked)}
                />{' '}
                Allow non-staging backend
              </label>
            </div>
          </div>

          <button type="submit" className="button-primary" disabled={submitting}>
            {submitting ? 'Launching Suite…' : '⚡ Start Evaluation Suite'}
          </button>
        </form>
        {batchId != null && <JobProgress status={batchStatus} error={pollError} />}
      </section>

      {/* Leaderboard Table */}
      {error && <p className="error-state">{error}</p>}
      {loading ? (
        <p className="loading-state">Loading versions...</p>
      ) : versions.length === 0 ? (
        <p className="empty-state">No pipeline versions recorded yet. Start your first evaluation above.</p>
      ) : (
        <>
          <VersionMeanChart versions={versions} />
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('label')}>
                  Version Label
                </th>
                <th>Created</th>
                <th className="sortable" onClick={() => toggleSort('run_count')}>
                  Runs
                </th>
                <th className="sortable" onClick={() => toggleSort('mean')}>
                  Comp Score
                </th>
                <th className="sortable" onClick={() => toggleSort('extraction_score')}>
                  Extract Score
                </th>
                <th className="sortable" onClick={() => toggleSort('exclusion_rate')}>
                  Exclusion
                </th>
                <th>Stdev</th>
                <th>Heals</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600 }}>
                    <Link to={`/versions/${encodeURIComponent(v.label)}`}>{v.label}</Link>
                  </td>
                  <td className="mono">{v.created_at?.slice(0, 10)}</td>
                  <td>{v.run_count}</td>
                  <td style={{ fontWeight: 700, color: (v.score_stats.mean ?? 0) >= 8.0 ? '#10b981' : '#f59e0b' }}>
                    {v.score_stats.mean?.toFixed(1) ?? '—'}
                  </td>
                  <td style={{ fontWeight: 700, color: (v.extraction_score ?? 0) >= 8.0 ? '#0d9488' : '#f59e0b' }}>
                    {v.extraction_score ? v.extraction_score.toFixed(1) : '—'}
                  </td>
                  <td className={v.exclusion_rate > 0.05 ? 'warning-text' : ''}>
                    {(v.exclusion_rate * 100).toFixed(1)}%
                  </td>
                  <td>{v.score_stats.stdev?.toFixed(2) ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>{v.heal_count || 0}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                      <Link to={`/compare?v2=${encodeURIComponent(v.label)}`} className="audit-toggle">
                        Compare
                      </Link>
                      <Link to={`/versions/${encodeURIComponent(v.label)}`} className="audit-toggle" style={{ color: 'var(--color-accent-teal)', borderColor: 'var(--color-accent-teal)' }}>
                        Workspace →
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
