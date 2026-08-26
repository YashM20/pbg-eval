import { Link } from "react-router-dom"
import { ChevronRight } from "lucide-react"

import type { PipelineVersion } from "@/api/types"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { StatGrid } from "@/components/shared/stat-grid"

interface VersionStatsCardProps {
  version: PipelineVersion & { label: string; run_count: number; exclusion_rate: number; extraction_score?: number | null }
}

export function VersionStatsCard({ version }: VersionStatsCardProps) {
  const s = version.score_stats

  return (
    <Card className="border-border bg-card">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/50">
        <div>
          <CardTitle className="text-sm font-bold">
            <Link to={`/versions/${encodeURIComponent(version.label)}`} className="hover:text-primary transition-colors">
              {version.label}
            </Link>
          </CardTitle>
          <span className="text-[0.7rem] text-muted-foreground font-mono">
            {version.run_count} runs · {(version.exclusion_rate * 100).toFixed(1)}% excluded · Ext: {version.extraction_score ? version.extraction_score.toFixed(1) : "—"}
          </span>
        </div>

        <Link
          to={`/versions/${encodeURIComponent(version.label)}`}
          className={buttonVariants({ variant: "outline", size: "xs" }) + " text-teal-600 dark:text-teal-400 border-teal-500/30"}
        >
          Workspace
          <ChevronRight className="size-3 ml-0.5" />
        </Link>
      </CardHeader>

      <CardContent className="p-4 pt-3">
        <StatGrid
          stats={{
            mean: s?.mean?.toFixed(2),
            stdev: s?.stdev?.toFixed(2),
            min: s?.min?.toFixed(2),
            median: s?.median?.toFixed(2),
            max: s?.max?.toFixed(2),
          }}
        />
      </CardContent>
    </Card>
  )
}
