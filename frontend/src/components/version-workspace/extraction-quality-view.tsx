import type { ExtractionFieldBreakdown } from "@/api/types"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface ExtractionQualityViewProps {
  extractionBreakdown: ExtractionFieldBreakdown[]
}

export function ExtractionQualityView({
  extractionBreakdown,
}: ExtractionQualityViewProps) {
  if (extractionBreakdown.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-card">
        No metadata extraction grades recorded for this version yet. Click "Grade All Pending Runs" to evaluate.
      </div>
    )
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border/50">
        <CardTitle className="text-xs font-bold text-foreground">
          8-Field Metadata Extraction Quality & Exact Match Rates
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {extractionBreakdown.map((f) => {
            const isHigh = f.mean_score >= 8.0
            const isWarn = f.mean_score < 6.0

            return (
              <div
                key={f.field}
                className="flex flex-col gap-1 p-3 rounded-lg border border-border bg-muted/40 shadow-xs"
              >
                <span className="font-mono font-bold text-xs text-foreground truncate">{f.field}</span>
                <div className="flex items-baseline gap-1 my-0.5">
                  <span
                    className={`text-xl font-black ${
                      isHigh ? "text-emerald-600 dark:text-emerald-400" : isWarn ? "text-destructive" : "text-amber-600"
                    }`}
                  >
                    {f.mean_score.toFixed(1)}
                  </span>
                  <span className="text-[0.65rem] text-muted-foreground">/ 10</span>
                </div>
                <span className="text-[0.7rem] text-muted-foreground font-mono">
                  Exact Match: {(f.exact_match_rate * 100).toFixed(0)}%
                </span>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
