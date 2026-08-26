import { useCallback, useEffect, useState } from "react"
import { useParams } from "react-router-dom"
import { api } from "@/api/client"
import type { UnifiedVersionWorkspaceResponse } from "@/api/types"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AIHealthBanner } from "@/components/version-workspace/ai-health-banner"
import { ClauseMatrixView } from "@/components/version-workspace/clause-matrix-view"
import { ExtractionQualityView } from "@/components/version-workspace/extraction-quality-view"
import { ProvenanceDrawer } from "@/components/version-workspace/provenance-drawer"
import { RunsTable } from "@/components/version-workspace/runs-table"
import { WorkspaceHeader } from "@/components/version-workspace/workspace-header"

export function VersionWorkspacePage() {
  const { label = "" } = useParams()
  const [data, setData] = useState<UnifiedVersionWorkspaceResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openProvenance, setOpenProvenance] = useState(false)
  const [grading, setGrading] = useState(false)

  const load = useCallback(async () => {
    if (!label) return
    setLoading(true)
    try {
      const res = await api.getVersionWorkspace(label)
      setData(res)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load version workspace")
    } finally {
      setLoading(false)
    }
  }, [label])

  useEffect(() => {
    load()
  }, [load])

  const handleGradeAll = async () => {
    setGrading(true)
    try {
      await api.gradeVersion(label)
      await load()
    } finally {
      setGrading(false)
    }
  }

  const handleRegradeSingle = async (runId: number) => {
    await api.regradeRun(runId)
    await load()
  }

  const handleReplaySingle = async (runId: number) => {
    await api.replayRun(runId)
    await load()
  }

  if (loading && !data) {
    return <div className="p-12 text-center text-xs text-muted-foreground">Loading version workspace for {label}…</div>
  }

  if (error && !data) {
    return <div className="p-12 text-center text-xs text-destructive">{error}</div>
  }

  if (!data) return null

  const { version, summary, health_insights, runs, variance_by_doc, clause_matrix, extraction_breakdown } = data

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Header & Metric Hero */}
      <WorkspaceHeader
        version={version}
        summary={summary}
        openProvenance={openProvenance}
        onToggleProvenance={() => setOpenProvenance(!openProvenance)}
      />

      {/* 2. Scientific Provenance Drawer */}
      {openProvenance && <ProvenanceDrawer version={version} />}

      {/* 3. Proactive AI Health Banner */}
      <AIHealthBanner
        healthInsights={health_insights}
        totalRuns={summary.total_runs}
        sectionCount={clause_matrix.length}
      />

      {/* 4. Multi-View Workspace Tabs */}
      <Tabs defaultValue="runs" className="w-full">
        <TabsList>
          <TabsTrigger value="runs">
            Scored Runs & Traces ({runs.length})
          </TabsTrigger>
          <TabsTrigger value="clauses">
            Clause Confusion Matrix ({clause_matrix.length} sections)
          </TabsTrigger>
          <TabsTrigger value="extraction">
            Metadata Extraction ({extraction_breakdown.length} fields)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="runs" className="mt-4">
          <RunsTable
            runs={runs}
            varianceByDoc={variance_by_doc}
            onGradeAll={handleGradeAll}
            onRegradeSingle={handleRegradeSingle}
            onReplaySingle={handleReplaySingle}
            grading={grading}
          />
        </TabsContent>

        <TabsContent value="clauses" className="mt-4">
          <ClauseMatrixView clauseMatrix={clause_matrix} />
        </TabsContent>

        <TabsContent value="extraction" className="mt-4">
          <ExtractionQualityView extractionBreakdown={extraction_breakdown} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
