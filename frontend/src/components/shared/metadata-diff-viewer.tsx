import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface MetadataDiffViewerProps {
  fieldDiscrepancies: {
    field: string
    target: any
    ground_truth: any
    score: number
    note: string
  }[]
  overallScore: number
  gradedAt?: string
}

export function MetadataDiffViewer({
  fieldDiscrepancies,
  overallScore,
  gradedAt,
}: MetadataDiffViewerProps) {
  const getBadge = (score: number) => {
    if (score >= 9.0) {
      return (
        <Badge variant="success" className="text-[0.65rem] px-1.5 py-0 font-bold">
          ✓ Match ({score.toFixed(1)})
        </Badge>
      )
    }
    if (score >= 5.0) {
      return (
        <Badge variant="warning" className="text-[0.65rem] px-1.5 py-0 font-bold">
          ▲ Partial ({score.toFixed(1)})
        </Badge>
      )
    }
    return (
      <Badge variant="destructive" className="text-[0.65rem] px-1.5 py-0 font-bold">
        ✗ Mismatch ({score.toFixed(1)})
      </Badge>
    )
  }

  return (
    <Card className="border-border/80 bg-card/60 shadow-xs">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/50">
        <CardTitle className="text-xs font-bold text-teal-600 dark:text-teal-400">
          Metadata Extraction Field-by-Field Audit
        </CardTitle>
        <div className="flex items-center gap-3">
          {gradedAt && (
            <span className="text-[0.7rem] text-muted-foreground font-mono">
              Graded: {gradedAt.slice(0, 19)}
            </span>
          )}
          <span className="text-xs font-bold text-foreground">
            Overall Score:{" "}
            <span className={overallScore >= 7.5 ? "text-emerald-600 dark:text-emerald-400 font-extrabold" : "text-amber-600 font-extrabold"}>
              {overallScore.toFixed(2)} / 10
            </span>
          </span>
        </div>
      </CardHeader>

      <CardContent className="p-4 pt-3">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Field</TableHead>
              <TableHead>Target Output (Qwen-Coder)</TableHead>
              <TableHead>Ground Truth (Grounded)</TableHead>
              <TableHead className="w-[120px] text-center">Score</TableHead>
              <TableHead>Evaluation Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fieldDiscrepancies.map((d) => (
              <TableRow key={d.field}>
                <TableCell className="font-mono font-bold text-foreground">{d.field}</TableCell>
                <TableCell className="font-mono text-xs whitespace-pre-wrap text-foreground">
                  {String(d.target ?? "—")}
                </TableCell>
                <TableCell className="font-mono text-xs whitespace-pre-wrap text-teal-600 dark:text-teal-400">
                  {String(d.ground_truth ?? "—")}
                </TableCell>
                <TableCell className="text-center">{getBadge(d.score)}</TableCell>
                <TableCell className="text-[0.75rem] text-muted-foreground">{d.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
