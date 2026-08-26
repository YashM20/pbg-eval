import { useState } from "react"
import { AlertTriangle, CheckCircle2, Loader2, StopCircle } from "lucide-react"

import { api } from "@/api/client"
import type { BatchDocStatus, BatchStatus } from "@/api/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface JobProgressProps {
  status: BatchStatus | null
  error: string | null
}

function docState(d: BatchDocStatus) {
  if (d.excluded > 0 && d.completed === d.total) return "failed"
  if (d.completed === d.total) return "done"
  if (d.completed > 0) return "running"
  return "pending"
}

function DocRow({ doc }: { doc: BatchDocStatus }) {
  const state = docState(doc)
  const pct = doc.total > 0 ? Math.round((doc.completed / doc.total) * 100) : 0

  return (
    <li className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 p-2 rounded-md bg-background border border-border text-xs">
      <div className="flex items-center gap-2">
        {state === "running" && <Loader2 className="size-3.5 text-teal-600 animate-spin shrink-0" />}
        {state === "done" && <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />}
        {state === "failed" && <AlertTriangle className="size-3.5 text-destructive shrink-0" />}
        <span className="font-mono font-semibold text-foreground">{doc.doc_id}</span>
      </div>
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>{doc.completed}/{doc.total} ({pct}%)</span>
        {doc.excluded > 0 && (
          <Badge variant="destructive" className="text-[0.65rem] px-1.5 py-0">
            {doc.excluded} excluded
          </Badge>
        )}
      </div>
      {doc.error && state === "failed" && (
        <span className="text-[0.7rem] text-destructive break-all mt-1 sm:mt-0">{doc.error}</span>
      )}
    </li>
  )
}

export function JobProgress({ status, error }: JobProgressProps) {
  const [stopping, setStopping] = useState(false)

  const handleStop = async () => {
    if (!status) return
    setStopping(true)
    try {
      await api.stopBatch(status.batch_id)
    } catch (e) {
      console.error("Failed to stop batch:", e)
    } finally {
      setStopping(false)
    }
  }

  if (error) {
    return (
      <Alert variant="destructive" className="mt-4">
        <AlertTriangle className="size-4" />
        <AlertTitle>Batch Initialization Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!status) {
    return (
      <Card className="mt-4 border-dashed border-teal-500/40 bg-teal-500/5 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-400">
          <Loader2 className="size-4 animate-spin" />
          <span>Starting evaluation batch on backend...</span>
        </div>
      </Card>
    )
  }

  const pct = status.total > 0 ? Math.round((status.completed / status.total) * 100) : 0
  const isRunning = status.status === "running"
  const isDone = status.status === "done" || status.status === "completed"
  const isStopped = status.status === "stopped"
  const isFailed = status.status === "failed"

  return (
    <Card className="mt-4 border-border bg-card shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2.5">
          <CardTitle className="text-sm font-bold">
            Batch #{status.batch_id} Execution
          </CardTitle>
          {isRunning && (
            <Badge variant="teal" className="flex items-center gap-1 text-[0.7rem]">
              <Loader2 className="size-3 animate-spin" />
              Comparing
            </Badge>
          )}
          {isDone && <Badge variant="success">Completed</Badge>}
          {isStopped && <Badge variant="warning">✓ Stopped & GPU Evicted</Badge>}
          {isFailed && <Badge variant="destructive">Failed</Badge>}
        </div>

        {isRunning && (
          <Button
            variant="destructive"
            size="sm"
            disabled={stopping}
            onClick={handleStop}
            className="h-7 text-xs gap-1"
          >
            <StopCircle className="size-3.5" />
            {stopping ? "Stopping..." : "Stop Batch"}
          </Button>
        )}
      </CardHeader>

      <CardContent className="p-4 pt-2 flex flex-col gap-3">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{status.completed} of {status.total} comparisons completed</span>
          <span className="font-bold text-foreground">{pct}%</span>
        </div>

        <Progress value={pct} className="h-2.5" indicatorClassName={isDone ? "bg-emerald-600" : isFailed ? "bg-destructive" : "bg-primary"} />

        {status.error && (
          <Alert variant="destructive" className="py-2 px-3 text-xs">
            <AlertDescription>{status.error}</AlertDescription>
          </Alert>
        )}

        {status.docs && status.docs.length > 0 && (
          <div className="mt-2 flex flex-col gap-1.5">
            <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-muted-foreground">
              Document Progress Breakdown
            </span>
            <ul className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
              {status.docs.map((d) => (
                <DocRow key={d.doc_id} doc={d} />
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
