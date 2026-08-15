import { useEffect, useState } from 'react'
import { api } from '../api/client'
import type { TraceAnalysisResult } from '../api/types'

interface TraceViewerProps {
  runId: number
  traceText?: string | null
}

export function TraceViewer({ runId, traceText }: TraceViewerProps) {
  const [analysis, setAnalysis] = useState<TraceAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .getTraceAnalysis(runId)
      .then((res) => {
        if (active) setAnalysis(res)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [runId])

  return (
    <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--color-border)', marginTop: '0.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h4 style={{ margin: 0, color: 'var(--color-accent-teal)' }}>
          Thinking Trace & Reasoning Deep-Diagnostics {loading && <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}> (Analyzing…)</span>}
        </h4>
        {analysis && (
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Thinking: ~{analysis.thinking_tokens_est} tokens | Content: ~{analysis.content_tokens_est} tokens
          </div>
        )}
      </div>

      {analysis && (
        <div style={{ marginBottom: '1rem' }}>
          {/* Token Ratio Bar */}
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '0.25rem' }}>
            Reasoning Overhead Ratio: {(analysis.ratio * 100).toFixed(0)}% thinking tokens
          </div>
          <div style={{ width: '100%', height: '8px', background: '#334155', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${analysis.ratio * 100}%`,
                height: '100%',
                background: analysis.ratio > 0.8 ? '#f59e0b' : '#0d9488',
              }}
            />
          </div>

          {/* Traversal Milestones */}
          {analysis.milestones_evaluated.length > 0 && (
            <div style={{ marginTop: '0.75rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)' }}>
                Evaluated Sections in Reasoning:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginTop: '0.25rem' }}>
                {analysis.milestones_evaluated.map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: '0.75rem',
                      background: 'rgba(13, 148, 136, 0.15)',
                      color: 'var(--color-accent-teal)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(13, 148, 136, 0.3)',
                    }}
                  >
                    ✓ {m}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Discrepancy Warnings */}
          {analysis.discrepancies.length > 0 && (
            <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid #ef4444', borderRadius: '4px' }}>
              <strong style={{ fontSize: '0.8rem', color: '#ef4444' }}>Reasoning-Output Discrepancy Detected:</strong>
              <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1.25rem', fontSize: '0.8rem', color: '#f87171' }}>
                {analysis.discrepancies.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Loop Warnings */}
          {analysis.repetition_score > 0.15 && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: 'rgba(245, 158, 11, 0.1)', borderLeft: '3px solid #f59e0b', borderRadius: '4px' }}>
              <strong style={{ fontSize: '0.8rem', color: '#f59e0b' }}>Repetitive Reasoning Pattern Warning:</strong>
              <span style={{ fontSize: '0.8rem', color: '#fbbf24', marginLeft: '0.5rem' }}>
                Model repeated {analysis.repeated_phrases.length} reasoning phrasing segments.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Raw Trace Box */}
      <pre
        style={{
          maxHeight: '350px',
          overflowY: 'auto',
          whiteSpace: 'pre-wrap',
          background: 'var(--color-background)',
          padding: '0.75rem',
          borderRadius: '4px',
          border: '1px solid var(--color-border)',
          fontSize: '0.8rem',
          color: 'var(--color-text)',
        }}
      >
        {traceText || 'No raw thinking trace captured for this run.'}
      </pre>
    </div>
  )
}
