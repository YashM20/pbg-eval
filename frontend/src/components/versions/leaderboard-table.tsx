import { useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight, GitCompare } from "lucide-react"

import type { PipelineVersion } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type SortKey = "label" | "mean" | "extraction_score" | "exclusion_rate" | "run_count" | "created_at"

interface LeaderboardTableProps {
  versions: PipelineVersion[]
}

export function LeaderboardTable({ versions }: LeaderboardTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("mean")
  const [sortAsc, setSortAsc] = useState(false)

  const sorted = useMemo(() => {
    return [...versions].sort((a, b) => {
      let av: number | string = 0
      let bv: number | string = 0

      if (sortKey === "label") {
        av = a.label
        bv = b.label
      } else if (sortKey === "mean") {
        av = a.score_stats.mean ?? -1
        bv = b.score_stats.mean ?? -1
      } else if (sortKey === "extraction_score") {
        av = a.extraction_score ?? -1
        bv = b.extraction_score ?? -1
      } else if (sortKey === "exclusion_rate") {
        av = a.exclusion_rate
        bv = b.exclusion_rate
      } else if (sortKey === "created_at") {
        av = a.created_at || ""
        bv = b.created_at || ""
      } else {
        av = a.run_count
        bv = b.run_count
      }

      if (av < bv) return sortAsc ? -1 : 1
      if (av > bv) return sortAsc ? 1 : -1
      return 0
    })
  }, [versions, sortKey, sortAsc])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc(!sortAsc)
    } else {
      setSortKey(key)
      setSortAsc(false)
    }
  }

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="size-3 text-muted-foreground/40" />
    return sortAsc ? <ArrowUp className="size-3 text-foreground" /> : <ArrowDown className="size-3 text-foreground" />
  }

  if (versions.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg bg-card">
        No pipeline versions recorded yet. Launch a smoke test or benchmark suite above.
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("label")}>
            <div className="flex items-center gap-1 font-bold text-foreground">
              Version Label {renderSortIcon("label")}
            </div>
          </TableHead>
          <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("created_at")}>
            <div className="flex items-center gap-1">Created {renderSortIcon("created_at")}</div>
          </TableHead>
          <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("run_count")}>
            <div className="flex items-center justify-end gap-1">Runs {renderSortIcon("run_count")}</div>
          </TableHead>
          <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("mean")}>
            <div className="flex items-center justify-end gap-1 text-primary font-bold">
              Comp Score {renderSortIcon("mean")}
            </div>
          </TableHead>
          <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("extraction_score")}>
            <div className="flex items-center justify-end gap-1 text-teal-600 dark:text-teal-400 font-bold">
              Extract Score {renderSortIcon("extraction_score")}
            </div>
          </TableHead>
          <TableHead className="cursor-pointer select-none text-right" onClick={() => toggleSort("exclusion_rate")}>
            <div className="flex items-center justify-end gap-1">Exclusion {renderSortIcon("exclusion_rate")}</div>
          </TableHead>
          <TableHead className="text-right">Stdev</TableHead>
          <TableHead className="text-center">Heals</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((v) => {
          const compScore = v.score_stats.mean
          const extScore = v.extraction_score

          return (
            <TableRow key={v.id}>
              <TableCell className="font-mono font-bold text-foreground">
                <Link to={`/versions/${encodeURIComponent(v.label)}`} className="hover:text-primary transition-colors">
                  {v.label}
                </Link>
              </TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">
                {v.created_at?.slice(0, 10) || "—"}
              </TableCell>
              <TableCell className="text-right font-medium">{v.run_count}</TableCell>
              <TableCell className="text-right font-extrabold text-sm">
                <span className={(compScore ?? 0) >= 8.0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}>
                  {compScore?.toFixed(1) ?? "—"}
                </span>
              </TableCell>
              <TableCell className="text-right font-extrabold text-sm">
                <span className={(extScore ?? 0) >= 8.0 ? "text-teal-600 dark:text-teal-400" : "text-amber-600"}>
                  {extScore ? extScore.toFixed(1) : "—"}
                </span>
              </TableCell>
              <TableCell className="text-right">
                <Badge
                  variant={v.exclusion_rate > 0.05 ? "destructive" : "outline"}
                  className="text-[0.65rem] px-1.5 py-0"
                >
                  {(v.exclusion_rate * 100).toFixed(1)}%
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                {v.score_stats.stdev?.toFixed(2) ?? "—"}
              </TableCell>
              <TableCell className="text-center">
                {v.heal_count ? (
                  <Badge variant="teal" className="text-[0.65rem] px-1.5 py-0 font-bold">
                    {v.heal_count}
                  </Badge>
                ) : (
                  <span className="text-muted-foreground text-xs">0</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <Link
                    to={`/compare?v2=${encodeURIComponent(v.label)}`}
                    className={buttonVariants({ variant: "ghost", size: "xs" }) + " h-6 px-2 text-xs text-muted-foreground hover:text-foreground"}
                  >
                    <GitCompare className="size-3 mr-1 text-primary" />
                    Compare
                  </Link>
                  <Link
                    to={`/versions/${encodeURIComponent(v.label)}`}
                    className={buttonVariants({ variant: "outline", size: "xs" }) + " h-6 px-2 text-xs font-semibold text-teal-600 dark:text-teal-400 border-teal-500/30 hover:bg-teal-500/10"}
                  >
                    Workspace
                    <ChevronRight className="size-3 ml-0.5" />
                  </Link>
                </div>
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
