import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/client'
import type { SyntheticDocument, SyntheticEvalResult } from '../api/types'
import { Card } from '../components/shared'

export function SyntheticTestsPage() {
  const [suite, setSuite] = useState<SyntheticDocument[]>([])
  const [selectedDoc, setSelectedDoc] = useState<SyntheticDocument | null>(null)
  const [targetOutput, setTargetOutput] = useState('')
  const [evalResult, setEvalResult] = useState<SyntheticEvalResult | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSuite = useCallback(async () => {
    try {
      const res = await api.getSyntheticSuite()
      setSuite(res)
      if (res.length > 0) {
        setSelectedDoc(res[0])
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSuite()
  }, [loadSuite])

  const handleTest = async () => {
    if (!selectedDoc || !targetOutput.trim()) return
    setEvaluating(true)
    try {
      const res = await api.evaluateSynthetic(selectedDoc.doc_id, targetOutput)
      setEvalResult(res)
    } catch {
      // ignore
    } finally {
      setEvaluating(false)
    }
  }

  const loadPassingSample = () => {
    if (!selectedDoc) return
    const sampleDeviations = selectedDoc.injected_anomalies.map((a) => ({
      clauseNo: a.clause_no,
      appearingInBg: a.appearing_in_bg,
      shouldBeCorrectedAs: a.should_be_corrected_as,
      severity: a.severity,
      reason: a.reason,
    }))
    setTargetOutput(
      JSON.stringify(
        {
          deviations: sampleDeviations,
          vendorMetadata: {
            bgNumber: '0504726IBGP0012',
            amount: 'Rs. 50,00,000/-',
            validityDate: '31-DEC-2028',
            claimPeriod: '31-MAR-2029',
          },
        },
        null,
        2
      )
    )
  }

  const loadFailingSample = () => {
    setTargetOutput(
      JSON.stringify(
        {
          deviations: [],
          vendorMetadata: {},
        },
        null,
        2
      )
    )
  }

  if (loading) return <p className="loading-state">Loading synthetic test suite…</p>

  return (
    <div className="section-gap">
      <h1>Synthetic Adversarial Benchmark Lab</h1>
      <p className="help-text">
        Deterministic stress-testing against programmatically generated Bank Guarantees with injected legal anomalies.
      </p>

      <Card title="Available Synthetic Benchmark Test Cases">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
          {suite.map((doc) => (
            <div
              key={doc.doc_id}
              onClick={() => {
                setSelectedDoc(doc)
                setEvalResult(null)
              }}
              style={{
                cursor: 'pointer',
                background: selectedDoc?.doc_id === doc.doc_id ? 'rgba(13, 148, 136, 0.15)' : 'var(--color-surface)',
                border: selectedDoc?.doc_id === doc.doc_id ? '1px solid var(--color-accent-teal)' : '1px solid var(--color-border)',
                padding: '1rem',
                borderRadius: '6px',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                {doc.title}
              </div>
              <p style={{ margin: '0.35rem 0', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                {doc.description}
              </p>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-warning)' }}>
                {doc.injected_anomalies.length} Injected Ground-Truth Anomaly
              </span>
            </div>
          ))}
        </div>

        {selectedDoc && (
          <div style={{ background: 'var(--color-surface)', padding: '1.25rem', borderRadius: '6px', border: '1px solid var(--color-border)' }}>
            <h4 style={{ margin: '0 0 0.5rem', color: 'var(--color-accent-teal)' }}>
              Selected: {selectedDoc.title} ({selectedDoc.doc_id})
            </h4>

            <div style={{ marginBottom: '1rem' }}>
              <strong>Expected Injected Ground-Truth Anomalies:</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                {selectedDoc.injected_anomalies.map((anom) => (
                  <div
                    key={anom.id}
                    style={{
                      background: 'var(--color-background)',
                      padding: '0.75rem',
                      borderRadius: '4px',
                      border: '1px solid var(--color-border)',
                      fontSize: '0.85rem',
                    }}
                  >
                    <div>
                      <span className="mono" style={{ fontWeight: 600, color: '#ef4444' }}>
                        [{anom.severity}] {anom.clause_no}: {anom.name}
                      </span>
                    </div>
                    <div style={{ color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      <em>Appearing in Vendor:</em> "{anom.appearing_in_bg}"
                    </div>
                    <div style={{ color: 'var(--color-success)', marginTop: '0.2rem' }}>
                      <em>Should Be Corrected:</em> "{anom.should_be_corrected_as}"
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="text-input-label" style={{ margin: 0 }}>
                  Target Model Comparison JSON Output to Verify:
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="audit-toggle" onClick={loadPassingSample}>
                    Load Passing Sample
                  </button>
                  <button type="button" className="audit-toggle" onClick={loadFailingSample}>
                    Load Empty/Failing Sample
                  </button>
                </div>
              </div>
              <textarea
                className="text-input"
                style={{ width: '100%', height: '120px', fontFamily: 'monospace', fontSize: '0.8rem' }}
                placeholder='Paste {"deviations": [...], "vendorMetadata": {...}} here'
                value={targetOutput}
                onChange={(e) => setTargetOutput(e.target.value)}
              />
            </div>

            <button
              type="button"
              className="button-primary"
              onClick={handleTest}
              disabled={evaluating || !targetOutput.trim()}
            >
              {evaluating ? 'Verifying Output…' : 'Run Ground-Truth Verification'}
            </button>

            {evalResult && (
              <div
                style={{
                  marginTop: '1rem',
                  padding: '1rem',
                  borderRadius: '6px',
                  background: evalResult.passed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: evalResult.passed ? '1px solid #10b981' : '1px solid #ef4444',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h4 style={{ margin: 0, color: evalResult.passed ? '#10b981' : '#ef4444' }}>
                    {evalResult.passed ? '✓ PASSED — All Injected Anomalies Caught' : '✗ FAILED — Missed Injected Anomalies'}
                  </h4>
                  <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
                    Recall: {(evalResult.recall * 100).toFixed(0)}% ({evalResult.caught_count}/{evalResult.total_injected})
                  </span>
                </div>

                {evalResult.missed.length > 0 && (
                  <div style={{ marginTop: '0.75rem' }}>
                    <strong style={{ color: '#ef4444' }}>Missed Anomalies:</strong>
                    <ul style={{ margin: '0.25rem 0', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                      {evalResult.missed.map((m) => (
                        <li key={m.id} style={{ color: '#f87171' }}>
                          {m.clause_no}: {m.name} — "{m.appearing_in_bg}"
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  )
}
