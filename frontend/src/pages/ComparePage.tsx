import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { CompareResponse, PipelineVersion } from '../api/types'
import { CompareStatsChart } from '../components/Charts'
import { Card, StatGrid } from '../components/shared'

function VersionStatsCard({ v }: { v: PipelineVersion }) {
  const s = v.score_stats
  return (
    <div className="feature-card">
      <h3>{v.label}</h3>
      <p>
        {v.run_count} runs · {(v.exclusion_rate * 100).toFixed(1)}% excluded
      </p>
      <StatGrid
        stats={{
          mean: s.mean,
          stdev: s.stdev,
          min: s.min,
          median: s.median,
          max: s.max,
        }}
      />
    </div>
  )
}

export function ComparePage() {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [v1, setV1] = useState('')
  const [v2, setV2] = useState('')
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listVersions().then((list) => {
      setVersions(list)
      if (list.length >= 2) {
        setV1(list[0].label)
        setV2(list[1].label)
      } else if (list.length === 1) {
        setV1(list[0].label)
      }
    })
  }, [])

  const compare = useCallback(async () => {
    if (!v1 || !v2) return
    setLoading(true)
    setError(null)
    try {
      setResult(await api.compareVersions(v1, v2))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Compare failed')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [v1, v2])

  useEffect(() => {
    if (v1 && v2 && v1 !== v2) compare()
  }, [v1, v2, compare])

  return (
    <div className="section-gap">
      <h1>Compare versions</h1>

      <section className="feature-card">
        <div className="form-row">
          <div>
            <label className="text-input-label" htmlFor="v1">
              Version A
            </label>
            <select
              id="v1"
              className="text-input"
              value={v1}
              onChange={(e) => setV1(e.target.value)}
            >
              <option value="">Select…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-input-label" htmlFor="v2">
              Version B
            </label>
            <select
              id="v2"
              className="text-input"
              value={v2}
              onChange={(e) => setV2(e.target.value)}
            >
              <option value="">Select…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="button"
          className="button-secondary"
          onClick={compare}
          disabled={loading || !v1 || !v2 || v1 === v2}
        >
          {loading ? 'Comparing…' : 'Compare'}
        </button>
      </section>

      {error && <p className="error-state">{error}</p>}
      {v1 === v2 && v1 && <p className="help-text">Pick two different versions.</p>}

      {result && (
        <>
          <Card title="Ranking">
            <ol>
              {result.ranking.map((r, i) => (
                <li key={r.label}>
                  #{i + 1} {r.label} — mean {r.mean ?? '—'}, exclusion{' '}
                  {(r.exclusion_rate * 100).toFixed(1)}%
                </li>
              ))}
            </ol>
          </Card>

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
