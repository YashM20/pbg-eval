import type { ClauseSectionMetric } from "@/api/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ClauseMatrixViewProps {
  clauseMatrix: ClauseSectionMetric[]
}

export function ClauseMatrixView({ clauseMatrix }: ClauseMatrixViewProps) {
  const anomalySections = clauseMatrix.filter(
    (s) => s.sample_errors && s.sample_errors.length > 0
  )

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-border/50">
          <CardTitle className="text-xs font-bold text-foreground">
            Canonical Section Confusion Matrix & Accuracy Metrics
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold text-foreground">Section</TableHead>
                <TableHead className="text-right">TP</TableHead>
                <TableHead className="text-right">FP</TableHead>
                <TableHead className="text-right">FN</TableHead>
                <TableHead className="text-right">Recall</TableHead>
                <TableHead className="text-right">Precision</TableHead>
                <TableHead className="text-right font-bold text-primary">F1 Score</TableHead>
                <TableHead className="text-right">Critical</TableHead>
                <TableHead className="text-right">Major</TableHead>
                <TableHead className="text-right">Minor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clauseMatrix.map((sec) => {
                const isHighAccuracy = sec.f1_score >= 0.9
                const isWarning = sec.f1_score < 0.75

                return (
                  <TableRow key={sec.section}>
                    <TableCell className="font-semibold text-foreground">{sec.section}</TableCell>
                    <TableCell className="text-right font-mono">{sec.true_positives}</TableCell>
                    <TableCell className={`text-right font-mono ${sec.false_positives > 0 ? "text-destructive font-bold" : ""}`}>
                      {sec.false_positives}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${sec.false_negatives > 0 ? "text-amber-600 font-bold" : ""}`}>
                      {sec.false_negatives}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isHighAccuracy ? "text-emerald-600 dark:text-emerald-400" : isWarning ? "text-amber-600" : ""}`}>
                      {(sec.recall * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${isHighAccuracy ? "text-emerald-600 dark:text-emerald-400" : isWarning ? "text-amber-600" : ""}`}>
                      {(sec.precision * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell className={`text-right font-mono font-black ${isHighAccuracy ? "text-emerald-600 dark:text-emerald-400" : isWarning ? "text-destructive" : "text-foreground"}`}>
                      {sec.f1_score.toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{sec.critical_count}</TableCell>
                    <TableCell className="text-right font-mono">{sec.major_count}</TableCell>
                    <TableCell className="text-right font-mono">{sec.minor_count}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Anomaly Clusters */}
      {anomalySections.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs font-bold text-teal-600 dark:text-teal-400">
              Identified Section Anomaly Clusters & Sample Failures
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {anomalySections.map((s) => (
                <div key={s.section} className="flex flex-col gap-2 p-3 rounded-md border border-border bg-muted/30">
                  <span className="font-bold text-xs text-foreground">{s.section}</span>
                  <div className="flex flex-col gap-1.5">
                    {s.sample_errors.map((err, i) => (
                      <Alert
                        key={i}
                        variant={err.type.includes("Positive") ? "destructive" : "warning"}
                        className="py-1.5 px-2.5 text-xs"
                      >
                        <AlertDescription className="text-xs">
                          <strong>{err.type} ({err.doc_id}):</strong> {err.details}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
