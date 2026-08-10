import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { PipelineVersion, ScoreStats } from '../api/types'

const CHART = {
  ink: '#26251e',
  primary: '#f54e00',
  hairline: '#e6e5e0',
  read: '#9fbbe0',
  thinking: '#dfa88f',
}

export function VersionMeanChart({ versions }: { versions: PipelineVersion[] }) {
  const data = versions
    .filter((v) => v.score_stats.mean != null)
    .map((v) => ({ label: v.label, mean: v.score_stats.mean }))

  if (!data.length) return null

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={CHART.hairline} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART.ink, fontSize: 12 }} />
          <YAxis domain={[0, 10]} tick={{ fill: CHART.ink, fontSize: 12 }} />
          <Tooltip />
          <Bar dataKey="mean" fill={CHART.primary} radius={[4, 4, 0, 0]} name="Mean score" />
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
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={CHART.hairline} vertical={false} />
          <XAxis dataKey="doc_id" tick={{ fill: CHART.ink, fontSize: 11 }} />
          <YAxis tick={{ fill: CHART.ink, fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey="stdev" fill={CHART.thinking} name="Stdev" radius={[4, 4, 0, 0]} />
          <Bar dataKey="mean" fill={CHART.read} name="Mean" radius={[4, 4, 0, 0]} />
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
  const keys = ['mean', 'stdev', 'min', 'median', 'max'] as const
  const data = keys.map((key) => ({
    metric: key,
    [v1Label]: v1Stats[key] ?? 0,
    [v2Label]: v2Stats[key] ?? 0,
  }))

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={CHART.hairline} vertical={false} />
          <XAxis dataKey="metric" tick={{ fill: CHART.ink, fontSize: 12 }} />
          <YAxis tick={{ fill: CHART.ink, fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Bar dataKey={v1Label} fill={CHART.primary} radius={[4, 4, 0, 0]} />
          <Bar dataKey={v2Label} fill={CHART.read} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
