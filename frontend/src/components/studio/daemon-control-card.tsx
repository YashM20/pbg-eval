import { useState } from "react"
import { Activity, Loader2, Play, Power, Zap } from "lucide-react"

import { api } from "@/api/client"
import type { DaemonStatusResponse } from "@/api/types"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { FaultTelemetry } from "@/components/shared/fault-telemetry"

interface DaemonControlCardProps {
  daemonStatus: DaemonStatusResponse | null
  onReloadStatus: () => void
}

export function DaemonControlCard({
  daemonStatus,
  onReloadStatus,
}: DaemonControlCardProps) {
  const [intervalSec, setIntervalSec] = useState(3600)
  const [repeats, setRepeats] = useState(3)
  const [msg, setMsg] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  const isRunning = daemonStatus?.is_running ?? false

  const handleStart = async () => {
    setActing(true)
    setMsg(null)
    try {
      await api.startDaemon({ interval_seconds: intervalSec, repeats })
      setMsg("Autonomous evaluation daemon started.")
      onReloadStatus()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to start daemon")
    } finally {
      setActing(false)
    }
  }

  const handleStop = async () => {
    setActing(true)
    setMsg(null)
    try {
      await api.stopDaemon()
      setMsg("Autonomous evaluation daemon stopped.")
      onReloadStatus()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to stop daemon")
    } finally {
      setActing(false)
    }
  }

  const handleSweep = async () => {
    setActing(true)
    setMsg(null)
    try {
      await api.triggerSweep({ repeats })
      setMsg("Immediate evaluation sweep scheduled in background.")
      onReloadStatus()
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Failed to trigger sweep")
    } finally {
      setActing(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader className="p-4 pb-2 border-b border-border/50 flex flex-row items-center justify-between">
          <CardTitle className="text-xs font-bold text-foreground flex items-center gap-2">
            <Activity className="size-3.5 text-teal-600" />
            Continuous Evaluation Daemon Controls
          </CardTitle>
          <div className="flex items-center gap-2">
            {isRunning ? (
              <Badge variant="teal" className="gap-1 font-bold">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                Running (Continuous)
              </Badge>
            ) : (
              <Badge variant="outline">Stopped</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-3 flex flex-col gap-3.5">
          {msg && (
            <Alert className="py-2 px-3 text-xs">
              <AlertDescription className="text-xs">{msg}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="daemon-int">
                Sweep Interval (Seconds):
              </label>
              <Input
                id="daemon-int"
                type="number"
                min={60}
                value={intervalSec}
                onChange={(e) => setIntervalSec(Number(e.target.value))}
                disabled={isRunning}
                className="h-8 text-xs font-mono"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-foreground" htmlFor="daemon-reps">
                Repeats per Document:
              </label>
              <Input
                id="daemon-reps"
                type="number"
                min={1}
                max={20}
                value={repeats}
                onChange={(e) => setRepeats(Number(e.target.value))}
                disabled={isRunning}
                className="h-8 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground font-mono">
              {daemonStatus?.last_sweep_at
                ? `Last Sweep: ${daemonStatus.last_sweep_at} (${daemonStatus.total_sweeps} total sweeps)`
                : "No sweeps completed yet"}
            </span>

            <div className="flex items-center gap-2">
              {isRunning ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStop}
                  disabled={acting}
                  className="h-8 text-xs gap-1.5"
                >
                  {acting ? <Loader2 className="size-3.5 animate-spin" /> : <Power className="size-3.5" />}
                  Stop Daemon
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleStart}
                  disabled={acting}
                  className="h-8 text-xs gap-1.5 font-bold"
                >
                  {acting ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                  Start Daemon
                </Button>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={handleSweep}
                disabled={acting}
                className="h-8 text-xs gap-1.5 text-teal-600 border-teal-500/30 hover:bg-teal-500/10"
              >
                <Zap className="size-3.5" />
                Trigger Immediate Sweep
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <FaultTelemetry />
    </div>
  )
}
