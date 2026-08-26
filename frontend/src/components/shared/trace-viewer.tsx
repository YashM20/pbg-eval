import { useEffect, useState } from "react"
import { AlertCircle, AlertTriangle, Check, Copy, Cpu, Loader2 } from "lucide-react"

import { api } from "@/api/client"
import type { TraceAnalysisResult } from "@/api/types"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ScrollArea } from "@/components/ui/scroll-area"

interface TraceViewerProps {
  runId: number
  traceText?: string | null
}

export function TraceViewer({ runId, traceText }: TraceViewerProps) {
  const [analysis, setAnalysis] = useState<TraceAnalysisResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .getTraceAnalysis(runId)
      .then((res) => {
        if (active) setAnalysis(res)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [runId])

  const copyTrace = () => {
    if (!traceText) return
    navigator.clipboard.writeText(traceText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-border/80 bg-card/60 shadow-xs">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/50">
        <div className="flex items-center gap-2">
          <Cpu className="size-4 text-teal-600 dark:text-teal-400" />
          <CardTitle className="text-xs font-bold text-foreground">
            Reasoning Chain & Thinking Trace Deep-Diagnostics
          </CardTitle>
          {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
        </div>
        {analysis && (
          <div className="flex items-center gap-2 text-[0.7rem] text-muted-foreground font-mono">
            <span>Thinking: ~{analysis.thinking_tokens_est} tok</span>
            <span>·</span>
            <span>Content: ~{analysis.content_tokens_est} tok</span>
          </div>
        )}
      </CardHeader>

      <CardContent className="p-4 flex flex-col gap-3">
        {analysis && (
          <div className="flex flex-col gap-2.5">
            {/* Token Overhead Ratio */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[0.75rem] text-muted-foreground">
                <span>Reasoning Overhead Ratio</span>
                <span className="font-semibold text-foreground">{(analysis.ratio * 100).toFixed(0)}% thinking tokens</span>
              </div>
              <Progress
                value={analysis.ratio * 100}
                className="h-2"
                indicatorClassName={analysis.ratio > 0.8 ? "bg-amber-500" : "bg-teal-600"}
              />
            </div>

            {/* Traversal Milestones */}
            {analysis.milestones_evaluated.length > 0 && (
              <div className="flex flex-col gap-1 mt-1">
                <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-muted-foreground">
                  Evaluated Traversal Sections
                </span>
                <div className="flex flex-wrap gap-1">
                  {analysis.milestones_evaluated.map((m) => (
                    <Badge key={m} variant="teal" className="text-[0.65rem] px-1.5 py-0">
                      ✓ {m}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Discrepancy Alert */}
            {analysis.discrepancies.length > 0 && (
              <Alert variant="destructive" className="py-2.5 px-3">
                <AlertCircle className="size-4" />
                <AlertTitle className="text-xs">Reasoning vs JSON Output Discrepancy</AlertTitle>
                <AlertDescription className="text-xs mt-1">
                  <ul className="list-disc pl-4 space-y-0.5">
                    {analysis.discrepancies.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            {/* Repetition Loop Alert */}
            {analysis.repetition_score > 0.15 && (
              <Alert variant="warning" className="py-2.5 px-3">
                <AlertTriangle className="size-4" />
                <AlertTitle className="text-xs">Cyclical Repetition Loop Warning</AlertTitle>
                <AlertDescription className="text-xs mt-0.5">
                  Model repeated {analysis.repeated_phrases.length} reasoning phrasing segments.
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* Trace Monospace Box */}
        <div className="relative rounded-md border border-border bg-background p-3">
          <div className="flex justify-between items-center mb-1.5 pb-1 border-b border-border text-[0.7rem] text-muted-foreground">
            <span className="font-semibold uppercase tracking-wider">Raw Thinking Trace Output</span>
            <Button
              variant="ghost"
              size="xs"
              onClick={copyTrace}
              className="h-5 px-1.5 text-[0.65rem] gap-1"
            >
              {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
              {copied ? "Copied" : "Copy Trace"}
            </Button>
          </div>
          <ScrollArea className="max-h-[300px]">
            <pre className="font-mono text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {traceText || "No raw thinking trace captured for this run."}
            </pre>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
