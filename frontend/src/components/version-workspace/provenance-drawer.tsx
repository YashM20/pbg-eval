import { useState } from "react"
import { Check, Copy, Microchip } from "lucide-react"

import type { PipelineVersion } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ProvenanceDrawerProps {
  version: PipelineVersion
}

export function ProvenanceDrawer({ version }: ProvenanceDrawerProps) {
  const [copied, setCopied] = useState(false)

  const copyPrompt = () => {
    if (!version.prompt_text) return
    navigator.clipboard.writeText(version.prompt_text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="border-teal-500/40 bg-card/90 shadow-sm">
      <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between border-b border-border/60">
        <div className="flex items-center gap-2">
          <Microchip className="size-4 text-teal-600 dark:text-teal-400" />
          <CardTitle className="text-xs font-bold text-teal-700 dark:text-teal-400">
            Evaluation Provenance & Scientific Reproducibility Block
          </CardTitle>
        </div>
        <span className="text-[0.7rem] text-muted-foreground font-mono">
          Deterministic snapshot of parameters, models, and prompts
        </span>
      </CardHeader>

      <CardContent className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="flex flex-col gap-0.5 p-2.5 rounded-md bg-muted/40 border border-border">
            <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">
              Ollama Model Tag
            </span>
            <span className="font-mono text-xs font-semibold text-foreground">
              {version.model_config || "qwen3.5:9b"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2.5 rounded-md bg-muted/40 border border-border">
            <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">
              Inference Parameters
            </span>
            <span className="font-mono text-xs text-foreground">
              {version.hyperparameters || "temp=0.1, ctx=50k, rep_p=1.7"}
            </span>
          </div>

          <div className="flex flex-col gap-0.5 p-2.5 rounded-md bg-muted/40 border border-border">
            <span className="text-[0.65rem] uppercase font-bold text-muted-foreground tracking-wider">
              LLM Judge
            </span>
            <span className="font-mono text-xs text-foreground">
              gemini-2.0-flash (Two-Call Derive & Score)
            </span>
          </div>
        </div>

        {version.prompt_text && (
          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-foreground text-[0.7rem] uppercase tracking-wider">
                Verbatim System Prompt Snapshot
              </span>
              <Button
                variant="ghost"
                size="xs"
                onClick={copyPrompt}
                className="h-6 px-2 text-[0.65rem] gap-1 text-muted-foreground hover:text-foreground"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copied ? "Copied" : "Copy Prompt"}
              </Button>
            </div>
            <ScrollArea className="max-h-[160px] rounded-md border border-border bg-background p-2.5 font-mono text-[0.75rem] leading-relaxed text-foreground/90">
              {version.prompt_text}
            </ScrollArea>
          </div>
        )}

        {version.notes && (
          <div className="text-xs text-muted-foreground pt-1 border-t border-border">
            <strong>Notes: </strong>
            <span>{version.notes}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
