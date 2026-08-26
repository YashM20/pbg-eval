import { useState } from "react"
import { Cpu, Loader2, Play, Sparkles } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

const SAMPLE_PRESETS = [
  {
    name: "Clause 4 Negation Dropped",
    master: "4. The Guarantee / Undertaking herein contained shall be a continuing guarantee and shall not be anywise affected by any change in the constitution of the Supplier or the Bank.",
    vendor: "4. The Guarantee / Undertaking herein contained shall be a continuing guarantee and shall be anywise affected by any change in the constitution of the Supplier or the Bank.",
  },
  {
    name: "Clause 6 Jurisdiction Changed",
    master: "6. This Guarantee / Undertaking shall be governed by and construed in accordance with the laws of India and shall be subject to the exclusive jurisdiction of the Courts at New Delhi.",
    vendor: "6. This Guarantee / Undertaking shall be governed by and construed in accordance with the laws of India and shall be subject to the jurisdiction of the Courts at Kolkata.",
  },
  {
    name: "Payment Redirection in Footer",
    master: "We hereby undertake to pay the Corporation on first demand at New Delhi without protest or demur.",
    vendor: "We hereby undertake to pay the Corporation on first demand at New Delhi.\n\nNotwithstanding anything contained above, all claims under this guarantee will be payable at our Mumbai Nariman Point branch only.",
  },
  {
    name: "Clean Compliant PBG",
    master: "1. The Bank doth hereby undertake to pay the Corporation on first demand at New Delhi without protest or demur.",
    vendor: "1. The Bank doth hereby undertake to pay the Corporation on first demand at New Delhi without protest or demur.",
  },
]

const DEFAULT_PROMPT = `Compare these two Bank Guarantee texts and detect deviations in PBG fixed legal wording only.
Master Text: {{MASTER_TEXT}}
Vendor Text: {{VENDOR_TEXT}}

Return JSON:
{
  "deviations": [
    {
      "clauseNo": "4",
      "appearingInBg": "shall be anywise affected",
      "shouldBeCorrectedAs": "shall not be anywise affected",
      "severity": "CRITICAL",
      "reason": "Omitted 'not', reversing continuing liability."
    }
  ]
}`

