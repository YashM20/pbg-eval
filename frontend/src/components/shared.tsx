import type { ReactNode } from 'react'

export function formatJson(raw: string | null): string {
  if (!raw) return '—'
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

export function StatusBadge({ status }: { status: string }) {
  if (status === 'scored') return <span className="badge-pill badge-pill--success">scored</span>
  if (status === 'excluded') return <span className="badge-pill badge-pill--error">excluded</span>
  return <span className="badge-pill badge-pill--muted">{status}</span>
}

export function StatGrid({ stats }: { stats: Record<string, number | null | undefined> }) {
  return (
    <div className="stat-grid">
      {Object.entries(stats).map(([key, val]) => (
        <div key={key} className="stat-item">
          {key}
          <strong>{val ?? '—'}</strong>
        </div>
      ))}
    </div>
  )
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="feature-card">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
