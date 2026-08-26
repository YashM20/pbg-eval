import { useCallback, useEffect, useState } from "react"
import { Activity, CheckCircle2, ShieldCheck, XCircle } from "lucide-react"

import { api } from "@/api/client"
import type { FaultSummaryResponse } from "@/api/types"
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

export function FaultTelemetry() {
  const [data, setData] = useState<FaultSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await api.getFaultSummary()
      setData(res)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const timer = setInterval(load, 5000)
    return () => clearInterval(timer)
  }, [load])

  if (loading && !data) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        Loading fault telemetry…
      </div>
    )
  }

  if (!data || (data.summary.length === 0 && data.recent_events.length === 0)) {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          <ShieldCheck className="size-4 text-emerald-600" />
          <span>✓ No anomalies or faults detected. All pipeline executions operating nominally.</span>
        </CardContent>
      </Card>
    )
  }

  const totalFaults = data.summary.reduce((acc, s) => acc + s.count, 0)
  const totalHealed = data.summary.reduce((acc, s) => acc + (s.healed || 0), 0)
  const healRate = totalFaults > 0 ? ((totalHealed / totalFaults) * 100).toFixed(1) : "100"

  return (
    <div className="flex flex-col gap-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card size="sm" className="bg-card border-border">
          <CardContent className="p-3.5 flex flex-col gap-0.5">
            <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-muted-foreground">
              Total Faults Intercepted
            </span>
            <div className="text-xl font-extrabold text-foreground">{totalFaults}</div>
          </CardContent>
        </Card>

        <Card size="sm" className="bg-card border-border">
          <CardContent className="p-3.5 flex flex-col gap-0.5">
            <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-muted-foreground">
              Auto-Healed Successfully
            </span>
            <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{totalHealed}</div>
          </CardContent>
        </Card>

        <Card size="sm" className="bg-card border-border">
          <CardContent className="p-3.5 flex flex-col gap-0.5">
            <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-muted-foreground">
              Remedy Healing Rate
            </span>
            <div className="text-xl font-extrabold text-teal-600 dark:text-teal-400">{healRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Fault Breakdown Table */}
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-border/50">
          <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
            <Activity className="size-3.5 text-teal-600" />
            Fault Classification Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fault Type</TableHead>
                <TableHead className="text-right">Occurrences</TableHead>
                <TableHead className="text-right">Auto-Healed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.summary.map((s) => (
                <TableRow key={s.fault_type}>
                  <TableCell className="font-mono text-xs font-semibold text-amber-600 dark:text-amber-400">
                    {s.fault_type}
                  </TableCell>
                  <TableCell className="text-right font-medium">{s.count}</TableCell>
                  <TableCell className="text-right font-bold text-emerald-600 dark:text-emerald-400">
                    {s.healed ?? 0}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Live Remediation Stream */}
      {data.recent_events.length > 0 && (
        <Card>
          <CardHeader className="p-4 pb-2 border-b border-border/50">
            <CardTitle className="text-xs font-bold text-foreground">
              Live Self-Healing Event Stream (Last 15)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Timestamp</TableHead>
                  <TableHead>Doc ID</TableHead>
                  <TableHead>Detected Fault</TableHead>
                  <TableHead>Applied Remedy</TableHead>
                  <TableHead className="text-center w-[100px]">Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_events.slice(0, 15).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-[0.7rem] text-muted-foreground">
                      {e.detected_at.slice(0, 19).replace("T", " ")}
                    </TableCell>
                    <TableCell className="font-mono text-xs font-medium">{e.doc_id || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-amber-600 dark:text-amber-400">
                      {e.fault_type}
                    </TableCell>
                    <TableCell className="text-xs text-foreground/80">{e.remedy_applied || "—"}</TableCell>
                    <TableCell className="text-center">
                      {e.success ? (
                        <Badge variant="success" className="text-[0.65rem] px-1.5 py-0 font-semibold gap-1">
                          <CheckCircle2 className="size-2.5" /> Healed
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[0.65rem] px-1.5 py-0 font-semibold gap-1">
                          <XCircle className="size-2.5" /> Failed
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
