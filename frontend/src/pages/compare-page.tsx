import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "react-router-dom"
import { api } from "@/api/client"
import type { CompareResponse, PipelineVersion } from "@/api/types"
import { CompareStatsChart } from "@/components/shared/charts"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ClauseDiffTable } from "@/components/compare/clause-diff-table"
import { DeltaKpiGrid } from "@/components/compare/delta-kpi-grid"
import { VersionSelectorForm } from "@/components/compare/version-selector-form"
import { VersionStatsCard } from "@/components/compare/version-stats-card"

export function ComparePage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [versions, setVersions] = useState<PipelineVersion[]>([])
  const [v1, setV1] = useState(searchParams.get("v1") || "")
  const [v2, setV2] = useState(searchParams.get("v2") || "")
  const [result, setResult] = useState<CompareResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.listVersions().then((list) => {
      setVersions(list)
      const q1 = searchParams.get("v1")
      const q2 = searchParams.get("v2")

      if (q1 && q2) {
        setV1(q1)
        setV2(q2)
      } else if (list.length >= 2) {
        setV1(list[1].label)
        setV2(list[0].label)
      } else if (list.length === 1) {
        setV1(list[0].label)
      }
    })
  }, [searchParams])

  const compare = useCallback(async () => {
    if (!v1 || !v2 || v1 === v2) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.compareVersions(v1, v2)
      setResult(res)
      setSearchParams({ v1, v2 })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed")
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [v1, v2, setSearchParams])

  useEffect(() => {
    if (v1 && v2 && v1 !== v2) compare()
  }, [v1, v2, compare])

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Version Comparison & Diffing</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Side-by-side performance deltas, common-corpus normalization, and clause accuracy diffs.
        </p>
      </div>

      <VersionSelectorForm
        versions={versions}
        v1={v1}
        setV1={setV1}
        v2={v2}
        setV2={setV2}
        onCompare={compare}
        loading={loading}
      />

      {error && <p className="text-xs font-semibold text-destructive">{error}</p>}

      {result && (
        <div className="flex flex-col gap-5">
          <DeltaKpiGrid result={result} />

          <Card>
            <CardHeader className="p-4 pb-2 border-b border-border/50">
              <CardTitle className="text-xs font-bold text-foreground">Version Performance Ranking</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <ol className="list-decimal pl-4 space-y-1 text-xs">
                {result.ranking.map((r, i) => (
                  <li key={r.label}>
                    <strong>#{i + 1} {r.label}</strong> — Comp Score: <strong>{r.mean?.toFixed(2) ?? "—"}</strong>,
                    Extract Score: <strong>{r.extraction_score ? r.extraction_score.toFixed(1) : "—"}</strong>,
                    Exclusion: {(r.exclusion_rate * 100).toFixed(1)}%
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <ClauseDiffTable
            v1Label={result.v1.label}
            v2Label={result.v2.label}
            clauseDiffs={result.clause_diffs || []}
          />

          <CompareStatsChart
            v1Label={result.v1.label}
            v2Label={result.v2.label}
            v1Stats={result.v1.score_stats}
            v2Stats={result.v2.score_stats}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <VersionStatsCard version={result.v1} />
            <VersionStatsCard version={result.v2} />
          </div>
        </div>
      )}
    </div>
  )
}
