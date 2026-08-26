import { useState } from "react"
import { Loader2, RefreshCw, Repeat } from "lucide-react"

import type { RunRecord } from "@/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TableCell, TableRow } from "@/components/ui/table"
import { MetadataDiffViewer } from "@/components/shared/metadata-diff-viewer"
import { TraceViewer } from "@/components/shared/trace-viewer"
import { formatJson } from "@/components/shared/formatters"

interface RunRowProps {
  run: RunRecord
  onRegradeSingle: (runId: number) => Promise<void>
  onReplaySingle: (runId: number) => Promise<void>
}

export function RunRow({ run, onRegradeSingle, onReplaySingle }: RunRowProps) {
  const [openAudit, setOpenAudit] = useState(false)
  const [openExtract, setOpenExtract] = useState(false)
  const [openTrace, setOpenTrace] = useState(false)
  const [acting, setActing] = useState(false)

  const hasAudit = Boolean(run.grader_notes || run.independent_read)
  const hasExtract = Boolean(run.field_discrepancies && run.field_discrepancies.length > 0)
  const hasTrace = Boolean(run.thinking_trace)

  const handleRegrade = async () => {
    setActing(true)
    try {
      await onRegradeSingle(run.id)
    } finally {
      setActing(false)
    }
  }

  const handleReplay = async () => {
    setActing(true)
    try {
      await onReplaySingle(run.id)
    } finally {
      setActing(false)
    }
  }

  const compScore = run.overall_score
  const extScore = run.overall_extraction_score

  return (
    <>
      <TableRow className="text-xs">
        <TableCell className="font-mono font-bold text-foreground">
          {run.doc_id}{" "}
          {run.is_replay ? (
            <Badge variant="teal" className="text-[0.6rem] px-1 py-0 ml-1">
              Replay
            </Badge>
          ) : null}
        </TableCell>

        <TableCell className="font-mono text-[0.7rem] text-muted-foreground">
          {run.timestamp?.slice(0, 19).replace("T", " ") || "—"}
        </TableCell>

        <TableCell className="text-right font-extrabold text-sm">
          <span className={(compScore ?? 0) >= 7.5 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600"}>
            {compScore?.toFixed(1) ?? "—"}
          </span>
        </TableCell>

        <TableCell className="text-right font-extrabold text-sm">
          <span className={(extScore ?? 0) >= 7.5 ? "text-teal-600 dark:text-teal-400" : "text-amber-600"}>
            {extScore ? extScore.toFixed(1) : run.extraction_ok ? "✓" : "✗"}
          </span>
        </TableCell>

        <TableCell className="text-right font-mono">{run.deviation_recall?.toFixed(1) ?? "—"}</TableCell>
        <TableCell className="text-right font-mono">{run.deviation_precision?.toFixed(1) ?? "—"}</TableCell>
        <TableCell className="text-right font-mono">{run.severity_correctness?.toFixed(1) ?? "—"}</TableCell>
        <TableCell className="text-right font-mono">{run.schema_integrity?.toFixed(1) ?? "—"}</TableCell>

        <TableCell className="text-center">
          {run.heal_count ? (
            <Badge variant="teal" className="text-[0.65rem] px-1 py-0">
              {run.heal_count}
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">0</span>
          )}
        </TableCell>

        <TableCell className="text-right">
          <div className="flex items-center justify-end gap-1">
            {hasAudit && (
              <Button
                variant={openAudit ? "default" : "outline"}
                size="xs"
                onClick={() => setOpenAudit(!openAudit)}
                className="h-6 px-1.5 text-[0.65rem]"
              >
                Grader
              </Button>
            )}

            {hasExtract && (
              <Button
                variant={openExtract ? "teal" : "outline"}
                size="xs"
                onClick={() => setOpenExtract(!openExtract)}
                className="h-6 px-1.5 text-[0.65rem] border-teal-500/30 text-teal-600 dark:text-teal-400"
              >
                Extract
              </Button>
            )}

            {hasTrace && (
              <Button
                variant={openTrace ? "default" : "outline"}
                size="xs"
                onClick={() => setOpenTrace(!openTrace)}
                className="h-6 px-1.5 text-[0.65rem]"
              >
                Trace
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon-sm"
              title="Regrade with LLM judge"
              onClick={handleRegrade}
              disabled={acting}
              className="text-muted-foreground hover:text-foreground"
            >
              {acting ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" />}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              title="Replay run on backend"
              onClick={handleReplay}
              disabled={acting}
              className="text-muted-foreground hover:text-foreground"
            >
              <Repeat className="size-3 text-teal-600" />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Inline Lazy Mounted Drawers */}
      {openAudit && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={10} className="p-3">
            <div className="rounded-md border border-border bg-card p-3 flex flex-col gap-2">
              <span className="text-xs font-bold text-foreground">Gemini LLM Judge Audit</span>
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] uppercase font-semibold text-muted-foreground">Grader Notes:</span>
                <pre className="font-mono text-xs text-foreground/90 whitespace-pre-wrap bg-background p-2 rounded border border-border">
                  {run.grader_notes || "—"}
                </pre>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[0.7rem] uppercase font-semibold text-muted-foreground">
                  Independent Ground-Truth Derivation:
                </span>
                <pre className="font-mono text-xs text-teal-600 dark:text-teal-400 whitespace-pre-wrap bg-background p-2 rounded border border-border max-h-[200px] overflow-auto">
                  {formatJson(run.independent_read)}
                </pre>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}

      {openExtract && run.field_discrepancies && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={10} className="p-3">
            <MetadataDiffViewer
              fieldDiscrepancies={run.field_discrepancies}
              overallScore={run.overall_extraction_score || 0}
            />
          </TableCell>
        </TableRow>
      )}

      {openTrace && hasTrace && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={10} className="p-3">
            <TraceViewer runId={run.id} traceText={run.thinking_trace} />
          </TableCell>
        </TableRow>
      )}
    </>
  )
}
