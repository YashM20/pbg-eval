import { Loader2, Sparkles } from "lucide-react"

import type { PipelineVersion, PromptDiagnosticReport } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select } from "@/components/ui/select"

interface AIDiagnosticianCardProps {
  versions: PipelineVersion[]
  selectedVersion: string
  setSelectedVersion: (v: string) => void
  onDiagnose: () => void
  onMutate: () => void
  diagnosis: PromptDiagnosticReport | null
  loading: boolean
  mutating: boolean
}

export function AIDiagnosticianCard({
  versions,
  selectedVersion,
  setSelectedVersion,
  onDiagnose,
  onMutate,
  diagnosis,
  loading,
  mutating,
}: AIDiagnosticianCardProps) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border/50">
        <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
          <Sparkles className="size-3.5 text-primary" />
          1. Select Version & Diagnose Weaknesses
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-3 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-foreground" htmlFor="ver-select">
              Pipeline Version:
            </label>
            <Select
              id="ver-select"
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="w-[200px] h-8 text-xs font-mono"
            >
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label} (Score: {v.score_stats.mean?.toFixed(1) ?? "—"})
                </option>
              ))}
            </Select>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDiagnose}
            disabled={loading || !selectedVersion}
            className="h-8 text-xs gap-1.5"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-amber-500" />}
            {loading ? "Analyzing..." : "Run Error Diagnosis"}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={onMutate}
            disabled={mutating || !selectedVersion}
            className="h-8 text-xs font-bold gap-1.5"
          >
            {mutating ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            {mutating ? "Synthesizing..." : "⚡ Auto-Mutate Prompt Candidates"}
          </Button>
        </div>

        {diagnosis && (
          <div className="rounded-lg border border-border bg-muted/40 p-3.5 flex flex-col gap-2.5">
            <span className="text-xs font-bold text-teal-700 dark:text-teal-400">
              Diagnostic Synthesis ({diagnosis.total_runs} runs analyzed, {diagnosis.low_score_count} low-scoring)
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-muted-foreground text-[0.7rem] uppercase tracking-wider">
                  Key Recommendations
                </span>
                <ul className="list-disc pl-4 space-y-1 text-foreground/90">
                  {diagnosis.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-semibold text-muted-foreground text-[0.7rem] uppercase tracking-wider">
                  Weakness Observations
                </span>
                <div className="flex flex-col gap-1 text-muted-foreground font-mono text-[0.75rem]">
                  <span>• Precision false alarms: {diagnosis.diagnostics.precision_weaknesses.length} runs</span>
                  <span>• Recall missed deviations: {diagnosis.diagnostics.recall_weaknesses.length} runs</span>
                  <span>• Severity mismatches: {diagnosis.diagnostics.severity_weaknesses.length} runs</span>
                  <span>• Scope violations: {diagnosis.diagnostics.scope_weaknesses.length} runs</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
