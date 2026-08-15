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

// Next-Level Types
export interface ClauseSectionMetric {
  section: string
  true_positives: number
  false_positives: number
  false_negatives: number
  recall: number
  precision: number
  f1_score: number
  critical_count: number
  major_count: number
  minor_count: number
  sample_errors: { type: string; doc_id: string; details: string }[]
}

export interface VersionClauseMatrixResponse {
  version: string
  total_scored_runs: number
  sections: ClauseSectionMetric[]
}

export interface ClauseHeatmapResponse {
  canonical_sections: string[]
  versions: VersionClauseMatrixResponse[]
}

export interface InjectedAnomaly {
  id: string
  name: string
  clause_no: string
  appearing_in_bg: string
  should_be_corrected_as: string
  severity: string
  reason: string
}

export interface SyntheticDocument {
  doc_id: string
  title: string
  description: string
  vendor_text: string
  master_text: string
  injected_anomalies: InjectedAnomaly[]
}

export interface SyntheticEvalResult {
  doc_id: string
  title: string
  total_injected: number
  caught_count: number
  recall: number
  matched: { anomaly_id: string; anomaly_name: string; matched_deviation: any }[]
  missed: InjectedAnomaly[]
  total_reported_deviations: number
  passed: boolean
}

export interface PromptCandidate {
  name: string
  strategy: string
  mutated_prompt: string
}

export interface PromptDiagnosticReport {
  version: string
  total_runs: number
  excluded_count: number
  low_score_count: number
  diagnostics: {
    recall_weaknesses: any[]
    precision_weaknesses: any[]
    severity_weaknesses: any[]
    scope_weaknesses: any[]
  }
  recommendations: string[]
}

export interface PromptMutationResponse {
  version_label: string
  diagnosis: PromptDiagnosticReport
  candidates: PromptCandidate[]
}

export interface TraceAnalysisResult {
  has_trace: boolean
  thinking_chars: number
  content_chars: number
  thinking_tokens_est: number
  content_tokens_est: number
  ratio: number
  milestones_evaluated: string[]
  repetition_score: number
  repeated_phrases: string[]
  discrepancies: string[]
}

export interface QualityGateResponse {
  version_label: string
  verdict: 'PASSED' | 'BLOCKED'
  checks: Record<string, { threshold: number; actual: number | null; passed: boolean }>
  score_mean: number | null
  exclusion_rate: number
  stdev: number | null
}

// Metadata Extraction Evaluation Types
export interface ExtractionLeaderboardItem {
  version_id: number
  label: string
  created_at: string
  evaluated_runs: number
  overall_extraction_score: number
  field_averages: Record<string, number>
  exact_match_rates: Record<string, number>
}

export interface ExtractionFieldBreakdown {
  field: string
  mean_score: number
  exact_match_rate: number
}

export interface ExtractionRunItem {
  run_id: number
  doc_id: string
  timestamp: string
  overall_score: number
  target_metadata: Record<string, any>
  ground_truth_metadata: Record<string, any>
  field_discrepancies: { field: string; target: any; ground_truth: any; score: number; note: string }[]
}

export interface VersionExtractionMatrixResponse {
  version: string
  evaluated_runs: number
  overall_extraction_score: number
  fields: ExtractionFieldBreakdown[]
  runs: ExtractionRunItem[]
}

export interface RunExtractionGradeResponse {
  run_id: number
  overall_extraction_score: number
  field_scores: Record<string, number>
  exact_matches: Record<string, boolean>
  target_metadata: Record<string, any>
  ground_truth_metadata: Record<string, any>
  field_discrepancies: { field: string; target: any; ground_truth: any; score: number; note: string }[]
  graded_at: string
}
