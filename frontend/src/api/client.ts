import type {
  BatchRequest,
  BatchStartResponse,
  BatchStatus,
  CompareResponse,
  GradeResponse,
  PipelineVersion,
  VersionRunsResponse,
} from './types'

const base = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || res.statusText)
  }
  return res.json() as Promise<T>
}

export const api = {
  listVersions: () => request<PipelineVersion[]>('/api/versions'),

  getVersionRuns: (label: string) =>
    request<VersionRunsResponse>(`/api/versions/${encodeURIComponent(label)}/runs`),

  compareVersions: (v1: string, v2: string) =>
    request<CompareResponse>(`/api/report/compare?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`),

  startBatch: (body: BatchRequest) =>
    request<BatchStartResponse>('/api/batches', { method: 'POST', body: JSON.stringify(body) }),

  startBatchWithUpload: async (files: File[], params: { version: string; repeats: number; allowProd: boolean; autoGrade?: boolean }) => {
    const formData = new FormData()
    files.forEach((f) => formData.append('files', f))
    formData.append('version', params.version)
    formData.append('repeats', String(params.repeats))
    formData.append('allow_prod', String(params.allowProd))
    formData.append('auto_grade', String(params.autoGrade ?? true))

    const res = await fetch(`${base}/api/batches/upload`, {
      method: 'POST',
      body: formData,
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(text || res.statusText)
    }
    return res.json() as Promise<BatchStartResponse>
  },

  getBatch: (batchId: number) => request<BatchStatus>(`/api/batches/${batchId}`),

  stopBatch: (batchId: number) =>
    request<{ message: string }>(`/api/batches/${batchId}/stop`, { method: 'POST' }),

  gradeVersion: (version: string) =>
    request<GradeResponse>('/api/grade', {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),
}
