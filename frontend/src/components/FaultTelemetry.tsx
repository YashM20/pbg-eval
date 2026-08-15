import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { FaultSummaryResponse } from '../api/types'
import { Card } from './shared'

export function FaultTelemetry() {
  const [data, setData] = useState<FaultSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.getFaultSummary()
      setData(res)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  if (loading && !data) return <p className="loading-state">Loading fault telemetry…</p>
  if (!data || (data.summary.length === 0 && data.recent_events.length === 0)) {
    return (
      <Card title="Fault Detection & Auto-Healing Telemetry">
        <p className="help-text" style={{ color: 'var(--color-success)' }}>
          ✓ No faults or anomalies detected. All runs operating nominally.
        </p>
      </Card>
    )
  }

  const totalFaults = data.summary.reduce((acc, s) => acc + s.count, 0)
  const totalHealed = data.summary.reduce((acc, s) => acc + (s.healed || 0), 0)
  const healRate = totalFaults > 0 ? ((totalHealed / totalFaults) * 100).toFixed(1) : '100'

  return (
    <div className="section-gap">
      <Card title="Auto-Fault Healing Summary">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Total Faults Caught</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-text)' }}>{totalFaults}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Auto-Healed Successfully</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-success)' }}>{totalHealed}</div>
          </div>
          <div style={{ background: 'var(--color-surface)', padding: '1rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Remedy Healing Rate</span>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--color-accent-teal)' }}>{healRate}%</div>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Fault Type</th>
              <th style={{ textAlign: 'right' }}>Occurrences</th>
              <th style={{ textAlign: 'right' }}>Auto-Healed</th>
            </tr>
          </thead>
          <tbody>
            {data.summary.map((s) => (
              <tr key={s.fault_type}>
                <td className="mono" style={{ color: 'var(--color-warning)' }}>{s.fault_type}</td>
                <td style={{ textAlign: 'right' }}>{s.count}</td>
                <td style={{ textAlign: 'right', color: s.healed ? 'var(--color-success)' : 'inherit' }}>
                  {s.healed || 0}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {data.recent_events.length > 0 && (
        <Card title="Live Remediation Event Stream">
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Doc ID</th>
                <th>Detected Fault</th>
                <th>Applied Remedy</th>
                <th style={{ textAlign: 'center' }}>Result</th>
              </tr>
            </thead>
            <tbody>
              {data.recent_events.slice(0, 15).map((e) => (
                <tr key={e.id}>
                  <td className="mono" style={{ fontSize: '0.8rem' }}>{e.detected_at.slice(0, 19)}</td>
                  <td>{e.doc_id || '—'}</td>
                  <td className="mono" style={{ color: 'var(--color-warning)' }}>{e.fault_type}</td>
                  <td style={{ fontSize: '0.85rem' }}>{e.remedy_applied || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {e.success ? (
                      <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>✓ Healed</span>
                    ) : (
                      <span style={{ color: 'var(--color-danger)', fontWeight: 600 }}>✗ Failed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  )
}
