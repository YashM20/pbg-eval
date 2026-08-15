export interface ScoreStats {
  count: number
  mean: number | null
  min: number | null
  max: number | null
  median: number | null
  stdev: number | null
}

export interface PipelineVersion {
  id: number
  label: string
  prompt_hash: string
  model_config: string
  created_at: string
  notes: string | null
  run_count: number
  scored_count: number
  exclusion_rate: number
  heal_count?: number
  score_stats: ScoreStats
}

export interface BatchRequest {
  version: string
  docs_dir: string
  repeats: number
  allow_prod: boolean
  auto_grade?: boolean
  prompt_hash?: string
  model_config_json?: string
}

export interface BatchStartResponse {
  batch_id: number
  status: string
}

export interface BatchDocStatus {
  doc_id: string
  total: number
  completed: number
  pending: number
  excluded: number
  error: string | null
}

export interface BatchStatus {
  batch_id: number
  version_id: number
  status: string
  total: number
  completed: number
  error: string | null
  started_at: string
  finished_at?: string | null
  docs?: BatchDocStatus[] | null
}

export interface GradeResponse {
  version: string
  graded: number
  excluded: number
  errors: string[]
}

export interface RunRecord {
  id: number
  doc_id: string
  timestamp: string
  status: string
  overall_score: number | null
  deviation_recall: number | null
  deviation_precision: number | null
  severity_correctness: number | null
  reasoning_quality: number | null
  schema_integrity: number | null
  scope_discipline: number | null
  extraction_ok: number
  latency_seconds: number | null
  exclusion_reason: string | null
  grader_notes: string | null
  independent_read: string | null
  thinking_trace?: string | null
  heal_count?: number
}

export interface VersionRunsResponse {
  version: PipelineVersion
  runs: RunRecord[]
  variance_by_doc: Record<string, ScoreStats>
}

export interface CompareResponse {
  v1: PipelineVersion
  v2: PipelineVersion
  ranking: { label: string; mean: number | null; exclusion_rate: number }[]
}

export interface FaultEventDetail {
  id: number
  run_id: number | null
  job_id: number | null
  doc_id: string | null
  fault_type: string
  error_message: string | null
  detected_at: string
  remedy_applied: string | null
  success: number
}

export interface FaultSummaryItem {
  fault_type: string
  count: number
  healed: number | null
}

export interface FaultSummaryResponse {
  summary: FaultSummaryItem[]
  recent_events: FaultEventDetail[]
}

export interface DaemonStatusResponse {
  is_running: boolean
  interval_seconds: number
  last_sweep_at: string | null
  total_sweeps: number
  active_job_id: number | null
  last_error: string | null
}

export interface DaemonStartRequest {
  interval_seconds: number
  docs_dir?: string
  repeats?: number
}