export function PlaygroundPage() {
  const [masterText, setMasterText] = useState(SAMPLE_PRESETS[0].master)
  const [vendorText, setVendorText] = useState(SAMPLE_PRESETS[0].vendor)
  const [promptTemplate, setPromptTemplate] = useState(DEFAULT_PROMPT)
  const [modelName, setModelName] = useState("qwen3.5:9b")
  const [temperature, setTemperature] = useState(0.1)
  const [executing, setExecuting] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handlePreset = (preset: typeof SAMPLE_PRESETS[0]) => {
    setMasterText(preset.master)
    setVendorText(preset.vendor)
    setResult(null)
  }

  const handleRun = async () => {
    setExecuting(true)
    setError(null)
    try {
      const res = await fetch("/api/playground/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          master_text: masterText,
          vendor_text: vendorText,
          prompt_template: promptTemplate,
          model_name: modelName,
          temperature,
          auto_judge: true,
        }),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || res.statusText)
      }
      setResult(await res.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inference failed")
    } finally {
      setExecuting(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Interactive Prompt & Clause Playground</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Real-time clause scratchpad, instant token inference, and live Gemini judge scoring (&lt;3s).
        </p>
      </div>

      {/* Preset Quick Selectors */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-muted-foreground">Clause Presets:</span>
        {SAMPLE_PRESETS.map((p) => (
          <Button
            key={p.name}
            variant="outline"
            size="xs"
            onClick={() => handlePreset(p)}
            className="text-xs font-medium"
          >
            {p.name}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left Column: Scratchpads & Prompt */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="p-3.5 pb-2 border-b border-border/50">
              <CardTitle className="text-xs font-bold text-foreground">1. Master vs Vendor Text Scratchpad</CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[0.7rem] font-bold text-muted-foreground uppercase tracking-wider">
                  Master Format Clause:
                </label>
                <Textarea
                  value={masterText}
                  onChange={(e) => setMasterText(e.target.value)}
                  className="font-mono text-xs min-h-[80px]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[0.7rem] font-bold text-muted-foreground uppercase tracking-wider">
                  Vendor Document Clause:
                </label>
                <Textarea
                  value={vendorText}
                  onChange={(e) => setVendorText(e.target.value)}
                  className="font-mono text-xs min-h-[80px]"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3.5 pb-2 border-b border-border/50">
              <CardTitle className="text-xs font-bold text-foreground">2. Prompt Template Scratchpad</CardTitle>
            </CardHeader>
            <CardContent className="p-3.5 flex flex-col gap-3">
              <Textarea
                value={promptTemplate}
                onChange={(e) => setPromptTemplate(e.target.value)}
                className="font-mono text-xs min-h-[140px] leading-relaxed"
              />

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Model:</span>
                  <Input
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    className="w-32 h-7 text-xs font-mono"
                  />
                  <span className="text-xs text-muted-foreground">Temp:</span>
                  <Input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={temperature}
                    onChange={(e) => setTemperature(Number(e.target.value))}
                    className="w-16 h-7 text-xs font-mono"
                  />
                </div>

                <Button
                  onClick={handleRun}
                  disabled={executing || !masterText || !vendorText}
                  size="sm"
                  className="h-8 px-4 text-xs font-bold gap-1.5"
                >
                  {executing ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                  {executing ? "Executing..." : "⚡ Run Live Inference"}
                </Button>
              </div>

              {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Live Output & Judge Scoring */}
        <div className="flex flex-col gap-4">
          <Card className="h-full flex flex-col">
            <CardHeader className="p-3.5 pb-2 border-b border-border/50 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
                <Cpu className="size-3.5 text-teal-600" />
                Live Execution Output & Instant Judge
              </CardTitle>
              {result && (
                <span className="text-[0.7rem] text-muted-foreground font-mono">
                  Latency: {result.latency_seconds}s
                </span>
              )}
            </CardHeader>

            <CardContent className="p-3.5 flex-1 flex flex-col gap-3">
              {!result && !executing && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                  <Sparkles className="size-8 text-muted-foreground/30 mb-2" />
                  <span>Click "⚡ Run Live Inference" to test prompt and view live Gemini judge scoring.</span>
                </div>
              )}

              {executing && (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-xs text-teal-600">
                  <Loader2 className="size-8 animate-spin mb-2" />
                  <span className="font-semibold">Executing inference and grading with Gemini judge...</span>
                </div>
              )}

              {result && (
                <Tabs defaultValue="deviations" className="w-full flex-1 flex flex-col">
                  <TabsList className="h-8">
                    <TabsTrigger value="deviations" className="text-xs">
                      Deviations ({result.parsed_output?.deviations?.length || 0})
                    </TabsTrigger>
                    <TabsTrigger value="judge" className="text-xs">
                      Judge Scores
                    </TabsTrigger>
                    <TabsTrigger value="attribution" className="text-xs">
                      OCR / LLM Attribution
                    </TabsTrigger>
                    <TabsTrigger value="raw" className="text-xs">
                      Raw JSON
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="deviations" className="mt-2 flex-1">
                    <div className="flex flex-col gap-2">
                      {result.parsed_output?.deviations?.length > 0 ? (
                        result.parsed_output.deviations.map((d: any, i: number) => (
                          <div key={i} className="p-2.5 rounded-md border border-border bg-muted/40 text-xs flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Badge variant={d.severity === "CRITICAL" ? "destructive" : "warning"} className="text-[0.65rem] px-1.5 py-0 font-bold">
                                {d.severity}
                              </Badge>
                              <span className="font-bold text-foreground">Clause {d.clauseNo}</span>
                            </div>
                            <div className="font-mono text-[0.75rem] text-muted-foreground">
                              <span className="text-destructive font-semibold">Vendor: </span>"{d.appearingInBg}"
                            </div>
                            <div className="font-mono text-[0.75rem] text-muted-foreground">
                              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Corrected: </span>"{d.shouldBeCorrectedAs}"
                            </div>
                            <p className="text-[0.7rem] text-muted-foreground italic mt-0.5">{d.reason}</p>
                          </div>
                        ))
                      ) : (
                        <div className="p-4 text-center text-xs text-emerald-600 font-semibold">
                          ✓ No deviations detected (Compliant PBG).
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="judge" className="mt-2 flex-1">
                    {result.judge_evaluation ? (
                      <div className="flex flex-col gap-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {Object.entries(result.judge_evaluation.scores || {}).map(([k, v]) => (
                            <div key={k} className="p-2 rounded-md bg-muted/40 border border-border text-xs flex flex-col gap-0.5">
                              <span className="text-[0.65rem] uppercase font-bold text-muted-foreground">{k}</span>
                              <span className="text-base font-extrabold text-foreground">{String(v)} / 10</span>
                            </div>
                          ))}
                        </div>
                        {result.judge_evaluation.grader_notes && (
                          <div className="p-2.5 rounded-md bg-muted/20 border border-border text-xs">
                            <span className="font-semibold text-muted-foreground">Grader Audit Notes:</span>
                            <p className="mt-1 text-foreground/90">{result.judge_evaluation.grader_notes}</p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No judge evaluation available.</div>
                    )}
                  </TabsContent>

                  <TabsContent value="attribution" className="mt-2 flex-1">
                    <div className="flex flex-col gap-2">
                      {result.disambiguation?.attributed_deviations?.map((att: any, i: number) => (
                        <div key={i} className="p-2.5 rounded-md border border-border bg-card text-xs flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <Badge variant={att.attribution === "REAL_DEVIATION" ? "success" : att.attribution === "OCR_ARTIFACT" ? "warning" : "destructive"}>
                              {att.attribution}
                            </Badge>
                            <span className="font-bold">Clause {att.clause_no}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{att.attribution_reason}</p>
                        </div>
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="raw" className="mt-2 flex-1">
                    <ScrollArea className="max-h-[300px] rounded-md border border-border bg-background p-2.5 font-mono text-xs whitespace-pre-wrap">
                      {JSON.stringify(result.parsed_output, null, 2)}
                    </ScrollArea>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
