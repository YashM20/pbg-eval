import { Link } from "react-router-dom"
import { ArrowLeft, FileCheck2, GitCompare, Microchip } from "lucide-react"

import type { PipelineVersion, ScoreStats } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card } from "@/components/ui/card"

interface WorkspaceHeaderProps {
  version: PipelineVersion
  summary: {
    total_runs: number
    scored_runs: number
    excluded_runs: number
    heal_count: number
    exclusion_rate: number
    score_stats: ScoreStats
    overall_extraction_score: number | null
  }
  openProvenance: boolean
  onToggleProvenance: () => void
}

export function WorkspaceHeader({
  version,
  summary,
  openProvenance,
  onToggleProvenance,
}: WorkspaceHeaderProps) {
  const compScore = summary.score_stats.mean
  const extScore = summary.overall_extraction_score

  return (
    <div className="flex flex-col gap-3">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/versions"
          className={buttonVariants({ variant: "ghost", size: "xs" }) + " gap-1 text-muted-foreground hover:text-foreground"}
        >
          <ArrowLeft className="size-3" />
          Back to Leaderboard
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={onToggleProvenance}
            className="gap-1.5 text-xs text-foreground"
          >
            <Microchip className="size-3.5 text-teal-600 dark:text-teal-400" />
            {openProvenance ? "Hide Provenance" : "Reproducibility & Provenance"}
          </Button>

          <Link
            to={`/compare?v2=${encodeURIComponent(version.label)}`}
            className={buttonVariants({ variant: "outline", size: "xs" }) + " gap-1.5 text-xs"}
          >
            <GitCompare className="size-3 text-primary" />
            Compare
          </Link>

          <a
            href={`/api/gates/export/html?version=${encodeURIComponent(version.label)}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "teal", size: "xs" }) + " gap-1.5 text-xs font-semibold"}
          >
            <FileCheck2 className="size-3" />
            Compliance Report ↗
          </a>
        </div>
      </div>

      {/* Main Metric Hero Card */}
      <Card className="border-border bg-card p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl font-extrabold tracking-tight text-foreground">{version.label}</h1>
              <Badge variant="outline" className="font-mono text-xs">
                {version.prompt_hash}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {version.model_config || "qwen3.5:9b"}
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              Evaluated on {version.created_at?.slice(0, 19).replace("T", " ") || "—"} · {summary.total_runs} Runs
            </span>
          </div>

          {/* KPI Triad */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-4 shrink-0">
            <div className="flex flex-col items-center p-2 rounded-md bg-muted/40 border border-border/60">
              <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">
                Comp Score
              </span>
              <span className={`text-lg font-black ${(compScore ?? 0) >= 8.0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}`}>
                {compScore?.toFixed(1) ?? "—"}
              </span>
            </div>

            <div className="flex flex-col items-center p-2 rounded-md bg-muted/40 border border-border/60">
              <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">
                Extract Score
              </span>
              <span className={`text-lg font-black ${(extScore ?? 0) >= 8.0 ? "text-teal-600 dark:text-teal-400" : "text-amber-600"}`}>
                {extScore ? extScore.toFixed(1) : "—"}
              </span>
            </div>

            <div className="flex flex-col items-center p-2 rounded-md bg-muted/40 border border-border/60">
              <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">
                Exclusion
              </span>
              <span className={`text-lg font-black ${summary.exclusion_rate > 0.05 ? "text-destructive" : "text-foreground"}`}>
                {(summary.exclusion_rate * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
