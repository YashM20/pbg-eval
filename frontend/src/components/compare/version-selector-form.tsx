import { GitCompare } from "lucide-react"

import type { PipelineVersion } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select } from "@/components/ui/select"

interface VersionSelectorFormProps {
  versions: PipelineVersion[]
  v1: string
  setV1: (v: string) => void
  v2: string
  setV2: (v: string) => void
  onCompare: () => void
  loading: boolean
}

export function VersionSelectorForm({
  versions,
  v1,
  setV1,
  v2,
  setV2,
  onCompare,
  loading,
}: VersionSelectorFormProps) {
  const isDisabled = loading || !v1 || !v2 || v1 === v2

  return (
    <Card className="border-border bg-card p-4 shadow-xs">
      <CardContent className="p-0 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground" htmlFor="v1">
              Baseline Version (A)
            </label>
            <Select id="v1" value={v1} onChange={(e) => setV1(e.target.value)} className="h-8 text-xs font-mono">
              <option value="">Select Baseline…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label} (Score: {v.score_stats.mean?.toFixed(1) ?? "—"})
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-foreground" htmlFor="v2">
              Candidate Version (B)
            </label>
            <Select id="v2" value={v2} onChange={(e) => setV2(e.target.value)} className="h-8 text-xs font-mono">
              <option value="">Select Candidate…</option>
              {versions.map((v) => (
                <option key={v.id} value={v.label}>
                  {v.label} (Score: {v.score_stats.mean?.toFixed(1) ?? "—"})
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">
            {v1 === v2 && v1 ? "Please select two distinct versions to compare" : "Compare statistical accuracy, extraction quality, and clause heatmap deltas"}
          </span>

          <Button
            type="button"
            size="sm"
            onClick={onCompare}
            disabled={isDisabled}
            className="h-8 px-4 text-xs font-bold gap-1.5"
          >
            <GitCompare className="size-3.5" />
            {loading ? "Analyzing..." : "Compare Versions"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
