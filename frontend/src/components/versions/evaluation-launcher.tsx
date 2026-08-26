import { useState } from "react"
import { Clock, FileText, Flame, FolderOpen, Loader2, UploadCloud, Zap } from "lucide-react"

import { api } from "@/api/client"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type LauncherMode = "smoke" | "discovered" | "upload" | "dir"

interface EvaluationLauncherProps {
  version: string
  setVersion: (v: string) => void
  discoveredDocs: any[]
  onBatchStarted: (batchId: number) => void
}

export function EvaluationLauncher({
  version,
  setVersion,
  discoveredDocs,
  onBatchStarted,
}: EvaluationLauncherProps) {
  const [mode, setMode] = useState<LauncherMode>("discovered")
  const [repeats, setRepeats] = useState(3)
  const [docsDir, setDocsDir] = useState("sample_docs")
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [allowProd, setAllowProd] = useState(false)
  const [autoGrade, setAutoGrade] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculate estimated comparisons and runtime
  const docCount =
    mode === "smoke"
      ? 1
      : mode === "upload"
        ? selectedFiles.length || 1
        : mode === "discovered"
          ? discoveredDocs.length || 1
          : 6
  const repeatCount = mode === "smoke" ? 1 : repeats
  const totalComparisons = docCount * repeatCount
  const estMinutes = Math.max(2, Math.round(totalComparisons * 3.5))

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFiles(Array.from(e.target.files))
    }
  }

  const startBatch = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      let res
      if (mode === "smoke") {
        res = await api.startBatch({
          version: version ? `${version}-smoke` : "smoke-test",
          docs_dir: "fixtures/example",
          repeats: 1,
          allow_prod: allowProd,
          auto_grade: autoGrade,
        })
      } else if (mode === "upload") {
        if (selectedFiles.length === 0) {
          throw new Error("Please select at least one PDF file to upload")
        }
        res = await api.startBatchWithUpload(selectedFiles, {
          version,
          repeats,
          allowProd,
          autoGrade,
        })
      } else {
        const targetDir = mode === "discovered" ? "sample_docs" : docsDir
        res = await api.startBatch({
          version,
          docs_dir: targetDir,
          repeats,
          allow_prod: allowProd,
          auto_grade: autoGrade,
        })
      }
      onBatchStarted(res.batch_id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch failed to start")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-border bg-card shadow-xs">
      <CardHeader className="p-5 pb-3 flex flex-row items-center justify-between border-b border-border/50">
        <div>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Zap className="size-4 text-primary" />
            Evaluation Suite Launcher
          </CardTitle>
          <span className="text-[0.7rem] text-muted-foreground">
            Launch benchmark suites with automated fault healing and multi-grading
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={autoGrade}
              onChange={(e) => setAutoGrade(e.target.checked)}
              className="rounded border-border text-primary focus:ring-primary"
            />
            Auto-Grade
          </label>
          <Badge variant="teal" className="text-[0.65rem] px-2 py-0.5">
            ✓ Multi-Grading Enabled
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-4">
        {/* Mode Selector Tabs */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          <Button
            type="button"
            variant={mode === "smoke" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("smoke")}
            className="text-xs gap-1.5"
          >
            <Zap className="size-3.5 text-amber-300" />
            ⚡ Quick Smoke Test (1 Doc, ~3m)
          </Button>

          <Button
            type="button"
            variant={mode === "discovered" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("discovered")}
            className="text-xs gap-1.5"
          >
            <Flame className="size-3.5 text-primary" />
            🏆 Benchmark Corpus ({discoveredDocs.length} PDFs)
          </Button>

          <Button
            type="button"
            variant={mode === "upload" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("upload")}
            className="text-xs gap-1.5"
          >
            <UploadCloud className="size-3.5" />
            Upload PDFs
          </Button>

          <Button
            type="button"
            variant={mode === "dir" ? "default" : "outline"}
            size="sm"
            onClick={() => setMode("dir")}
            className="text-xs gap-1.5"
          >
            <FolderOpen className="size-3.5" />
            Custom Server Path
          </Button>
        </div>

        <form onSubmit={startBatch} className="flex flex-col gap-3.5">
          {/* Version and Repeats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="version">
                Target Version Label
              </label>
              <Input
                id="version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g. v1.4"
                required
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="repeats">
                Repeats per Document
              </label>
              <Input
                id="repeats"
                type="number"
                min={1}
                max={20}
                value={mode === "smoke" ? 1 : repeats}
                disabled={mode === "smoke"}
                onChange={(e) => setRepeats(Number(e.target.value))}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          {/* Mode-Specific Content */}
          {mode === "discovered" && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <div className="flex justify-between items-center mb-1.5 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Auto-Detected Benchmark Corpus:</span>
                <span>{discoveredDocs.length} documents</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {discoveredDocs.map((d) => (
                  <Badge key={d.doc_id} variant="outline" className="font-mono text-[0.65rem] gap-1 bg-background">
                    <FileText className="size-2.5 text-teal-600" />
                    {d.filename}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {mode === "upload" && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-foreground">Select PDF Files:</label>
              <Input
                type="file"
                accept="application/pdf,.pdf,.json"
                multiple
                onChange={handleFileChange}
                className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-primary-foreground"
              />
              {selectedFiles.length > 0 && (
                <span className="text-[0.7rem] text-muted-foreground">
                  {selectedFiles.length} files selected ({(selectedFiles.reduce((a, f) => a + f.size, 0) / 1024 / 1024).toFixed(2)} MB)
                </span>
              )}
            </div>
          )}

          {mode === "dir" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="docs_dir">
                Server Directory Path:
              </label>
              <Input
                id="docs_dir"
                value={docsDir}
                onChange={(e) => setDocsDir(e.target.value)}
                required
                className="h-8 text-xs font-mono"
              />
            </div>
          )}

          {/* Options & Runtime Estimator */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-border">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Clock className="size-3.5 text-amber-500" />
              <span>
                {docCount} Docs × {repeatCount} Reps = <strong>{totalComparisons} Runs</strong> · Est: ~{estMinutes} mins
              </span>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowProd}
                  onChange={(e) => setAllowProd(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary"
                />
                Allow Prod
              </label>

              <Button type="submit" disabled={submitting} size="sm" className="h-8 px-4 text-xs gap-1.5 font-bold">
                {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Zap className="size-3.5" />}
                {submitting ? "Launching..." : mode === "smoke" ? "Run Smoke Test" : "Start Evaluation Suite"}
              </Button>
            </div>
          </div>

          {error && <p className="text-xs font-semibold text-destructive">{error}</p>}
        </form>
      </CardContent>
    </Card>
  )
}
