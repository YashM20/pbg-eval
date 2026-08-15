import type {
  BatchRequest,
  BatchStartResponse,
  BatchStatus,
  ClauseHeatmapResponse,
  CompareResponse,
  DaemonStartRequest,
  DaemonStatusResponse,
  ExtractionLeaderboardItem,
  FaultSummaryResponse,
  GradeResponse,
  PipelineVersion,
  PromptMutationResponse,
  QualityGateResponse,
  RunExtractionGradeResponse,
  RunRecord,
  SyntheticDocument,
  SyntheticEvalResult,
  TraceAnalysisResult,
  UnifiedVersionWorkspaceResponse,
  VersionClauseMatrixResponse,
  VersionExtractionMatrixResponse,
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

  suggestVersionLabel: () => request<{ suggested_label: string }>('/api/versions/suggest-label'),

  discoverDocuments: () =>
    request<{ documents: { filename: string; doc_id: string; path: string; size_bytes: number; location: string }[] }>(
      '/api/versions/discover-documents'
    ),

  getVersionWorkspace: (label: string) =>
    request<UnifiedVersionWorkspaceResponse>(`/api/versions/${encodeURIComponent(label)}/workspace`),

  getVersionRuns: (label: string) =>
    request<VersionRunsResponse>(`/api/versions/${encodeURIComponent(label)}/runs`),

  compareVersions: (v1: string, v2: string) =>
    request<CompareResponse>(`/api/report/compare?v1=${encodeURIComponent(v1)}&v2=${encodeURIComponent(v2)}`),

  startBatch: (body: BatchRequest) =>
    request<BatchStartResponse>('/api/batches', { method: 'POST', body: JSON.stringify(body) }),

  startBatchWithUpload: async (
    files: File[],
    params: { version: string; repeats: number; allowProd: boolean; autoGrade?: boolean }
  ) => {
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

  getRunDetails: (runId: number) => request<RunRecord>(`/api/runs/${runId}`),

  regradeRun: (runId: number) =>
    request<{ status: string; overall_score?: number; scores?: Record<string, number> }>(
      `/api/runs/${runId}/regrade`,
      { method: 'POST' }
    ),

  replayRun: (runId: number) =>
    request<{ replayed: boolean; original_run_id: number; new_run_id: number }>(
      `/api/runs/${runId}/replay`,
      { method: 'POST' }
    ),

  getTraceAnalysis: (runId: number) => request<TraceAnalysisResult>(`/api/runs/${runId}/trace-analysis`),

  getFaultSummary: () => request<FaultSummaryResponse>('/api/faults/summary'),

  getDaemonStatus: () => request<DaemonStatusResponse>('/api/auto/status'),

  startDaemon: (params: DaemonStartRequest) =>
    request<DaemonStatusResponse>('/api/auto/start', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  stopDaemon: () => request<DaemonStatusResponse>('/api/auto/stop', { method: 'POST' }),

  triggerSweep: (params?: { version_label?: string; docs_dir?: string; repeats?: number }) =>
    request<{ job_id: number; status: string }>('/api/auto/sweep', {
      method: 'POST',
      body: JSON.stringify(params || {}),
    }),

  // Analytical API Calls
  getClauseHeatmap: () => request<ClauseHeatmapResponse>('/api/analytics/heatmap'),

  getVersionClauseMatrix: (label: string) =>
    request<VersionClauseMatrixResponse>(`/api/analytics/versions/${encodeURIComponent(label)}/matrix`),

  getSyntheticSuite: () => request<SyntheticDocument[]>('/api/synthetic/suite'),

  evaluateSynthetic: (docId: string, rawOutput: string) =>
    request<SyntheticEvalResult>('/api/synthetic/evaluate', {
      method: 'POST',
      body: JSON.stringify({ doc_id: docId, raw_output: rawOutput }),
    }),

  getBaselinePrompt: () => request<{ baseline_prompt: string }>('/api/studio/baseline-prompt'),

  diagnosePrompt: (versionLabel: string) =>
    request<any>('/api/studio/diagnose', {
      method: 'POST',
      body: JSON.stringify({ version_label: versionLabel }),
    }),

  mutatePrompt: (versionLabel: string, baselinePrompt: string, focusObjective: string = 'balanced') =>
    request<PromptMutationResponse>('/api/studio/mutate', {
      method: 'POST',
      body: JSON.stringify({
        version_label: versionLabel,
        baseline_prompt: baselinePrompt,
        focus_objective: focusObjective,
      }),
    }),

  evaluateQualityGate: (params: {
    version_label: string
    min_overall_score?: number
    max_exclusion_rate?: number
    max_stdev?: number
  }) =>
    request<QualityGateResponse>('/api/gates/evaluate', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Extraction Analytics
  getExtractionLeaderboard: () => request<ExtractionLeaderboardItem[]>('/api/extraction/leaderboard'),

  getVersionExtractionMatrix: (label: string) =>
    request<VersionExtractionMatrixResponse>(`/api/extraction/versions/${encodeURIComponent(label)}/matrix`),

  getRunExtractionGrade: (runId: number) =>
    request<RunExtractionGradeResponse>(`/api/extraction/runs/${runId}`),

  gradeVersionMetadata: (versionLabel: string) =>
    request<{ version: string; graded_runs: number; errors: string[] }>(
      `/api/extraction/grade/${encodeURIComponent(versionLabel)}`,
      { method: 'POST' }
    ),
}
