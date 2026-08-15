import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import type { CompareResponse, PipelineVersion } from '../api/types'
import { CompareStatsChart } from '../components/Charts'
import { Card, StatGrid } from '../components/shared'

function VersionStatsCard({ v }: { v: any }) {
  const s = v.score_stats
  return (
    <div className="feature-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
        <h3 style={{ margin: 0 }}>
          <Link to={`/versions/${encodeURIComponent(v.label)}`}>{v.label}</Link>
        </h3>
        <Link
          to={`/versions/${encodeURIComponent(v.label)}`}
          className="audit-toggle"
          style={{ color: 'var(--color-accent-teal)', borderColor: 'var(--color-accent-teal)' }}
        >
          Workspace →
        </Link>
      </div>
      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
        {v.run_count} runs · {(v.exclusion_rate * 100).toFixed(1)}% excluded · Ext Score:{' '}
        {v.extraction_score ? v.extraction_score.toFixed(1) : '—'}
      </p>
      <StatGrid
        stats={{
          mean: s?.mean,
          stdev: s?.stdev,
          min: s?.min,
          median: s?.median,
          max: s?.max,
        }}
      />
    </div>
  )
}

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [v1, setV1] = useState(searchParams.get('v1') || '')
  const [v2, setV2] = useState(searchParams.get('v2') || '')
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listVersions().then((list) => {
      setVersions(list)
      const q1 = searchParams.get('v1')
      const q2 = searchParams.get('v2')

      if (q1 && q2) {
        setV1(q1)
        setV2(q2)
      } else if (list.length >= 2) {
        setV1(list[1].label)
        setV2(list[0].label)
      } else if (list.length === 1) {
        setV1(list[0].label)
      }
    })
  }, [searchParams])

  const compare = useCallback(async () => {
    if (!v1 || !v2 || v1 === v2) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.compareVersions(v1, v2)
      setResult(res)
      setSearchParams({ v1, v2 })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compare failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [v1, v2, setSearchParams])

  useEffect(() => {
    if (v1 && v2 && v1 !== v2) compare()
  }, [v1, v2, compare])

  const deltas = result?.deltas
  const corpus = result?.corpus
  const clauseDiffs = result?.clause_diffs || []

  return (
    <div className="section-gap">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1>Version Comparison & Diffing</h1>
          <p className="help-text">
            Side-by-side performance deltas, score distributions, and stability analysis.
          </p>
        </div>
        <Link to="/versions" className="button-secondary">
          ← Back to Leaderboard
        </Link>
      </div>

      <section className="feature-card">
        <div className="form-row">
          <div>
            <label className="text-input-label" htmlFor="v1">
              Baseline Version (A)
            </label>
            <select
              id="v1"
              className="text-input"
              value={v1}
              onChange={(e) => setV1(e.target.value)}
            >
              <option value="">Select Baseline…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label} (Score: {v.score_stats.mean?.toFixed(1) ?? '—'})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-input-label" htmlFor="v2">
              Candidate Version (B)
            </label>
            <select
              id="v2"
              className="text-input"
              value={v2}
              onChange={(e) => setV2(e.target.value)}
            >
              <option value="">Select Candidate…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label} (Score: {v.score_stats.mean?.toFixed(1) ?? '—'})
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="button-primary"
          onClick={compare}
          disabled={loading || !v1 || !v2 || v1 === v2}
        >
          {loading ? 'Analyzing Differences…' : 'Compare Versions'}
        </button>
      </section>

      {error && <p className="error-state">{error}</p>}
      {v1 === v2 && v1 && <p className="help-text">Pick two distinct versions to compare.</p>}

      {result && deltas && (
        <>
          {/* Corpus Alignment Banner */}
          {corpus && !corpus.is_identical && (
            <div style={{ padding: '0.75rem 1rem', borderRadius: '6px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontSize: '0.85rem' }}>
              <strong>⚠️ Asymmetric Benchmark Corpora: </strong>
              Versions were evaluated on different document sets ({corpus.common_doc_count} common documents). Showing normalized comparison delta on common documents below.
            </div>
          )}

          {/* Delta KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Comparison Score Delta</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: deltas.raw_score_delta >= 0 ? '#10b981' : '#ef4444' }}>
                {deltas.raw_score_delta >= 0 ? `+${deltas.raw_score_delta.toFixed(2)}` : deltas.raw_score_delta.toFixed(2)} pts
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {result.v1.label} → {result.v2.label} (Norm: {deltas.normalized_score_delta >= 0 ? `+${deltas.normalized_score_delta.toFixed(2)}` : deltas.normalized_score_delta.toFixed(2)})
              </span>
            </div>

            <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Metadata Extraction Delta</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: deltas.extraction_score_delta >= 0 ? '#0d9488' : '#ef4444' }}>
                {deltas.extraction_score_delta >= 0 ? `+${deltas.extraction_score_delta.toFixed(2)}` : deltas.extraction_score_delta.toFixed(2)} pts
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Ext: {result.v1.extraction_score?.toFixed(1) || '—'} → {result.v2.extraction_score?.toFixed(1) || '—'}
              </span>
            </div>

            <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Exclusion Rate Delta</span>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: deltas.exclusion_rate_delta_pct <= 0 ? '#10b981' : '#ef4444' }}>
                {deltas.exclusion_rate_delta_pct > 0 ? `+${deltas.exclusion_rate_delta_pct.toFixed(1)}%` : `${deltas.exclusion_rate_delta_pct.toFixed(1)}%`}
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {(result.v1.exclusion_rate * 100).toFixed(1)}% → {(result.v2.exclusion_rate * 100).toFixed(1)}%
              </span>
            </div>
          </div>

          <Card title="Version Performance Ranking">
            <ol style={{ margin: '0.5rem 0', paddingLeft: '1.25rem', fontSize: '0.95rem' }}>
              {result.ranking.map((r, i) => (
                <li key={r.label} style={{ marginBottom: '0.25rem' }}>
                  <strong>#{i + 1} {r.label}</strong> — Comparison Score: <strong>{r.mean?.toFixed(2) ?? '—'}</strong>,
                  Extraction Score: <strong>{r.extraction_score ? r.extraction_score.toFixed(1) : '—'}</strong>,
                  Exclusion Rate: {(r.exclusion_rate * 100).toFixed(1)}%
                </li>
              ))}
            </ol>
          </Card>

          {/* Clause Heatmap Diff Table */}
          {clauseDiffs.length > 0 && (
            <Card title="Clause-by-Clause Accuracy Diff (F1 Score %)">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th style={{ textAlign: 'right' }}>{result.v1.label} (F1)</th>
                    <th style={{ textAlign: 'right' }}>{result.v2.label} (F1)</th>
                    <th style={{ textAlign: 'right' }}>Delta (Δ)</th>
                  </tr>
                </thead>
                <tbody>
                  {clauseDiffs.map((cd) => (
                    <tr key={cd.section}>
                      <td style={{ fontWeight: 600 }}>{cd.section}</td>
                      <td style={{ textAlign: 'right' }}>{(cd.v1_f1 * 100).toFixed(0)}%</td>
                      <td style={{ textAlign: 'right' }}>{(cd.v2_f1 * 100).toFixed(0)}%</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: cd.f1_delta > 0 ? '#10b981' : cd.f1_delta < 0 ? '#ef4444' : 'inherit' }}>
                        {cd.f1_delta > 0 ? `+${(cd.f1_delta * 100).toFixed(0)}%` : `${(cd.f1_delta * 100).toFixed(0)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <CompareStatsChart
            v1Label={result.v1.label}
            v2Label={result.v2.label}
            v1Stats={result.v1.score_stats}
            v2Stats={result.v2.score_stats}
          />

          <div className="compare-grid">
            <VersionStatsCard v={result.v1} />
            <VersionStatsCard v={result.v2} />
          </div>
        </>
      )}
    </div>
  )
}
