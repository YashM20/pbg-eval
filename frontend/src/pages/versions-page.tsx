import { useCallback, useEffect, useState } from "react"
import { api } from "@/api/client"
import type { PipelineVersion } from "@/api/types"
import { JobProgress } from "@/components/shared/job-progress"
import { VersionMeanChart } from "@/components/shared/charts"
import { EvaluationLauncher } from "@/components/versions/evaluation-launcher"
import { LeaderboardTable } from "@/components/versions/leaderboard-table"
import { usePollBatch } from "@/hooks/usePollBatch"

export function VersionsPage() {
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [discoveredDocs, setDiscoveredDocs] = useState<any[]>([])
  const [version, setVersion] = useState("v1.0")
  const [loading, setLoading] = useState(true)
  const [batchId, setBatchId] = useState<number | null>(null)

  const { status: batchStatus, error: pollError } = usePollBatch(batchId)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [verList, suggestRes, discRes] = await Promise.all([
        api.listVersions(),
        api.suggestVersionLabel().catch(() => ({ suggested_label: "v1.0" })),
        api.discoverDocuments().catch(() => ({ documents: [] })),
      ])
      setVersions(verList)
      setVersion(suggestRes.suggested_label)
      setDiscoveredDocs(discRes.documents)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Universal terminal state refresh
  useEffect(() => {
    if (batchStatus?.status && ["completed", "done", "failed", "stopped"].includes(batchStatus.status)) {
      load()
    }
  }, [batchStatus?.status, load])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Evaluation Hub & Leaderboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Benchmark semantic comparison accuracy, metadata extraction quality, and system self-healing across pipeline versions.
        </p>
      </div>

      {/* 1-Click Evaluation Launcher */}
      <EvaluationLauncher
        version={version}
        setVersion={setVersion}
        discoveredDocs={discoveredDocs}
        onBatchStarted={(id) => setBatchId(id)}
      />

      {/* Live Batch Progress */}
      {batchId !== null && <JobProgress status={batchStatus} error={pollError} />}

      {/* Overview Chart & Leaderboard */}
      {loading && versions.length === 0 ? (
        <div className="p-8 text-center text-xs text-muted-foreground">Loading pipeline versions…</div>
      ) : (
        <>
          {versions.length > 0 && <VersionMeanChart versions={versions} />}
          <LeaderboardTable versions={versions} />
        </>
      )}
    </div>
  )
}
