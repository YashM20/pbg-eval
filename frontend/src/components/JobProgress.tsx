import type { BatchStatus, BatchDocStatus } from '../api/types'
import { api } from '../api/client'
import { useState } from 'react'

interface JobProgressProps {
  status: BatchStatus | null
  error: string | null
}

function docState(d: BatchDocStatus) {
  if (d.excluded > 0 && d.completed === d.total) return 'failed'
  if (d.completed === d.total) return 'done'
  if (d.completed > 0) return 'running'
  return 'pending'
}

function DocRow({ doc }: { doc: BatchDocStatus }) {
  const state = docState(doc)
  const pct = doc.total > 0 ? Math.round((doc.completed / doc.total) * 100) : 0
  return (
    <li className="batch-doc">
      <span className={`batch-doc__name batch-doc__name--${state}`}>
        {doc.doc_id}
      </span>
      <span className="batch-doc__meta">
        {doc.completed}/{doc.total} · {pct}%{doc.excluded > 0 ? ` · ${doc.excluded} excluded` : ''}
      </span>
      {doc.error && state === 'failed' && <span className="batch-doc__error">{doc.error}</span>}
    </li>
  )
}

export function JobProgress({ status, error }: JobProgressProps) {
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    if (!status) return
    setStopping(true)
    try {
      await api.stopBatch(status.batch_id)
    } catch (e) {
      console.error('Failed to stop batch:', e)
    } finally {
      setStopping(false)
    }
  }

  if (error) return <p className="error-state">{error}</p>
  if (!status) return <p className="loading-state">Starting batch…</p>

  const pct = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0
  const phase =
    status.status === 'done'
      ? 'done'
      : status.status === 'failed'
        ? 'failed'
        : status.status === 'stopped'
          ? 'stopped'
          : 'running'

  return (
    <div className="feature-card">
      <h3>Batch #{status.batch_id}</h3>
      <p>
        {status.completed} / {status.total} comparisons ({pct}%)
      </p>
      <div className="progress-bar">
        <div className="progress-bar__fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="timeline-pills">
        {phase === 'running' && (
          <span className="timeline-pill timeline-pill--read">Comparing</span>
        )}
        {phase === 'done' && (
          <span className="timeline-pill timeline-pill--done">Done</span>
        )}
        {phase === 'failed' && (
          <span className="badge-pill badge-pill--error">Failed</span>
        )}
        {phase === 'stopped' && (
          <span className="badge-pill badge-pill--warn">✓ Stopped & GPU VRAM Evicted</span>
        )}
      </div>
      {phase === 'running' && (
        <button
          type="button"
          className="button-secondary"
          disabled={stopping}
          onClick={handleStop}
          style={{ marginTop: '0.75rem' }}
        >
          {stopping ? 'Stopping…' : 'Stop Batch'}
        </button>
      )}
      {status.error && <p className="error-state">{status.error}</p>}

      {status.docs && status.docs.length > 0 && (
        <div className="batch-docs">
          <h4>Per-file status</h4>
          <ul>
            {status.docs.map((d) => (
              <DocRow key={d.doc_id} doc={d} />
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
