import { useState } from "react"
import { Search, Sparkles } from "lucide-react"

import type { RunRecord, ScoreStats } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatusBadge } from "@/components/shared/status-badge"
import { VarianceChart } from "@/components/shared/charts"
import { RunRow } from "./run-row"

interface RunsTableProps {
  runs: RunRecord[]
  varianceByDoc: Record<string, ScoreStats>
  onGradeAll: () => Promise<void>
  onRegradeSingle: (runId: number) => Promise<void>
  onReplaySingle: (runId: number) => Promise<void>
  grading: boolean
}

export function RunsTable({
  runs,
  varianceByDoc,
  onGradeAll,
  onRegradeSingle,
  onReplaySingle,
  grading,
}: RunsTableProps) {
  const [filterDoc, setFilterDoc] = useState("")

  const filteredRuns = filterDoc
    ? runs.filter((r) => r.doc_id.toLowerCase().includes(filterDoc.toLowerCase()))
    : runs

  const scoredRuns = filteredRuns
    .filter((r) => r.status === "scored")
    .sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0))
  const excludedRuns = filteredRuns.filter((r) => r.status === "excluded")
  const pendingRuns = filteredRuns.filter((r) => r.status === "pending")

  return (
    <div className="flex flex-col gap-5">
      {/* Search & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="relative w-full sm:w-64">
          <Search className="size-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input
            placeholder="Filter by doc ID..."
            value={filterDoc}
            onChange={(e) => setFilterDoc(e.target.value)}
            className="h-8 pl-8 text-xs font-mono"
          />
        </div>

        <Button
          type="button"
          size="sm"
          onClick={onGradeAll}
          disabled={grading}
          className="h-8 px-3 text-xs gap-1.5 font-bold"
        >
          <Sparkles className="size-3.5" />
          {grading ? "Evaluating Runs..." : "Grade All Pending Runs"}
        </Button>
      </div>

      {/* Document Variance Chart */}
      {Object.keys(varianceByDoc).length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs font-bold text-foreground">
              Document Score Variance & Stability Analysis
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <VarianceChart variance={varianceByDoc} />
          </CardContent>
        </Card>
      )}

      {/* Scored Runs Table */}
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-border/50">
          <CardTitle className="text-xs font-bold text-foreground">
            Scored Comparison & Extraction Runs ({scoredRuns.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {scoredRuns.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No scored runs matching search filter.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="font-bold text-foreground">Doc ID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead className="text-right text-primary font-bold">Comp Score</TableHead>
                  <TableHead className="text-right text-teal-600 dark:text-teal-400 font-bold">Extract Score</TableHead>
                  <TableHead className="text-right">Recall</TableHead>
                  <TableHead className="text-right">Precision</TableHead>
                  <TableHead className="text-right">Severity</TableHead>
                  <TableHead className="text-right">Schema</TableHead>
                  <TableHead className="text-center">Heals</TableHead>
                  <TableHead className="text-right">Audits & Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scoredRuns.map((r) => (
                  <RunRow
                    key={r.id}
                    run={r}
                    onRegradeSingle={onRegradeSingle}
                    onReplaySingle={onReplaySingle}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pending Runs List */}
      {pendingRuns.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs font-bold text-foreground">
              Pending Evaluation Runs ({pendingRuns.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc ID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Heals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingRuns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-semibold">{r.doc_id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.timestamp?.slice(0, 19).replace("T", " ") || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={r.status} />
                    </TableCell>
                    <TableCell className="text-center">{r.heal_count || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Excluded Runs List */}
      {excludedRuns.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs font-bold text-foreground">
              Excluded Plumbing Failures ({excludedRuns.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc ID</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Exclusion Reason</TableHead>
                  <TableHead className="text-center">Heals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {excludedRuns.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono font-semibold">{r.doc_id}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {r.timestamp?.slice(0, 19).replace("T", " ") || "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-destructive">
                      {r.exclusion_reason || "—"}
                    </TableCell>
                    <TableCell className="text-center">{r.heal_count || 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
