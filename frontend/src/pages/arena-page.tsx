import { useEffect, useState } from "react"
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Award, Cpu } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export function ArenaPage() {
  const [models, setModels] = useState<any[]>([])
  const [benchmarks, setBenchmarks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch("/api/arena/models").then((r) => r.json()).catch(() => ({ models: [] })),
      fetch("/api/arena/benchmarks").then((r) => r.json()).catch(() => ({ benchmarks: [] })),
    ]).then(([mRes, bRes]) => {
      setModels(mRes.models || [])
      setBenchmarks(bRes.benchmarks || [])
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="p-8 text-center text-xs text-muted-foreground">Loading Multi-Model Arena…</div>
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">Multi-Model Tournament Arena</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Benchmark multiple local models side-by-side on identical PBG corpora to evaluate accuracy vs latency Pareto frontiers.
        </p>
      </div>

      {/* Available Models Grid */}
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-border/50">
          <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
            <Cpu className="size-3.5 text-teal-600" />
            Connected & Verified Local Model Tags ({models.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
            {models.map((m) => (
              <div key={m.name} className="flex flex-col gap-1 p-2.5 rounded-lg border border-border bg-muted/30">
                <span className="font-mono font-bold text-xs text-foreground truncate">{m.name}</span>
                <div className="flex items-center justify-between text-[0.7rem] text-muted-foreground font-mono mt-0.5">
                  <span>{m.parameter_size}</span>
                  <Badge variant="outline" className="text-[0.6rem] px-1 py-0">
                    {m.size_gb} GB
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model Benchmark Leaderboard */}
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-border/50">
          <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
            <Award className="size-3.5 text-primary" />
            Pareto Frontier Accuracy vs. Latency Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-3 flex flex-col gap-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-bold text-foreground">Model Architecture</TableHead>
                <TableHead className="text-right">Total Runs</TableHead>
                <TableHead className="text-right text-primary font-bold">Comp Score</TableHead>
                <TableHead className="text-right text-teal-600 dark:text-teal-400 font-bold">Extract Score</TableHead>
                <TableHead className="text-right">Mean Latency</TableHead>
                <TableHead className="text-right">Exclusion</TableHead>
                <TableHead className="text-center">Pareto Verdict</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {benchmarks.map((b) => (
                <TableRow key={b.model_name}>
                  <TableCell className="font-mono font-bold text-foreground">{b.model_name}</TableCell>
                  <TableCell className="text-right font-medium">{b.total_runs}</TableCell>
                  <TableCell className="text-right font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                    {b.comparison_score.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right font-extrabold text-sm text-teal-600 dark:text-teal-400">
                    {b.extraction_score.toFixed(1)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">
                    {b.mean_latency_seconds}s
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs">
                    {(b.exclusion_rate * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    {b.is_pareto_optimal ? (
                      <Badge variant="teal" className="text-[0.65rem] px-1.5 py-0 font-bold">
                        🏆 Pareto Optimal
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[0.65rem] px-1.5 py-0">
                        Standard
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pareto Visual Bar Chart */}
          {benchmarks.length > 0 && (
            <div className="w-full h-[260px] min-h-[240px] mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={benchmarks} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#88888825" />
                  <XAxis dataKey="model_name" tick={{ fontSize: 11 }} />
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
                  <Bar dataKey="comparison_score" fill="#f54e00" radius={[4, 4, 0, 0]} name="Accuracy Score (/10)" />
                  <Bar dataKey="extraction_score" fill="#0d9488" radius={[4, 4, 0, 0]} name="Extraction Score (/10)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
