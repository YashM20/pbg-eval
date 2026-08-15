import type { ClauseHeatmapResponse } from '../api/types'

interface ClauseHeatmapProps {
  data: ClauseHeatmapResponse
}

export function ClauseHeatmap({ data }: ClauseHeatmapProps) {
  const versions = data.versions || []
  const sections = data.canonical_sections || []

  if (versions.length === 0) {
    return <p className="empty-state">No version data available for clause heatmap.</p>
  }

  const getColor = (f1: number) => {
    if (f1 >= 0.9) return '#10b981' // Green
    if (f1 >= 0.75) return '#06b6d4' // Teal
    if (f1 >= 0.5) return '#f59e0b' // Amber
    return '#ef4444' // Red
  }

  return (
    <div style={{ overflowX: 'auto', margin: '1rem 0' }}>
      <table className="data-table" style={{ fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ minWidth: '180px' }}>Document Section</th>
            {versions.map((v) => (
              <th key={v.version} style={{ textAlign: 'center', minWidth: '110px' }}>
                {v.version}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sections.map((sec) => (
            <tr key={sec}>
              <td style={{ fontWeight: 600 }}>{sec}</td>
              {versions.map((v) => {
                const metric = v.sections.find((s) => s.section === sec)
                const f1 = metric ? metric.f1_score : 1.0
                const recall = metric ? metric.recall : 1.0
                const precision = metric ? metric.precision : 1.0
                const hasIssues = metric ? (metric.false_positives + metric.false_negatives) > 0 : false

                return (
                  <td
                    key={v.version}
                    style={{
                      textAlign: 'center',
                      background: hasIssues ? `${getColor(f1)}18` : 'transparent',
                      borderLeft: '1px solid var(--color-border)',
                      borderRight: '1px solid var(--color-border)',
                    }}
                  >
                    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: getColor(f1),
                          fontSize: '0.9rem',
                        }}
                      >
                        {(f1 * 100).toFixed(0)}%
                      </span>
                      <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)' }}>
                        R:{(recall * 100).toFixed(0)}% P:{(precision * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
