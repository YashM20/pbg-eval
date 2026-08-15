import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import type { PipelineVersion } from '../api/types'
import { VersionMeanChart } from '../components/Charts'
import { JobProgress } from '../components/JobProgress'
import { usePollBatch } from '../hooks/usePollBatch'

type SortKey = 'label' | 'mean' | 'exclusion_rate' | 'run_count'
type InputMode = 'upload' | 'dir'

export function VersionsPage() {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('mean')
  const [sortAsc, setSortAsc] = useState(false)

  const [mode, setMode] = useState<InputMode>('upload')
  const [version, setVersion] = useState('v1.0')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [docsDir, setDocsDir] = useState('fixtures/example')
  const [repeats, setRepeats] = useState(5)
  const [allowProd, setAllowProd] = useState(false)
  const [autoGrade, setAutoGrade] = useState(true)
  const [batchId, setBatchId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { status: batchStatus, error: pollError } = usePollBatch(batchId)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setVersions(await api.listVersions())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
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
        res = await api.startBatch({ version, docs_dir: docsDir, repeats, allow_prod: allowProd })
      }
      setBatchId(res.batch_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Batch failed to start')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <p className="loading-state">Loading versions…</p>
  if (error && !versions.length) return <p className="error-state">{error}</p>

  return (
    <div className="section-gap">
      <h1>Pipeline Evaluation Leaderboard</h1>

      <section className="feature-card">
        <h3>Start Evaluation Batch</h3>

        {/* Mode Selector Tabs */}
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.25rem' }}>
          <button
            type="button"
            className={mode === 'upload' ? 'button-primary' : 'button-secondary'}
            onClick={() => setMode('upload')}
          >
            Upload PDF Documents
          </button>
          <button
            type="button"
            className={mode === 'dir' ? 'button-primary' : 'button-secondary'}
            onClick={() => setMode('dir')}
          >
            Server Path Directory
          </button>
        </div>

        <form onSubmit={startBatch}>
          <div className="form-row">
            <div>
              <label className="text-input-label" htmlFor="version">
                Version Label
              </label>
              <input
                id="version"
                className="text-input"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. v1.0, prompt-v2"
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

          {mode === 'upload' ? (
            <div style={{ marginBottom: '1rem' }}>
              <label className="text-input-label">Select PDF Files for Evaluation</label>
              <input
                type="file"
                accept="application/pdf,.pdf,.json"
                multiple
                className="text-input"
                onChange={handleFileChange}
              />
              {selectedFiles.length > 0 && (
                <div style={{ marginTop: '0.75rem' }}>
                  <p className="help-text">Selected files ({selectedFiles.length}):</p>
                  <ul style={{ fontSize: '0.85rem', paddingLeft: '1.25rem', marginTop: '0.25rem' }}>
                    {selectedFiles.map((f, i) => (
                      <li key={i} style={{ marginBottom: '0.25rem' }}>
                        {f.name} ({(f.size / 1024 / 1024).toFixed(2)} MB){' '}
                        <button
                          type="button"
                          style={{
                            border: 'none',
                            background: 'transparent',
                            color: '#cf2d56',
                            cursor: 'pointer',
                            marginLeft: '0.5rem',
                          }}
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
          ) : (
            <div style={{ marginBottom: '1rem' }}>
              <label className="text-input-label" htmlFor="docs_dir">
                Docs Directory (Server Path)
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
                Auto-grade with Gemini LLM Judge when complete
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
            {submitting ? 'Starting Batch…' : 'Start & Run Evaluation'}
          </button>
        </form>
        {batchId != null && <JobProgress status={batchStatus} error={pollError} />}
      </section>

      {versions.length === 0 ? (
        <p className="empty-state">No versions yet. Upload documents to start evaluation testing.</p>
      ) : (
        <>
          <VersionMeanChart versions={versions} />
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort('label')}>
                  Label
                </th>
                <th>Created</th>
                <th className="sortable" onClick={() => toggleSort('run_count')}>
                  Runs
                </th>
                <th>Scored</th>
                <th className="sortable" onClick={() => toggleSort('exclusion_rate')}>
                  Exclusion
                </th>
                <th className="sortable" onClick={() => toggleSort('mean')}>
                  Mean
                </th>
                <th>Stdev</th>
                <th>Min</th>
                <th>Median</th>
                <th>Max</th>
                <th>Heals</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sorted.map((v) => (
                <tr key={v.id}>
                  <td style={{ fontWeight: 600 }}>{v.label}</td>
                  <td className="mono">{v.created_at?.slice(0, 10)}</td>
                  <td>{v.run_count}</td>
                  <td>{v.scored_count}</td>
                  <td className={v.exclusion_rate > 0.1 ? 'warning-text' : ''}>
                    {(v.exclusion_rate * 100).toFixed(1)}%
                  </td>
                  <td style={{ fontWeight: 600, color: (v.score_stats.mean ?? 0) >= 7 ? 'var(--color-success)' : 'inherit' }}>
                    {v.score_stats.mean ?? '—'}
                  </td>
                  <td>{v.score_stats.stdev ?? '—'}</td>
                  <td>{v.score_stats.min ?? '—'}</td>
                  <td>{v.score_stats.median ?? '—'}</td>
                  <td>{v.score_stats.max ?? '—'}</td>
                  <td>{v.heal_count || 0}</td>
                  <td>
                    <Link to={`/versions/${encodeURIComponent(v.label)}/runs`}>Runs →</Link>
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
