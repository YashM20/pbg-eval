import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { PipelineVersion, ScoreStats } from "@/api/types"

const CHART_COLORS = {
  primary: "#f54e00",
  teal: "#0d9488",
  secondary: "#9fbbe0",
  amber: "#f59e0b",
  border: "var(--border)",
  text: "var(--color-ink)",
}

export function VersionMeanChart({ versions }: { versions: PipelineVersion[] }) {
  const data = versions
    .filter((v) => v.score_stats.mean != null)
    .map((v) => ({
      label: v.label,
      mean: v.score_stats.mean,
      extraction: v.extraction_score ?? 0,
    }))

  if (!data.length) return null

  return (
    <div className="w-full h-[260px] min-h-[240px] my-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888825" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
          <Bar dataKey="mean" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Comparison Score" />
          <Bar dataKey="extraction" fill={CHART_COLORS.teal} radius={[4, 4, 0, 0]} name="Extraction Score" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function VarianceChart({
  variance,
}: {
  variance: Record<string, ScoreStats>
}) {
  const data = Object.entries(variance).map(([doc_id, s]) => ({
    doc_id,
    stdev: s.stdev ?? 0,
    mean: s.mean ?? 0,
  }))

  if (!data.length) return null

  return (
    <div className="w-full h-[260px] min-h-[240px] my-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888825" />
          <XAxis dataKey="doc_id" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
          <Bar dataKey="mean" fill={CHART_COLORS.primary} name="Mean Score" radius={[4, 4, 0, 0]} />
          <Bar dataKey="stdev" fill={CHART_COLORS.amber} name="Standard Deviation" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function CompareStatsChart({
  v1Label,
  v2Label,
  v1Stats,
  v2Stats,
}: {
  v1Label: string
  v2Label: string
  v1Stats: ScoreStats
  v2Stats: ScoreStats
}) {
  const keys = ["mean", "stdev", "min", "median", "max"] as const
  const data = keys.map((key) => ({
    metric: key.toUpperCase(),
    [v1Label]: v1Stats[key] ?? 0,
    [v2Label]: v2Stats[key] ?? 0,
  }))

  return (
    <div className="w-full h-[260px] min-h-[240px] my-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888825" />
          <XAxis dataKey="metric" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--card)",
              borderColor: "var(--border)",
              borderRadius: "8px",
              fontSize: "12px",
            }}
          />
          <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }} />
          <Bar dataKey={v1Label} fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} />
          <Bar dataKey={v2Label} fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
