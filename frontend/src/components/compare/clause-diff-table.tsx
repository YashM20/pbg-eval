import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ClauseDiffTableProps {
  v1Label: string
  v2Label: string
  clauseDiffs: { section: string; v1_f1: number; v2_f1: number; f1_delta: number }[]
}

export function ClauseDiffTable({
  v1Label,
  v2Label,
  clauseDiffs,
}: ClauseDiffTableProps) {
  if (clauseDiffs.length === 0) return null

  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border/50">
        <CardTitle className="text-xs font-bold text-foreground">
          Clause-by-Clause Accuracy Diff (Section F1 Score %)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="font-bold text-foreground">Document Section</TableHead>
              <TableHead className="text-right font-mono">{v1Label} (F1)</TableHead>
              <TableHead className="text-right font-mono">{v2Label} (F1)</TableHead>
              <TableHead className="text-right font-bold">Accuracy Delta (Δ)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clauseDiffs.map((cd) => {
              const isImproved = cd.f1_delta > 0
              const isRegressed = cd.f1_delta < 0

              return (
                <TableRow key={cd.section}>
                  <TableCell className="font-semibold text-foreground text-xs">{cd.section}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{(cd.v1_f1 * 100).toFixed(0)}%</TableCell>
                  <TableCell className="text-right font-mono text-xs">{(cd.v2_f1 * 100).toFixed(0)}%</TableCell>
                  <TableCell
                    className={`text-right font-mono font-black text-xs ${
                      isImproved ? "text-emerald-600 dark:text-emerald-400" : isRegressed ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {isImproved ? `+${(cd.f1_delta * 100).toFixed(0)}%` : `${(cd.f1_delta * 100).toFixed(0)}%`}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
