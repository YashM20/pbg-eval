import type { ClauseHeatmapResponse } from "@/api/types"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ClauseHeatmapProps {
  data: ClauseHeatmapResponse
}

export function ClauseHeatmap({ data }: ClauseHeatmapProps) {
  const versions = data.versions || []
  const sections = data.canonical_sections || []

  if (versions.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        No version data available for clause heatmap.
      </div>
    )
  }

  const getColorClass = (f1: number) => {
    if (f1 >= 0.9) return "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
    if (f1 >= 0.75) return "text-teal-600 dark:text-teal-400 bg-teal-500/10"
    if (f1 >= 0.5) return "text-amber-600 dark:text-amber-400 bg-amber-500/10"
    return "text-destructive bg-destructive/10"
  }

  return (
    <ScrollArea className="w-full">
      <Table className="min-w-[650px]">
        <TableHeader>
          <TableRow>
            <TableHead className="w-[200px] font-bold text-foreground">Document Section</TableHead>
            {versions.map((v) => (
              <TableHead key={v.version} className="text-center min-w-[100px] font-mono">
                {v.version}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map((sec) => (
            <TableRow key={sec}>
              <TableCell className="font-semibold text-foreground">{sec}</TableCell>
              {versions.map((v) => {
                const metric = v.sections.find((s) => s.section === sec)
                const f1 = metric ? metric.f1_score : 1.0
                const recall = metric ? metric.recall : 1.0
                const precision = metric ? metric.precision : 1.0
                const colorClass = getColorClass(f1)

                return (
                  <TableCell
                    key={v.version}
                    className={`text-center border-l border-border/60 ${colorClass}`}
                  >
                    <div className="flex flex-col items-center justify-center">
                      <span className="font-extrabold text-xs">
                        {(f1 * 100).toFixed(0)}%
                      </span>
                      <span className="text-[0.65rem] opacity-80 font-mono">
                        R:{(recall * 100).toFixed(0)}% P:{(precision * 100).toFixed(0)}%
                      </span>
                    </div>
                  </TableCell>
                )
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollArea>
  )
}
