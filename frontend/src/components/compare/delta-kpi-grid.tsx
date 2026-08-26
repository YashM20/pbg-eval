import { AlertTriangle, ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import type { CompareResponse } from "@/api/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"

interface DeltaKpiGridProps {
  result: CompareResponse
}

export function DeltaKpiGrid({ result }: DeltaKpiGridProps) {
  const deltas = result.deltas
  const corpus = result.corpus

  if (!deltas) return null

  const renderDeltaIcon = (val: number, reverse: boolean = false) => {
    const isPositive = reverse ? val <= 0 : val >= 0
    if (val === 0) return <Minus className="size-4 text-muted-foreground" />
    return isPositive ? (
      <ArrowUpRight className="size-4 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <ArrowDownRight className="size-4 text-destructive" />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Corpus Alignment Warning */}
      {corpus && !corpus.is_identical && (
        <Alert variant="warning" className="py-2 px-3 text-xs">
          <AlertTriangle className="size-4" />
          <AlertDescription className="text-xs">
            <strong>Asymmetric Benchmark Corpora:</strong> Versions were evaluated on different document sets ({corpus.common_doc_count} common documents). Showing normalized comparison delta on common documents below.
          </AlertDescription>
        </Alert>
      )}

      {/* Delta KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Comparison Score Delta */}
        <Card size="sm" className="border-border bg-card">
          <CardContent className="p-3.5 flex flex-col gap-1">
            <span className="text-[0.7rem] uppercase font-bold text-muted-foreground tracking-wider">
              Comparison Score Delta
            </span>
            <div className="flex items-center gap-1">
              {renderDeltaIcon(deltas.raw_score_delta)}
              <span
                className={`text-xl font-extrabold ${
                  deltas.raw_score_delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {deltas.raw_score_delta >= 0 ? `+${deltas.raw_score_delta.toFixed(2)}` : deltas.raw_score_delta.toFixed(2)} pts
              </span>
            </div>
            <span className="text-[0.7rem] text-muted-foreground font-mono">
              {result.v1.label} → {result.v2.label} (Norm: {deltas.normalized_score_delta >= 0 ? `+${deltas.normalized_score_delta.toFixed(2)}` : deltas.normalized_score_delta.toFixed(2)})
            </span>
          </CardContent>
        </Card>

        {/* Metadata Extraction Delta */}
        <Card size="sm" className="border-border bg-card">
          <CardContent className="p-3.5 flex flex-col gap-1">
            <span className="text-[0.7rem] uppercase font-bold text-muted-foreground tracking-wider">
              Metadata Extraction Delta
            </span>
            <div className="flex items-center gap-1">
              {renderDeltaIcon(deltas.extraction_score_delta)}
              <span
                className={`text-xl font-extrabold ${
                  deltas.extraction_score_delta >= 0 ? "text-teal-600 dark:text-teal-400" : "text-destructive"
                }`}
              >
                {deltas.extraction_score_delta >= 0 ? `+${deltas.extraction_score_delta.toFixed(2)}` : deltas.extraction_score_delta.toFixed(2)} pts
              </span>
            </div>
            <span className="text-[0.7rem] text-muted-foreground font-mono">
              Ext: {result.v1.extraction_score?.toFixed(1) || "—"} → {result.v2.extraction_score?.toFixed(1) || "—"}
            </span>
          </CardContent>
        </Card>

        {/* Exclusion Rate Delta */}
        <Card size="sm" className="border-border bg-card">
          <CardContent className="p-3.5 flex flex-col gap-1">
            <span className="text-[0.7rem] uppercase font-bold text-muted-foreground tracking-wider">
              Exclusion Rate Delta
            </span>
            <div className="flex items-center gap-1">
              {renderDeltaIcon(deltas.exclusion_rate_delta_pct, true)}
              <span
                className={`text-xl font-extrabold ${
                  deltas.exclusion_rate_delta_pct <= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                }`}
              >
                {deltas.exclusion_rate_delta_pct > 0 ? `+${deltas.exclusion_rate_delta_pct.toFixed(1)}%` : `${deltas.exclusion_rate_delta_pct.toFixed(1)}%`}
              </span>
            </div>
            <span className="text-[0.7rem] text-muted-foreground font-mono">
              {(result.v1.exclusion_rate * 100).toFixed(1)}% → {(result.v2.exclusion_rate * 100).toFixed(1)}%
            </span>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
