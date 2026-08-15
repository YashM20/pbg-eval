interface MetadataDiffViewerProps {
  fieldDiscrepancies: {
    field: string
    target: any
    ground_truth: any
    score: number
    note: string
  }[]
  overallScore: number
  gradedAt?: string
}

export function MetadataDiffViewer({
  fieldDiscrepancies,
  overallScore,
  gradedAt,
}: MetadataDiffViewerProps) {
  const getBadge = (score: number) => {
    if (score >= 9.0) {
      return (
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            background: 'rgba(16, 185, 129, 0.15)',
            color: '#10b981',
            fontWeight: 600,
          }}
        >
          ✓ Match ({score.toFixed(1)})
        </span>
      )
    }
    if (score >= 5.0) {
      return (
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.2rem 0.5rem',
            borderRadius: '4px',
            background: 'rgba(245, 158, 11, 0.15)',
            color: '#f59e0b',
            fontWeight: 600,
          }}
        >
          ▲ Partial ({score.toFixed(1)})
        </span>
      )
    }
    return (
      <span
        style={{
          fontSize: '0.75rem',
          padding: '0.2rem 0.5rem',
          borderRadius: '4px',
          background: 'rgba(239, 68, 68, 0.15)',
          color: '#ef4444',
          fontWeight: 600,
        }}
      >
        ✗ Mismatch ({score.toFixed(1)})
      </span>
    )
  }

  return (
    <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--color-border)', marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <h4 style={{ margin: 0, color: 'var(--color-accent-teal)' }}>
          Metadata Extraction Field-by-Field Audit
        </h4>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
            Graded: {gradedAt?.slice(0, 19) || 'Just now'}
          </span>
          <span style={{ fontSize: '1.1rem', fontWeight: 700, color: overallScore >= 7.5 ? '#10b981' : '#f59e0b' }}>
            Overall: {overallScore.toFixed(2)} / 10
          </span>
        </div>
      </div>

      <table className="data-table" style={{ fontSize: '0.85rem' }}>
        <thead>
          <tr>
            <th style={{ width: '150px' }}>Field</th>
            <th>Target Output (Qwen)</th>
            <th>Ground Truth (Grounded)</th>
            <th style={{ width: '130px', textAlign: 'center' }}>Score</th>
            <th>Evaluation Note</th>
          </tr>
        </thead>
        <tbody>
          {fieldDiscrepancies.map((d) => (
            <tr key={d.field}>
              <td className="mono" style={{ fontWeight: 600 }}>{d.field}</td>
              <td className="mono" style={{ whiteSpace: 'pre-wrap', color: 'var(--color-text)' }}>
                {String(d.target || '—')}
              </td>
              <td className="mono" style={{ whiteSpace: 'pre-wrap', color: 'var(--color-accent-teal)' }}>
                {String(d.ground_truth || '—')}
              </td>
              <td style={{ textAlign: 'center' }}>{getBadge(d.score)}</td>
              <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{d.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
