import { useState } from "react"
import { Check, Copy, Flame } from "lucide-react"

import type { PromptCandidate } from "@/api/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

interface PromptCandidatesViewProps {
  candidates: PromptCandidate[]
}

export function PromptCandidatesView({ candidates }: PromptCandidatesViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [copied, setCopied] = useState(false)

  if (candidates.length === 0) return null

  const selectedCandidate = candidates[selectedIndex] || candidates[0]

  const copyPrompt = () => {
    if (!selectedCandidate) return
    navigator.clipboard.writeText(selectedCandidate.mutated_prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card>
      <CardHeader className="p-4 pb-2 border-b border-border/50">
        <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
          <Flame className="size-3.5 text-primary" />
          2. Evolved Prompt Candidates ({candidates.length})
        </CardTitle>
      </CardHeader>

      <CardContent className="p-4 pt-3 flex flex-col gap-3">
        {/* Candidate Tabs */}
        <div className="flex flex-wrap gap-1.5">
          {candidates.map((c, i) => (
            <Button
              key={i}
              type="button"
              variant={selectedIndex === i ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedIndex(i)}
              className="text-xs h-7"
            >
              {c.name}
            </Button>
          ))}
        </div>

        {/* Selected Candidate Panel */}
        <div className="rounded-lg border border-border bg-card p-4 flex flex-col gap-2.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/50 pb-2">
            <div>
              <h4 className="text-xs font-bold text-foreground">{selectedCandidate.name}</h4>
              <p className="text-xs text-teal-600 dark:text-teal-400 mt-0.5">
                Strategy: {selectedCandidate.strategy}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={copyPrompt}
                className="gap-1 text-xs"
              >
                {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                {copied ? "Copied" : "Copy Prompt"}
              </Button>
            </div>
          </div>

          <ScrollArea className="max-h-[360px] rounded-md border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {selectedCandidate.mutated_prompt}
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
